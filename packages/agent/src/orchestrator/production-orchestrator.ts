import { randomUUID } from 'node:crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createTTSProvider } from '@reelstack/tts';
import type { TTSConfig } from '@reelstack/tts';
import { groupWordsIntoCues } from '@reelstack/transcription';
import { normalizeAudioForWhisper, getAudioDuration, transcribeAudio } from '@reelstack/remotion/pipeline';
import { createRenderer } from '@reelstack/remotion/render';
import { ToolRegistry } from '../registry/tool-registry';
import { discoverTools } from '../registry/discovery';
import { planProduction, planComposition } from '../planner/production-planner';
import { generateAssets } from './asset-generator';
import { adjustTimeline } from './timeline-adjuster';
import { assembleComposition } from './composition-assembler';
import type { ProductionRequest, ProductionResult, ProductionStep, ComposeRequest, ProductionPlan, ShotPlan, EffectPlan, GeneratedAsset } from '../types';
import { createLogger } from '@reelstack/logger';

const log = createLogger('production-orchestrator');

/**
 * Main production orchestrator.
 * Flow: discover -> plan -> generate assets + TTS (parallel) -> adjust timeline -> assemble -> render
 */
export async function produce(request: ProductionRequest): Promise<ProductionResult> {
  // Input validation
  const MAX_SCRIPT_LENGTH = 50_000; // ~8000 words
  if (!request.script || request.script.length > MAX_SCRIPT_LENGTH) {
    throw new Error(`Script must be between 1 and ${MAX_SCRIPT_LENGTH} characters`);
  }

  const steps: ProductionStep[] = [];
  const onProgress = request.onProgress;

  // ── 1. DISCOVER TOOLS ──────────────────────────────────────
  onProgress?.('Discovering available tools...');
  const discoverStart = performance.now();

  const registry = new ToolRegistry();
  for (const tool of discoverTools()) {
    registry.register(tool);
  }
  await registry.discover();

  const manifest = registry.getToolManifest();
  steps.push({
    name: 'Tool discovery',
    durationMs: performance.now() - discoverStart,
    detail: manifest.summary,
  });

  log.info({ available: manifest.tools.filter((t) => t.available).map((t) => t.id) }, 'Tools discovered');

  // ── 2. PLAN PRODUCTION ─────────────────────────────────────
  onProgress?.('Planning production...');
  const planStart = performance.now();

  // Estimate duration from script length (~150 words/min for TTS)
  const wordCount = request.script.split(/\s+/).length;
  const durationEstimate = (wordCount / 150) * 60;

  const plan = await planProduction({
    script: request.script,
    durationEstimate,
    style: request.style ?? 'dynamic',
    toolManifest: manifest,
    primaryVideoUrl: request.primaryVideoUrl,
    layout: request.layout,
  });

  steps.push({
    name: 'Production planning',
    durationMs: performance.now() - planStart,
    detail: `${plan.shots.length} shots, ${plan.effects.length} effects, layout: ${plan.layout}`,
  });

  log.info({ shots: plan.shots.length, effects: plan.effects.length, primaryType: plan.primarySource.type }, 'Plan created');

  // ── 3. GENERATE ASSETS + TTS (parallel) ────────────────────
  onProgress?.('Generating assets and voiceover...');
  const genStart = performance.now();

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reelstack-agent-'));

  // Resolve remotion package dir for voiceover file placement
  // In the monorepo, @reelstack/remotion resolves to packages/remotion/
  const remotionPkgDir = resolveRemotionDir();

  // Run asset generation and TTS pipeline in parallel
  const [assets, ttsResult] = await Promise.all([
    generateAssets(plan, registry, onProgress),
    runTTSPipeline(request, tmpDir, onProgress),
  ]);

  steps.push({
    name: 'Asset generation',
    durationMs: performance.now() - genStart,
    detail: `${assets.length} assets generated`,
  });
  steps.push(...ttsResult.steps);

  // ── 4. ADJUST TIMELINE ─────────────────────────────────────
  const adjustedPlan = adjustTimeline(plan, ttsResult.audioDuration);

  // ── 5. ASSEMBLE COMPOSITION ────────────────────────────────
  onProgress?.('Assembling composition...');

  // Copy voiceover to public/ for Remotion
  const voiceoverFilename = `voiceover-${randomUUID()}.mp3`;
  const voiceoverPublicPath = path.join(remotionPkgDir, 'public', voiceoverFilename);
  fs.copyFileSync(ttsResult.voiceoverPath, voiceoverPublicPath);

  const bundleDir = process.env.REMOTION_BUNDLE_PATH ?? path.join(os.tmpdir(), 'remotion-bundle');
  let bundleVoiceoverPath: string | undefined;
  try {
    bundleVoiceoverPath = path.join(bundleDir, voiceoverFilename);
    fs.copyFileSync(ttsResult.voiceoverPath, bundleVoiceoverPath);
  } catch {
    bundleVoiceoverPath = undefined;
  }

  const props = assembleComposition({
    plan: adjustedPlan,
    assets,
    cues: ttsResult.cues,
    voiceoverFilename,
    brandPreset: request.brandPreset,
  });

  // ── 6. RENDER ──────────────────────────────────────────────
  onProgress?.('Rendering video...');
  const renderStart = performance.now();

  const outputPath = request.outputPath ?? path.join(os.tmpdir(), 'remotion-out', 'agent-reel.mp4');
  const renderer = createRenderer();
  const renderResult = await renderer.render(props as never, { outputPath });

  steps.push({
    name: 'Remotion render',
    durationMs: renderResult.durationMs,
    detail: `${outputPath} (${(renderResult.sizeBytes / 1024).toFixed(0)} KB)`,
  });

  // Cleanup
  try {
    if (fs.existsSync(voiceoverPublicPath)) fs.unlinkSync(voiceoverPublicPath);
    if (bundleVoiceoverPath && fs.existsSync(bundleVoiceoverPath)) fs.unlinkSync(bundleVoiceoverPath);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // cleanup errors are non-fatal
  }

  const totalMs = steps.reduce((sum, s) => sum + s.durationMs, 0);
  onProgress?.(`Done! ${(totalMs / 1000).toFixed(1)}s total`);

  return {
    outputPath,
    durationSeconds: ttsResult.audioDuration,
    plan: adjustedPlan,
    steps,
    generatedAssets: assets,
  };
}

/**
 * Compose pipeline: user provides all materials + descriptions, LLM arranges them.
 * No tool discovery, no asset generation — LLM decides what goes where.
 *
 * Use cases:
 * - Talking head + screenshoty → LLM decyduje kiedy co pokazać
 * - Kilka klipów video + obrazki → LLM montuje timeline
 * - Screen recording + talking head → LLM robi split/PiP layout
 */
export async function produceComposition(request: ComposeRequest): Promise<ProductionResult> {
  const MAX_SCRIPT_LENGTH = 50_000;
  if (!request.script || request.script.length > MAX_SCRIPT_LENGTH) {
    throw new Error(`Script must be between 1 and ${MAX_SCRIPT_LENGTH} characters`);
  }
  if (!request.assets || request.assets.length === 0) {
    throw new Error('At least one asset is required');
  }
  if (request.assets.length > 50) {
    throw new Error('Maximum 50 assets allowed');
  }

  const steps: ProductionStep[] = [];
  const onProgress = request.onProgress;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reelstack-compose-'));
  const remotionPkgDir = resolveRemotionDir();

  // ── 1. TTS (or use existing) ────────────────────────────────
  let voiceoverPath: string;
  let audioDuration: number;
  let cues: TTSPipelineResult['cues'];

  if (request.existingCues && request.existingVoiceoverPath) {
    onProgress?.('Using existing voiceover and cues...');
    voiceoverPath = request.existingVoiceoverPath;
    // Estimate duration from longest video asset or cues
    const maxCueEnd = Math.max(...request.existingCues.map((c) => c.endTime), 0);
    const maxAssetDuration = Math.max(...request.assets.map((a) => a.durationSeconds ?? 0), 0);
    audioDuration = Math.max(maxCueEnd, maxAssetDuration);
    cues = [...request.existingCues];
  } else if (request.existingVoiceoverPath) {
    onProgress?.('Transcribing existing voiceover...');
    voiceoverPath = request.existingVoiceoverPath;
    const rawBuf = fs.readFileSync(voiceoverPath);
    const ext = path.extname(voiceoverPath).replace('.', '') || 'mp3';
    const wavBuffer = normalizeAudioForWhisper(rawBuf, ext);
    audioDuration = getAudioDuration(rawBuf, ext);

    const transcription = await transcribeAudio(wavBuffer, {
      apiKey: request.whisper?.apiKey,
      language: request.tts?.language?.split('-')[0],
      text: request.script,
      durationSeconds: audioDuration,
    });

    cues = groupWordsIntoCues(transcription.words, {
      maxWordsPerCue: 6, maxDurationPerCue: 3, breakOnPunctuation: true,
    }, 'karaoke').map((c) => ({
      id: c.id, text: c.text, startTime: c.startTime, endTime: c.endTime,
      words: c.words?.map((w) => ({ text: w.text, startTime: w.startTime, endTime: w.endTime })),
      animationStyle: c.animationStyle,
    }));
  } else {
    const ttsResult = await runTTSPipeline({
      script: request.script,
      tts: request.tts,
      whisper: request.whisper,
    } as ProductionRequest, tmpDir, onProgress);
    voiceoverPath = ttsResult.voiceoverPath;
    audioDuration = ttsResult.audioDuration;
    cues = ttsResult.cues;
    steps.push(...ttsResult.steps);
  }

  // ── 2. LLM COMPOSITION PLANNING ────────────────────────────
  onProgress?.('LLM composing timeline...');
  const planStart = performance.now();

  const plan = await planComposition({
    script: request.script,
    durationEstimate: audioDuration,
    style: request.style ?? 'educational',
    assets: request.assets,
    layout: request.layout,
    directorNotes: request.directorNotes,
  });

  steps.push({
    name: 'Composition planning',
    durationMs: performance.now() - planStart,
    detail: `${plan.shots.length} shots, ${plan.effects.length} effects`,
  });

  // ── 3. ADJUST TIMELINE ──────────────────────────────────────
  const adjustedPlan = adjustTimeline(plan, audioDuration);

  // ── 4. BUILD ASSET MAP (resolve asset IDs → URLs) ───────────
  const assetMap = new Map(request.assets.map((a) => [a.id, a]));
  const resolvedAssets: GeneratedAsset[] = [];

  for (const shot of adjustedPlan.shots) {
    if (shot.visual.type === 'b-roll' && shot.visual.toolId === 'user-upload') {
      const userAsset = assetMap.get(shot.visual.searchQuery);
      if (userAsset) {
        resolvedAssets.push({
          toolId: 'user-upload',
          shotId: shot.id,
          url: userAsset.url,
          type: userAsset.type === 'image' ? 'stock-image' : 'stock-video',
          durationSeconds: userAsset.durationSeconds,
        });
      } else {
        log.warn({ assetId: shot.visual.searchQuery, shotId: shot.id }, 'Referenced asset not found');
      }
    }
  }

  // ── 5. ASSEMBLE ─────────────────────────────────────────────
  onProgress?.('Assembling composition...');
  const voiceoverFilename = `voiceover-${randomUUID()}.mp3`;
  const voiceoverPublicPath = path.join(remotionPkgDir, 'public', voiceoverFilename);
  fs.copyFileSync(voiceoverPath, voiceoverPublicPath);

  const bundleDir = process.env.REMOTION_BUNDLE_PATH ?? path.join(os.tmpdir(), 'remotion-bundle');
  let bundleVoiceoverPath: string | undefined;
  try {
    bundleVoiceoverPath = path.join(bundleDir, voiceoverFilename);
    fs.copyFileSync(voiceoverPath, bundleVoiceoverPath);
  } catch {
    bundleVoiceoverPath = undefined;
  }

  const props = assembleComposition({
    plan: adjustedPlan,
    assets: resolvedAssets,
    cues,
    voiceoverFilename,
    brandPreset: request.brandPreset,
  });

  // ── 6. RENDER ───────────────────────────────────────────────
  onProgress?.('Rendering video...');
  const renderStart = performance.now();
  const outputPath = request.outputPath ?? path.join(os.tmpdir(), 'remotion-out', 'composed-reel.mp4');
  const renderer = createRenderer();
  const renderResult = await renderer.render(props as never, { outputPath });
  steps.push({
    name: 'Remotion render',
    durationMs: renderResult.durationMs,
    detail: `${outputPath} (${(renderResult.sizeBytes / 1024).toFixed(0)} KB)`,
  });

  // Cleanup
  try {
    if (fs.existsSync(voiceoverPublicPath)) fs.unlinkSync(voiceoverPublicPath);
    if (bundleVoiceoverPath && fs.existsSync(bundleVoiceoverPath)) fs.unlinkSync(bundleVoiceoverPath);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch { /* cleanup non-fatal */ }

  const totalMs = steps.reduce((sum, s) => sum + s.durationMs, 0);
  onProgress?.(`Done! ${(totalMs / 1000).toFixed(1)}s total`);

  return { outputPath, durationSeconds: audioDuration, plan: adjustedPlan, steps, generatedAssets: resolvedAssets };
}

// ── TTS Pipeline (reused from reel-creator) ──────────────────

interface TTSPipelineResult {
  voiceoverPath: string;
  audioDuration: number;
  cues: Array<{
    id: string;
    text: string;
    startTime: number;
    endTime: number;
    words?: Array<{ text: string; startTime: number; endTime: number }>;
    animationStyle?: string;
  }>;
  steps: ProductionStep[];
}

async function runTTSPipeline(
  request: ProductionRequest,
  tmpDir: string,
  onProgress?: (msg: string) => void,
): Promise<TTSPipelineResult> {
  const steps: ProductionStep[] = [];

  // TTS
  onProgress?.('Generating voiceover...');
  const ttsStart = performance.now();

  const ttsConfig: TTSConfig = {
    provider: request.tts?.provider ?? 'edge-tts',
    apiKey: request.tts?.provider === 'elevenlabs'
      ? process.env.ELEVENLABS_API_KEY
      : request.tts?.provider === 'openai'
        ? process.env.OPENAI_API_KEY
        : undefined,
    defaultLanguage: request.tts?.language ?? 'pl-PL',
  };
  const ttsProvider = createTTSProvider(ttsConfig);
  const ttsResult = await ttsProvider.synthesize(request.script, {
    voice: request.tts?.voice,
    language: request.tts?.language,
  });

  const voiceoverPath = path.join(tmpDir, `voiceover.${ttsResult.format}`);
  fs.writeFileSync(voiceoverPath, ttsResult.audioBuffer);

  steps.push({
    name: 'TTS',
    durationMs: performance.now() - ttsStart,
    detail: `${ttsProvider.name}, ${(ttsResult.audioBuffer.length / 1024).toFixed(0)} KB`,
  });

  // Normalize audio
  onProgress?.('Normalizing audio...');
  const normStart = performance.now();

  const wavBuffer = normalizeAudioForWhisper(ttsResult.audioBuffer, ttsResult.format);
  const audioDuration = getAudioDuration(ttsResult.audioBuffer, ttsResult.format);

  steps.push({
    name: 'Audio normalization',
    durationMs: performance.now() - normStart,
    detail: `${audioDuration.toFixed(1)}s, 16kHz mono WAV`,
  });

  // Whisper transcription
  onProgress?.('Transcribing audio...');
  const whisperStart = performance.now();

  const transcription = await transcribeAudio(wavBuffer, {
    apiKey: request.whisper?.apiKey,
    language: request.tts?.language?.split('-')[0],
    text: request.script,
    durationSeconds: audioDuration,
  });

  steps.push({
    name: 'Whisper transcription',
    durationMs: performance.now() - whisperStart,
    detail: `${transcription.words.length} words`,
  });

  // Group into cues
  const cues = groupWordsIntoCues(transcription.words, {
    maxWordsPerCue: 6,
    maxDurationPerCue: 3,
    breakOnPunctuation: true,
  }, 'karaoke');

  return {
    voiceoverPath,
    audioDuration,
    cues: cues.map((c) => ({
      id: c.id,
      text: c.text,
      startTime: c.startTime,
      endTime: c.endTime,
      words: c.words?.map((w) => ({ text: w.text, startTime: w.startTime, endTime: w.endTime })),
      animationStyle: c.animationStyle,
    })),
    steps,
  };
}

function resolveRemotionDir(): string {
  // In the monorepo, the agent package lives at packages/agent/
  // and the remotion package at packages/remotion/
  // import.meta.dirname points to packages/agent/src/orchestrator/ (4 levels deep in monorepo)
  // 3x .. => packages/, then remotion => packages/remotion/
  return path.resolve(import.meta.dirname, '..', '..', '..', 'remotion');
}
