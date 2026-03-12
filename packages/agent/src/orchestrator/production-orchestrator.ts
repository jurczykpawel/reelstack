import fs from 'fs';
import os from 'os';
import path from 'path';
import { normalizeAudioForWhisper, getAudioDuration, transcribeAudio } from '@reelstack/remotion/pipeline';
import { groupWordsIntoCues } from '@reelstack/transcription';
import { ToolRegistry } from '../registry/tool-registry';
import { discoverTools } from '../registry/discovery';
import { planProduction, planComposition } from '../planner/production-planner';
import { generateAssets } from './asset-generator';
import { assembleComposition } from './composition-assembler';
import { validatePlan } from '../planner/plan-validator';
import { supervisePlan } from '../planner/plan-supervisor';
import {
  buildTimingReference,
  resolvePresetConfig,
  runTTSPipeline,
  uploadVoiceover,
  renderVideo,
} from './base-orchestrator';
import type { TTSPipelineResult } from './base-orchestrator';
import type { ProductionRequest, ProductionResult, ProductionStep, ComposeRequest, BrandPreset, ProductionPlan, ShotPlan, EffectPlan, GeneratedAsset } from '../types';
import { selectMontageProfile } from '../planner/montage-profile';
import { createLogger } from '@reelstack/logger';

const baseLog = createLogger('production-orchestrator');

/**
 * Main production orchestrator.
 * Flow: discover + TTS (parallel) -> plan with exact timestamps -> generate assets -> assemble -> render
 *
 * IMPORTANT: Audio/transcription runs BEFORE planning so the director (LLM) receives
 * exact speech timestamps and plans to them. No timeline adjustment needed.
 */
export async function produce(request: ProductionRequest): Promise<ProductionResult> {
  // Input validation
  const MAX_SCRIPT_LENGTH = 50_000; // ~8000 words
  if (!request.script || request.script.length > MAX_SCRIPT_LENGTH) {
    throw new Error(`Script must be between 1 and ${MAX_SCRIPT_LENGTH} characters`);
  }

  // Create job-scoped logger so all logs from this pipeline run are correlated
  const log = request.jobId ? baseLog.child({ jobId: request.jobId }) : baseLog;

  const steps: ProductionStep[] = [];
  const onProgress = request.onProgress;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reelstack-agent-'));

  // ── 1. DISCOVER TOOLS + TTS (parallel) ─────────────────────
  // Both are independent — run in parallel to save time.
  onProgress?.('Discovering tools and generating voiceover...');
  const parallelStart = performance.now();

  const registryPromise = (async () => {
    const registry = new ToolRegistry();
    for (const tool of discoverTools()) {
      registry.register(tool);
    }
    await registry.discover();
    return registry;
  })();

  const [registry, ttsResult] = await Promise.all([
    registryPromise,
    runTTSPipeline(request, tmpDir, onProgress),
  ]);

  const manifest = registry.getToolManifest();
  steps.push({
    name: 'Tool discovery + TTS',
    durationMs: performance.now() - parallelStart,
    detail: manifest.summary,
  });
  steps.push(...ttsResult.steps);

  log.info({ available: manifest.tools.filter((t) => t.available).map((t) => t.id) }, 'Tools discovered');

  // ── 2. BUILD TIMING REFERENCE ──────────────────────────────
  // Director gets exact speech timestamps from Whisper transcription
  const timingReference = buildTimingReference(ttsResult.transcriptionWords);

  // ── 2b. SELECT MONTAGE PROFILE ────────────────────────────
  const montageProfile = selectMontageProfile(request.script, request.montageProfile);
  log.info({ profileId: montageProfile.id, profileName: montageProfile.name }, 'Selected montage profile');

  // ── 3. PLAN PRODUCTION (with exact timestamps) ─────────────
  onProgress?.('Planning production (with exact speech timing)...');
  const planStart = performance.now();

  let plan = await planProduction({
    script: request.script,
    durationEstimate: ttsResult.audioDuration,
    style: request.style ?? 'dynamic',
    toolManifest: manifest,
    primaryVideoUrl: request.primaryVideoUrl,
    layout: request.layout,
    timingReference,
    montageProfile,
  });

  steps.push({
    name: 'Production planning',
    durationMs: performance.now() - planStart,
    detail: `${plan.shots.length} shots, ${plan.effects.length} effects, layout: ${plan.layout}`,
  });

  log.info({
    shots: plan.shots.length,
    effects: plan.effects.length,
    primaryType: plan.primarySource.type,
    shotDetails: plan.shots.map(s => ({
      id: s.id,
      startTime: s.startTime,
      endTime: s.endTime,
      duration: +(s.endTime - s.startTime).toFixed(1),
      type: s.visual.type,
      toolId: 'toolId' in s.visual ? s.visual.toolId : undefined,
      prompt: 'prompt' in s.visual ? (s.visual.prompt as string) : undefined,
      searchQuery: 'searchQuery' in s.visual ? s.visual.searchQuery : undefined,
    })),
    reasoning: plan.reasoning,
  }, 'Plan created');

  // Log full prompts separately for easy debugging
  for (const s of plan.shots) {
    if ('prompt' in s.visual && s.visual.prompt) {
      log.info({ shotId: s.id, toolId: (s.visual as { toolId: string }).toolId, prompt: s.visual.prompt }, 'Shot prompt');
    }
  }

  // ── 3b. SUPERVISOR REVIEW ──────────────────────────────────
  onProgress?.('Supervisor reviewing plan...');
  const supervision = await supervisePlan({
    plan,
    script: request.script,
    audioDuration: ttsResult.audioDuration,
    style: request.style ?? 'dynamic',
    toolManifest: manifest,
    timingReference,
    montageProfile,
  });
  plan = supervision.plan;
  log.info({
    approved: supervision.approved,
    iterations: supervision.iterations,
    reviews: supervision.reviews,
  }, 'Supervisor review complete');

  // ── 4. GENERATE ASSETS ─────────────────────────────────────
  onProgress?.('Generating visual assets...');
  const genStart = performance.now();

  const assets = await generateAssets(plan, registry, onProgress);

  steps.push({
    name: 'Asset generation',
    durationMs: performance.now() - genStart,
    detail: `${assets.length} assets generated`,
  });

  // ── 5. VALIDATE & ASSEMBLE COMPOSITION ─────────────────────
  onProgress?.('Validating plan...');
  const validation = validatePlan(plan, ttsResult.audioDuration);
  if (validation.issues.length > 0) {
    log.info({ issues: validation.issues }, 'Plan validation issues found and auto-fixed');
    plan = validation.fixedPlan;
  }

  onProgress?.('Assembling composition...');

  const voiceoverUrl = await uploadVoiceover(ttsResult.voiceoverPath);

  const props = assembleComposition({
    plan,
    assets,
    cues: ttsResult.cues,
    voiceoverFilename: voiceoverUrl,
    brandPreset: request.brandPreset,
  });

  // ── 6. RENDER ──────────────────────────────────────────────
  const { outputPath, step: renderStep } = await renderVideo(
    props as unknown as Record<string, unknown>,
    request.outputPath,
    onProgress,
  );
  steps.push(renderStep);

  // Cleanup
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // cleanup errors are non-fatal
  }

  const totalMs = steps.reduce((sum, s) => sum + s.durationMs, 0);
  onProgress?.(`Done! ${(totalMs / 1000).toFixed(1)}s total`);

  return {
    outputPath,
    durationSeconds: ttsResult.audioDuration,
    plan,
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

  const log = request.jobId ? baseLog.child({ jobId: request.jobId }) : baseLog;

  const steps: ProductionStep[] = [];
  const onProgress = request.onProgress;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reelstack-compose-'));

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

    const composePresetConfig = resolvePresetConfig(request.brandPreset);
    cues = groupWordsIntoCues(transcription.words, {
      maxWordsPerCue: composePresetConfig.maxWordsPerCue, maxDurationPerCue: composePresetConfig.maxDurationPerCue, breakOnPunctuation: true,
    }, composePresetConfig.animationStyle).map((c) => ({
      id: c.id, text: c.text, startTime: c.startTime, endTime: c.endTime,
      words: c.words?.map((w) => ({ text: w.text, startTime: w.startTime, endTime: w.endTime })),
      animationStyle: c.animationStyle,
    }));
  } else {
    const ttsResult = await runTTSPipeline({
      script: request.script,
      tts: request.tts,
      whisper: request.whisper,
      brandPreset: request.brandPreset,
    }, tmpDir, onProgress);
    voiceoverPath = ttsResult.voiceoverPath;
    audioDuration = ttsResult.audioDuration;
    cues = ttsResult.cues;
    steps.push(...ttsResult.steps);
  }

  // ── 2. BUILD TIMING REFERENCE ──────────────────────────────
  // Extract transcription words from cues for timing reference
  const allWords: Array<{ text: string; startTime: number; endTime: number }> = [];
  for (const cue of cues) {
    if (cue.words) {
      allWords.push(...cue.words);
    }
  }
  const timingReference = allWords.length > 0 ? buildTimingReference(allWords) : undefined;

  // ── 3. LLM COMPOSITION PLANNING (with exact timestamps) ────
  onProgress?.('LLM composing timeline (with exact speech timing)...');
  const planStart = performance.now();

  let plan = await planComposition({
    script: request.script,
    durationEstimate: audioDuration,
    style: request.style ?? 'educational',
    assets: request.assets,
    layout: request.layout,
    directorNotes: request.directorNotes,
    timingReference,
  });

  steps.push({
    name: 'Composition planning',
    durationMs: performance.now() - planStart,
    detail: `${plan.shots.length} shots, ${plan.effects.length} effects`,
  });

  // ── 4. BUILD ASSET MAP (resolve asset IDs → URLs) ───────────
  // No adjustTimeline needed — director planned to exact timestamps
  const assetMap = new Map(request.assets.map((a) => [a.id, a]));
  const resolvedAssets: GeneratedAsset[] = [];

  for (const shot of plan.shots) {
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

  // ── 5. VALIDATE & ASSEMBLE ──────────────────────────────────
  onProgress?.('Validating plan...');
  const validation = validatePlan(plan, audioDuration);
  if (validation.issues.length > 0) {
    log.info({ issues: validation.issues }, 'Plan validation issues found and auto-fixed');
    plan = validation.fixedPlan;
  }

  onProgress?.('Assembling composition...');

  const voiceoverUrl = await uploadVoiceover(voiceoverPath);

  const props = assembleComposition({
    plan,
    assets: resolvedAssets,
    cues,
    voiceoverFilename: voiceoverUrl,
    brandPreset: request.brandPreset,
  });

  // ── 6. RENDER ───────────────────────────────────────────────
  const { outputPath, step: renderStep } = await renderVideo(
    props as unknown as Record<string, unknown>,
    request.outputPath,
    onProgress,
  );
  steps.push(renderStep);

  // Cleanup
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch { /* cleanup non-fatal */ }

  const totalMs = steps.reduce((sum, s) => sum + s.durationMs, 0);
  onProgress?.(`Done! ${(totalMs / 1000).toFixed(1)}s total`);

  return { outputPath, durationSeconds: audioDuration, plan, steps, generatedAssets: resolvedAssets };
}

// Shared functions (buildTimingReference, resolvePresetConfig, runTTSPipeline,
// uploadVoiceover, renderVideo) are now in base-orchestrator.ts
