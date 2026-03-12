/**
 * n8n-explainer orchestrator.
 *
 * Pipeline: fetch workflow → LLM script → generate SVGs → TTS → transcribe → compose props → render.
 *
 * Uses shared base orchestrator for TTS/transcription/render steps.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fetchWorkflow } from '../generators/n8n-workflow-fetcher';
import type { N8nWorkflow } from '../generators/n8n-workflow-fetcher';
import { generateN8nScript } from '../generators/n8n-script-generator';
import type { N8nExplainerScript, N8nExplainerSection } from '../generators/n8n-script-generator';
import { generateWorkflowSvg } from '../generators/n8n-screenshot-generator';
import {
  runTTSPipeline,
  uploadVoiceover,
  renderVideo,
} from './base-orchestrator';
import type { TTSPipelineResult } from './base-orchestrator';
import type { ProductionStep, BrandPreset } from '../types';
import type { ScreenExplainerProps } from '@reelstack/remotion/schemas/screen-explainer-props';
import { createLogger } from '@reelstack/logger';
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
  svgs: string[];
  cues: TTSPipelineResult['cues'];
  voiceoverUrl: string;
  durationSeconds: number;
  backgroundColor?: string;
}

/**
 * Build ScreenExplainerProps from script + SVGs + cues.
 * Distributes timing evenly across sections.
 */
export function buildScreenExplainerProps(input: BuildPropsInput): ScreenExplainerProps {
  const { script, svgs, cues, voiceoverUrl, durationSeconds, backgroundColor } = input;
  const sectionCount = script.sections.length;
  const sectionDuration = durationSeconds / sectionCount;

  const sections = script.sections.map((section, i) => ({
    text: section.text,
    startTime: i * sectionDuration,
    endTime: (i + 1) * sectionDuration,
    svgContent: svgs[i] ?? '<svg></svg>',
    boardType: section.boardType,
  }));

  return {
    sections,
    cues,
    voiceoverUrl,
    durationSeconds,
    backgroundColor: backgroundColor ?? '#1a1a2e',
  };
}

// ── Full pipeline ─────────────────────────────────────────────

export async function produceN8nExplainer(request: N8nExplainerRequest): Promise<N8nExplainerResult> {
  const log = request.jobId ? baseLog.child({ jobId: request.jobId }) : baseLog;
  const steps: ProductionStep[] = [];
  const onProgress = request.onProgress;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reelstack-n8n-'));

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

  // ── 3. GENERATE SVG DIAGRAMS ───────────────────────────────
  onProgress?.('Generating workflow diagrams...');
  const svgStart = performance.now();

  const svgs = script.sections.map(section =>
    generateWorkflowSvg(workflow, {
      boardType: section.boardType,
      highlightNodes: section.highlightNodes,
      width: 1080,
      height: 1920,
    }),
  );

  steps.push({
    name: 'SVG generation',
    durationMs: performance.now() - svgStart,
    detail: `${svgs.length} diagrams`,
  });

  // ── 4. TTS + TRANSCRIPTION ─────────────────────────────────
  const fullScript = script.sections.map(s => s.text).join(' ');
  const ttsResult = await runTTSPipeline({
    script: fullScript,
    tts: request.tts,
    whisper: request.whisper,
    brandPreset: request.brandPreset,
  }, tmpDir, onProgress);
  steps.push(...ttsResult.steps);

  // ── 5. UPLOAD VOICEOVER ────────────────────────────────────
  onProgress?.('Uploading voiceover...');
  const voiceoverUrl = await uploadVoiceover(ttsResult.voiceoverPath);

  // ── 6. ASSEMBLE COMPOSITION PROPS ──────────────────────────
  onProgress?.('Assembling composition...');
  const props = buildScreenExplainerProps({
    script,
    svgs,
    cues: ttsResult.cues,
    voiceoverUrl,
    durationSeconds: ttsResult.audioDuration,
  });

  // ── 7. RENDER ──────────────────────────────────────────────
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
