/**
 * ai-tips orchestrator.
 *
 * Pipeline: LLM script → parallel video gen per tip → TTS → transcribe → compose props → render.
 *
 * Uses shared base orchestrator for TTS/transcription/render steps.
 * Uses VideoGenerator adapter for AI video generation (Veo3/Kling/Seedance).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { generateAiTipsScript } from '../generators/ai-tips-script-generator';
import type { AiTipsScript, AiTipsVariant } from '../generators/ai-tips-script-generator';
import { buildVideoPrompt } from '../generators/ai-tips-prompt-builder';
import type { VideoGenerator, VideoGeneratorResult } from '../generators/video-generator';
import {
  runTTSPipeline,
  uploadVoiceover,
  renderVideo,
} from './base-orchestrator';
import type { TTSPipelineResult } from './base-orchestrator';
import type { ProductionStep, BrandPreset } from '../types';
import type { VideoClipProps } from '@reelstack/remotion/schemas/video-clip-props';
import { createLogger } from '@reelstack/logger';

const baseLog = createLogger('ai-tips');

// ── Types ─────────────────────────────────────────────────────

export interface AiTipsRequest {
  jobId?: string;
  topic: string;
  language?: string;
  numberOfTips?: number;
  variant?: AiTipsVariant;
  provider?: string;
  tts?: {
    provider?: 'edge-tts' | 'elevenlabs' | 'openai';
    voice?: string;
    language?: string;
  };
  whisper?: {
    provider?: 'openrouter' | 'cloudflare' | 'ollama';
    apiKey?: string;
  };
  brandPreset?: BrandPreset;
  /** LLM call function - injected for flexibility */
  llmCall: (prompt: string) => Promise<string>;
  /** VideoGenerator for creating tip clips */
  videoGenerator: VideoGenerator;
  /** Music URL (optional background music) */
  musicUrl?: string;
  musicVolume?: number;
  outputPath?: string;
  onProgress?: (step: string) => void;
}

export interface AiTipsResult {
  outputPath: string;
  durationSeconds: number;
  script: AiTipsScript;
  steps: ProductionStep[];
}

// ── Props builder (pure, testable) ────────────────────────────

export interface BuildVideoClipPropsInput {
  script: AiTipsScript;
  clipResults: Array<{ videoUrl: string; durationSeconds?: number }>;
  cues: TTSPipelineResult['cues'];
  voiceoverUrl: string;
  durationSeconds: number;
  musicUrl?: string;
  musicVolume?: number;
}

/**
 * Build VideoClipProps from script + generated clips + cues.
 * Distributes timing evenly across clips.
 */
export function buildVideoClipProps(input: BuildVideoClipPropsInput): VideoClipProps {
  const { script, clipResults, cues, voiceoverUrl, durationSeconds, musicUrl, musicVolume } = input;
  const clipCount = clipResults.length;
  const clipDuration = durationSeconds / clipCount;

  const clips = clipResults.map((result, i) => ({
    url: result.videoUrl,
    startTime: i * clipDuration,
    endTime: (i + 1) * clipDuration,
    transition: (i === 0 ? 'none' : 'crossfade') as 'none' | 'crossfade',
    transitionDurationMs: i === 0 ? 0 : 300,
  }));

  return {
    clips,
    cues,
    voiceoverUrl,
    musicUrl,
    musicVolume: musicVolume ?? 0.15,
    durationSeconds,
    backgroundColor: '#000000',
  };
}

// ── Full pipeline ─────────────────────────────────────────────

export async function produceAiTips(request: AiTipsRequest): Promise<AiTipsResult> {
  const log = request.jobId ? baseLog.child({ jobId: request.jobId }) : baseLog;
  const steps: ProductionStep[] = [];
  const onProgress = request.onProgress;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reelstack-ai-tips-'));

  // ── 1. GENERATE SCRIPT ─────────────────────────────────────
  onProgress?.('Generating ai-tips script...');
  const scriptStart = performance.now();

  const script = await generateAiTipsScript({
    topic: request.topic,
    llmCall: request.llmCall,
    language: request.language,
    numberOfTips: request.numberOfTips,
    variant: request.variant,
  });

  steps.push({
    name: 'Script generation',
    durationMs: performance.now() - scriptStart,
    detail: `${script.tips.length} tips`,
  });
  log.info({ tips: script.tips.length }, 'Script generated');

  // ── 2. GENERATE VIDEO CLIPS (parallel with concurrency limit) ──
  onProgress?.('Generating video clips...');
  const genStart = performance.now();

  const clipPromises = script.tips.map((tip, i) => {
    const prompt = buildVideoPrompt(tip, { provider: request.provider });
    return request.videoGenerator.generate({
      prompt,
      duration: 8, // ~8s per tip
      aspectRatio: '9:16',
    }).then((result) => {
      onProgress?.(`Clip ${i + 1}/${script.tips.length} generated`);
      return result;
    });
  });

  // Run with allSettled to get partial results even if some fail
  const settled = await Promise.allSettled(clipPromises);
  const clipResults: VideoGeneratorResult[] = [];
  const failedClips: number[] = [];

  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    if (result.status === 'fulfilled') {
      clipResults.push(result.value);
    } else {
      failedClips.push(i);
      log.warn({ tipIndex: i, error: result.reason }, 'Clip generation failed');
    }
  }

  if (clipResults.length === 0) {
    throw new Error('All video clip generations failed');
  }

  steps.push({
    name: 'Video generation',
    durationMs: performance.now() - genStart,
    detail: `${clipResults.length}/${script.tips.length} clips (${failedClips.length} failed)`,
  });

  // ── 3. TTS + TRANSCRIPTION ─────────────────────────────────
  // Build full dialog script from successful tips only
  const successfulTips = script.tips.filter((_, i) => !failedClips.includes(i));
  const fullDialog = [script.hook, ...successfulTips.map(t => t.dialog), script.cta]
    .filter(Boolean)
    .join(' ');

  const ttsResult = await runTTSPipeline({
    script: fullDialog,
    tts: request.tts,
    whisper: request.whisper,
    brandPreset: request.brandPreset,
  }, tmpDir, onProgress);
  steps.push(...ttsResult.steps);

  // ── 4. UPLOAD VOICEOVER ────────────────────────────────────
  onProgress?.('Uploading voiceover...');
  const voiceoverUrl = await uploadVoiceover(ttsResult.voiceoverPath);

  // ── 5. ASSEMBLE COMPOSITION PROPS ──────────────────────────
  onProgress?.('Assembling composition...');
  const props = buildVideoClipProps({
    script: { ...script, tips: successfulTips },
    clipResults,
    cues: ttsResult.cues,
    voiceoverUrl,
    durationSeconds: ttsResult.audioDuration,
    musicUrl: request.musicUrl,
    musicVolume: request.musicVolume,
  });

  // ── 6. RENDER ──────────────────────────────────────────────
  const { outputPath, step: renderStep } = await renderVideo(
    { ...props, compositionId: 'VideoClip' } as unknown as Record<string, unknown>,
    request.outputPath,
    onProgress,
  );
  steps.push(renderStep);

  // Cleanup
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (err) { log.warn({ tmpDir, err }, 'Cleanup failed'); }

  const totalMs = steps.reduce((sum, s) => sum + s.durationMs, 0);
  onProgress?.(`Done! ${(totalMs / 1000).toFixed(1)}s total`);

  return {
    outputPath,
    durationSeconds: ttsResult.audioDuration,
    script,
    steps,
  };
}
