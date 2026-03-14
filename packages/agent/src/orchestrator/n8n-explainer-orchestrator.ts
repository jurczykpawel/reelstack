/**
 * n8n-explainer orchestrator.
 *
 * Pipeline: fetch workflow → LLM script → screenshot → TTS → transcribe → compose props → render.
 *
 * Uses shared base orchestrator for TTS/transcription/render steps.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'node:crypto';
import { fetchWorkflow } from '../generators/n8n-workflow-fetcher';
import type { N8nWorkflow } from '../generators/n8n-workflow-fetcher';
import { generateN8nScript } from '../generators/n8n-script-generator';
import type { N8nExplainerScript } from '../generators/n8n-script-generator';
import { computeKenBurnsParams } from '../generators/n8n-screenshot-generator';
import type { N8nScreenshotProvider } from '../generators/n8n-screenshot-provider';
import { N8nLocalDockerProvider, N8nPublicPageProvider } from '../generators/n8n-screenshot-provider';
import {
  runTTSPipeline,
  uploadVoiceover,
  renderVideo,
} from './base-orchestrator';
import type { TTSPipelineResult } from './base-orchestrator';
import type { ProductionStep, BrandPreset } from '../types';
import type { ScreenExplainerProps } from '@reelstack/remotion/schemas/screen-explainer-props';
import { createLogger } from '@reelstack/logger';
import { createStorage } from '@reelstack/storage';
import { detectLanguage } from '../utils/detect-language';

const baseLog = createLogger('n8n-explainer');

// ── Types ─────────────────────────────────────────────────────

export interface N8nExplainerRequest {
  jobId?: string;
  workflowUrl: string;
  language?: string;
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
  /** LLM call function - injected for flexibility (use Claude, GPT, etc.) */
  llmCall: (prompt: string) => Promise<string>;
  /** Screenshot provider - injected for swappable infra (default: n8n.io public page) */
  screenshotProvider?: N8nScreenshotProvider;
  outputPath?: string;
  onProgress?: (step: string) => void;
}

export interface N8nExplainerResult {
  outputPath: string;
  durationSeconds: number;
  workflow: N8nWorkflow;
  script: N8nExplainerScript;
  steps: ProductionStep[];
}

// ── Props builder (pure, testable) ────────────────────────────

export interface BuildPropsInput {
  script: N8nExplainerScript;
  workflow: N8nWorkflow;
  screenshotUrl: string;
  screenshotWidth: number;
  screenshotHeight: number;
  cues: TTSPipelineResult['cues'];
  voiceoverUrl: string;
  durationSeconds: number;
  backgroundColor?: string;
}

/**
 * Build ScreenExplainerProps from script + screenshot + cues.
 * Computes Ken Burns params from node positions and distributes timing evenly.
 */
export function buildScreenExplainerProps(input: BuildPropsInput): ScreenExplainerProps {
  const { script, workflow, screenshotUrl, screenshotWidth, screenshotHeight, cues, voiceoverUrl, durationSeconds, backgroundColor } = input;
  const sectionCount = script.sections.length;
  const sectionDuration = durationSeconds / sectionCount;

  const sections = script.sections.map((section, i) => ({
    text: section.text,
    startTime: i * sectionDuration,
    endTime: (i + 1) * sectionDuration,
    boardType: section.boardType,
    kenBurns: computeKenBurnsParams(workflow, section),
  }));

  return {
    screenshotUrl,
    screenshotWidth,
    screenshotHeight,
    sections,
    cues,
    voiceoverUrl,
    durationSeconds,
    backgroundColor: backgroundColor ?? '#1a1a2e',
  };
}

// ── Default screenshot provider ──────────────────────────────

/**
 * Creates the best available screenshot provider.
 * Prefers local Docker (4K) when N8N_EMAIL + N8N_PASSWORD are set.
 * Falls back to n8n.io public page (low-res).
 */
function createDefaultScreenshotProvider(): N8nScreenshotProvider {
  if (process.env.N8N_EMAIL && process.env.N8N_PASSWORD) {
    return new N8nLocalDockerProvider();
  }
  baseLog.warn('N8N_EMAIL/N8N_PASSWORD not set, falling back to low-res n8n.io public page screenshots');
  return new N8nPublicPageProvider();
}

// ── Screenshot upload helper ──────────────────────────────────

async function uploadScreenshot(buffer: Buffer, ttlSeconds = 7200): Promise<string> {
  const key = `screenshots/n8n-${randomUUID()}.png`;
  const storage = await createStorage();
  await storage.upload(buffer, key);
  return storage.getSignedUrl(key, ttlSeconds);
}

// ── Full pipeline ─────────────────────────────────────────────

export async function produceN8nExplainer(request: N8nExplainerRequest): Promise<N8nExplainerResult> {
  const log = request.jobId ? baseLog.child({ jobId: request.jobId }) : baseLog;
  const steps: ProductionStep[] = [];
  const onProgress = request.onProgress;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reelstack-n8n-'));
  const screenshotProvider = request.screenshotProvider ?? createDefaultScreenshotProvider();

  // ── 1. FETCH WORKFLOW ──────────────────────────────────────
  onProgress?.('Fetching n8n workflow...');
  const fetchStart = performance.now();

  const workflow = await fetchWorkflow(request.workflowUrl);

  steps.push({
    name: 'Workflow fetch',
    durationMs: performance.now() - fetchStart,
    detail: `"${workflow.name}" (${workflow.nodes.length} nodes)`,
  });
  log.info({ workflowId: workflow.id, name: workflow.name, nodes: workflow.nodes.length }, 'Workflow fetched');

  // ── 2. GENERATE SCRIPT ─────────────────────────────────────
  onProgress?.('Generating narration script...');
  const scriptStart = performance.now();

  const script = await generateN8nScript(workflow, {
    llmCall: request.llmCall,
    language: detectLanguage(request.language, request.tts?.language),
  });

  steps.push({
    name: 'Script generation',
    durationMs: performance.now() - scriptStart,
    detail: `${script.sections.length} sections, ~${script.totalDuration}s`,
  });
  log.info({ sections: script.sections.length, totalDuration: script.totalDuration }, 'Script generated');

  // ── 3. CAPTURE SCREENSHOT ──────────────────────────────────
  onProgress?.('Capturing workflow screenshot...');
  const ssStart = performance.now();

  const screenshotResult = await screenshotProvider.capture(workflow);

  steps.push({
    name: 'Screenshot capture',
    durationMs: performance.now() - ssStart,
    detail: `${screenshotResult.width}x${screenshotResult.height}`,
  });
  log.info({ width: screenshotResult.width, height: screenshotResult.height }, 'Screenshot captured');

  // ── 4. UPLOAD SCREENSHOT ───────────────────────────────────
  onProgress?.('Uploading screenshot...');
  const screenshotUrl = await uploadScreenshot(screenshotResult.buffer);

  // ── 5. TTS + TRANSCRIPTION ─────────────────────────────────
  const fullScript = script.sections.map(s => s.text).join(' ');
  const detectedLang = detectLanguage(request.language, request.tts?.language);
  const ttsLang = detectedLang.includes('-') ? detectedLang : `${detectedLang}-${detectedLang.toUpperCase()}`;
  const ttsResult = await runTTSPipeline({
    script: fullScript,
    tts: { ...request.tts, language: request.tts?.language ?? ttsLang },
    whisper: request.whisper,
    brandPreset: request.brandPreset,
  }, tmpDir, onProgress);
  steps.push(...ttsResult.steps);

  // ── 6. UPLOAD VOICEOVER ────────────────────────────────────
  onProgress?.('Uploading voiceover...');
  const voiceoverUrl = await uploadVoiceover(ttsResult.voiceoverPath);

  // ── 7. ASSEMBLE COMPOSITION PROPS ──────────────────────────
  onProgress?.('Assembling composition...');
  const props = buildScreenExplainerProps({
    script,
    workflow,
    screenshotUrl,
    screenshotWidth: screenshotResult.width,
    screenshotHeight: screenshotResult.height,
    cues: ttsResult.cues,
    voiceoverUrl,
    durationSeconds: ttsResult.audioDuration,
  });

  // ── 8. RENDER ──────────────────────────────────────────────
  const { outputPath, step: renderStep } = await renderVideo(
    { ...props, compositionId: 'ScreenExplainer' } as unknown as Record<string, unknown>,
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
    workflow,
    script,
    steps,
  };
}
