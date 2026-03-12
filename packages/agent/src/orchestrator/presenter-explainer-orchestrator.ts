/**
 * presenter-explainer orchestrator.
 *
 * Pipeline: LLM script → board images (parallel) + avatar video → TTS → transcribe → compose → render.
 *
 * Layout: top=board images, bottom=avatar video, middle=captions.
 * Uses shared base orchestrator for TTS/transcription/render steps.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { generatePresenterScript } from '../generators/presenter-script-generator';
import type { PresenterScript, PresenterStyle } from '../generators/presenter-script-generator';
import { resolveBoardImage } from '../generators/board-image-resolver';
import type { BoardImageResolverDeps } from '../generators/board-image-resolver';
import { getPersona } from '../config/presenter-personas';
import type { VideoGenerator } from '../generators/video-generator';
import {
  runTTSPipeline,
  uploadVoiceover,
  renderVideo,
} from './base-orchestrator';
import type { TTSPipelineResult } from './base-orchestrator';
import type { ProductionStep, BrandPreset } from '../types';
import type { PresenterExplainerProps } from '@reelstack/remotion/schemas/presenter-explainer-props';
import { createLogger } from '@reelstack/logger';

const baseLog = createLogger('presenter-explainer');

// ── Types ─────────────────────────────────────────────────────

export interface PresenterExplainerRequest {
  jobId?: string;
  topic: string;
  persona?: string;
  style?: PresenterStyle;
  language?: string;
  targetDuration?: number;
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
  /** LLM call function */
  llmCall: (prompt: string) => Promise<string>;
  /** VideoGenerator for avatar video */
  videoGenerator: VideoGenerator;
  /** Board image resolver dependencies */
  imageResolverDeps: BoardImageResolverDeps;
  /** Music URL (optional background music) */
  musicUrl?: string;
  musicVolume?: number;
  outputPath?: string;
  onProgress?: (step: string) => void;
}

export interface PresenterExplainerResult {
  outputPath: string;
  durationSeconds: number;
  script: PresenterScript;
  steps: ProductionStep[];
}

// ── Props builder (pure, testable) ────────────────────────────

export interface BuildPresenterPropsInput {
  script: PresenterScript;
  boardImageUrls: string[];
  avatarVideoUrl: string;
  cues: TTSPipelineResult['cues'];
  voiceoverUrl: string;
  durationSeconds: number;
  musicUrl?: string;
  musicVolume?: number;
  boardHeightPercent?: number;
}

/**
 * Build PresenterExplainerProps from script + board images + avatar + cues.
 */
export function buildPresenterExplainerProps(input: BuildPresenterPropsInput): PresenterExplainerProps {
  const {
    script, boardImageUrls, avatarVideoUrl, cues,
    voiceoverUrl, durationSeconds, musicUrl, musicVolume,
    boardHeightPercent,
  } = input;

  const sectionCount = boardImageUrls.length;
  const sectionDuration = durationSeconds / sectionCount;

  const boardSections = boardImageUrls.map((imageUrl, i) => ({
    imageUrl,
    startTime: i * sectionDuration,
    endTime: (i + 1) * sectionDuration,
    transition: (i === 0 ? 'none' : 'crossfade') as 'none' | 'crossfade',
    transitionDurationMs: i === 0 ? 0 : 300,
  }));

  return {
    boardSections,
    avatarVideoUrl,
    cues,
    voiceoverUrl,
    musicUrl,
    musicVolume: musicVolume ?? 0.15,
    durationSeconds,
    backgroundColor: '#0a0a14',
    boardHeightPercent: boardHeightPercent ?? 50,
  };
}

// ── Full pipeline ─────────────────────────────────────────────

export async function producePresenterExplainer(
  request: PresenterExplainerRequest,
): Promise<PresenterExplainerResult> {
  const log = request.jobId ? baseLog.child({ jobId: request.jobId }) : baseLog;
  const steps: ProductionStep[] = [];
  const onProgress = request.onProgress;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reelstack-presenter-'));

  // Resolve persona if specified
  const persona = request.persona ? getPersona(request.persona) : undefined;
  const ttsVoice = request.tts?.voice ?? persona?.defaultVoice;

  // ── 1. GENERATE SCRIPT ─────────────────────────────────────
  onProgress?.('Generating presenter script...');
  const scriptStart = performance.now();

  const script = await generatePresenterScript({
    topic: request.topic,
    llmCall: request.llmCall,
    persona: request.persona,
    style: request.style,
    language: request.language,
    targetDuration: request.targetDuration,
  });

  steps.push({
    name: 'Script generation',
    durationMs: performance.now() - scriptStart,
    detail: `${script.sections.length} sections, ~${script.totalDuration}s`,
  });
  log.info({ sections: script.sections.length }, 'Script generated');

  // ── 2. GENERATE BOARD IMAGES + AVATAR VIDEO (parallel) ─────
  onProgress?.('Generating board images and avatar...');
  const genStart = performance.now();

  // Board images: resolve all in parallel
  const boardPromises = script.sections.map((section, i) =>
    resolveBoardImage(section.boardImageSpec, request.imageResolverDeps)
      .then(url => {
        onProgress?.(`Board image ${i + 1}/${script.sections.length} ready`);
        return url;
      }),
  );

  // Avatar video: generate using VideoGenerator
  const avatarPrompt = persona?.avatarPrompt
    ?? 'A friendly presenter in a modern studio, talking to camera, medium shot, warm lighting';
  const avatarPromise = request.videoGenerator.generate({
    prompt: avatarPrompt,
    duration: request.targetDuration ?? 60,
    aspectRatio: '9:16',
  });

  // Wait for all
  const [boardResults, avatarResult] = await Promise.all([
    Promise.allSettled(boardPromises),
    avatarPromise,
  ]);

  const boardImageUrls: string[] = [];
  for (let i = 0; i < boardResults.length; i++) {
    const result = boardResults[i];
    if (result.status === 'fulfilled') {
      boardImageUrls.push(result.value);
    } else {
      log.warn({ sectionIndex: i, error: result.reason }, 'Board image generation failed, using placeholder');
      boardImageUrls.push("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1080' height='960'%3E%3Crect width='100%25' height='100%25' fill='%23333'/%3E%3C/svg%3E"); // placeholder - will show dark background
    }
  }

  steps.push({
    name: 'Asset generation',
    durationMs: performance.now() - genStart,
    detail: `${boardImageUrls.filter(Boolean).length} board images + avatar video`,
  });

  // ── 3. TTS + TRANSCRIPTION ─────────────────────────────────
  const fullScript = [script.hook, ...script.sections.map(s => s.text), script.cta]
    .filter(Boolean)
    .join(' ');

  const ttsResult = await runTTSPipeline({
    script: fullScript,
    tts: {
      ...request.tts,
      voice: ttsVoice,
    },
    whisper: request.whisper,
    brandPreset: request.brandPreset,
  }, tmpDir, onProgress);
  steps.push(...ttsResult.steps);

  // ── 4. UPLOAD VOICEOVER ────────────────────────────────────
  onProgress?.('Uploading voiceover...');
  const voiceoverUrl = await uploadVoiceover(ttsResult.voiceoverPath);

  // ── 5. ASSEMBLE COMPOSITION PROPS ──────────────────────────
  onProgress?.('Assembling composition...');
  const props = buildPresenterExplainerProps({
    script,
    boardImageUrls,
    avatarVideoUrl: avatarResult.videoUrl,
    cues: ttsResult.cues,
    voiceoverUrl,
    durationSeconds: ttsResult.audioDuration,
    musicUrl: request.musicUrl,
    musicVolume: request.musicVolume,
  });

  // ── 6. RENDER ──────────────────────────────────────────────
  const { outputPath, step: renderStep } = await renderVideo(
    { ...props, compositionId: 'PresenterExplainer' } as unknown as Record<string, unknown>,
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
