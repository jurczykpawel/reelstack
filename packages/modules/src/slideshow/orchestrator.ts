/**
 * Slideshow orchestrator.
 *
 * Pipeline: [LLM script | manual slides] → image-gen PNGs → TTS → whisper → compose → render.
 *
 * Zero external API keys required: uses @reelstack/image-gen (Playwright) + edge-tts (free).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { renderToFile } from '@reelstack/image-gen';
import {
  runTTSPipeline,
  uploadVoiceover,
  renderVideo,
} from '@reelstack/agent';
import type { ProductionStep } from '@reelstack/agent';
import { createStorage } from '@reelstack/storage';
import { createLogger } from '@reelstack/logger';
import { generateSlideshowScript, wrapManualSlides } from './script-generator';
import type { SlideshowRequest, SlideshowResult, SlideshowScript } from './types';
import type { SlideshowProps } from './remotion/schema';

const baseLog = createLogger('slideshow');

// ── Props builder (pure, testable) ──────────────────────────

export interface BuildSlideshowPropsInput {
  script: SlideshowScript;
  imageUrls: string[];
  cues: Array<{ id: string; text: string; startTime: number; endTime: number; words?: Array<{ text: string; startTime: number; endTime: number }> }>;
  voiceoverUrl: string;
  durationSeconds: number;
  musicUrl?: string;
  musicVolume?: number;
}

export function buildSlideshowProps(input: BuildSlideshowPropsInput): SlideshowProps {
  const { imageUrls, cues, voiceoverUrl, durationSeconds, musicUrl, musicVolume } = input;
  const slideDuration = durationSeconds / imageUrls.length;

  const slides = imageUrls.map((url, i) => ({
    imageUrl: url,
    startTime: i * slideDuration,
    endTime: (i + 1) * slideDuration,
    transition: (i === 0 ? 'none' : 'crossfade') as 'none' | 'crossfade',
    transitionDurationMs: i === 0 ? 0 : 400,
  }));

  return {
    slides,
    cues,
    voiceoverUrl,
    musicUrl,
    musicVolume: musicVolume ?? 0.2,
    durationSeconds,
    backgroundColor: '#000000',
  };
}

// ── Full pipeline ───────────────────────────────────────────

export async function produceSlideshow(request: SlideshowRequest): Promise<SlideshowResult> {
  const log = request.jobId ? baseLog.child({ jobId: request.jobId }) : baseLog;
  const steps: ProductionStep[] = [];
  const onProgress = request.onProgress;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reelstack-slideshow-'));
  const template = request.template ?? 'tip-card';
  const brand = request.brand ?? 'example';

  // ── 1. SCRIPT ──────────────────────────────────────────────
  let script: SlideshowScript;

  if (request.slides && request.slides.length > 0) {
    script = wrapManualSlides(request.topic, request.slides);
    log.info({ slides: script.slides.length }, 'Using manual slides');
  } else if (request.llmCall) {
    onProgress?.('Generating slideshow script...');
    const scriptStart = performance.now();
    script = await generateSlideshowScript({
      topic: request.topic,
      numberOfSlides: request.numberOfSlides,
      language: request.language,
      llmCall: request.llmCall,
    });
    steps.push({
      name: 'Script generation',
      durationMs: performance.now() - scriptStart,
      detail: `${script.slides.length} slides`,
    });
    log.info({ slides: script.slides.length }, 'Script generated');
  } else {
    throw new Error('Either slides[] or llmCall must be provided');
  }

  // ── 2. RENDER SLIDE IMAGES ─────────────────────────────────
  const imageDir = path.join(tmpDir, 'slides');
  fs.mkdirSync(imageDir, { recursive: true });
  const genStart = performance.now();
  const imagePaths: string[] = [];

  for (let i = 0; i < script.slides.length; i++) {
    const slide = script.slides[i]!;
    onProgress?.(`Rendering slide ${i + 1}/${script.slides.length}`);

    const slideTemplate = slide.template ?? template;
    const outPath = path.join(imageDir, `slide-${i}.png`);

    await renderToFile(
      {
        brand,
        template: slideTemplate,
        size: 'story', // 1080x1920 vertical
        title: slide.title,
        text: slide.text ?? '',
        badge: slide.badge ?? `${i + 1}`,
        num: slide.num ?? `${i + 1}`,
      },
      outPath,
    );

    imagePaths.push(outPath);
  }

  steps.push({
    name: 'Image rendering',
    durationMs: performance.now() - genStart,
    detail: `${imagePaths.length} slides via image-gen`,
  });

  // ── 3. UPLOAD SLIDE IMAGES ─────────────────────────────────
  onProgress?.('Uploading slide images...');
  const storage = await createStorage();
  const imageUrls: string[] = [];

  for (let i = 0; i < imagePaths.length; i++) {
    const key = `slideshow/${request.jobId ?? 'local'}/${Date.now()}-slide-${i}.png`;
    const buffer = fs.readFileSync(imagePaths[i]!);
    await storage.upload(buffer, key);
    const url = await storage.getSignedUrl(key, 7200);
    imageUrls.push(url);
  }

  // ── 4. TTS + TRANSCRIPTION ─────────────────────────────────
  const ttsResult = await runTTSPipeline({
    script: script.fullNarration,
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
  const props = buildSlideshowProps({
    script,
    imageUrls,
    cues: ttsResult.cues,
    voiceoverUrl,
    durationSeconds: ttsResult.audioDuration,
    musicUrl: request.musicUrl,
    musicVolume: request.musicVolume,
  });

  // ── 7. RENDER ──────────────────────────────────────────────
  const { outputPath, step: renderStep } = await renderVideo(
    { ...props, compositionId: 'Slideshow' } as unknown as Record<string, unknown>,
    request.outputPath,
    onProgress,
  );
  steps.push(renderStep);

  // Cleanup
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (err) {
    log.warn({ tmpDir, err }, 'Cleanup failed');
  }

  const totalMs = steps.reduce((sum, s) => sum + s.durationMs, 0);
  onProgress?.(`Done! ${(totalMs / 1000).toFixed(1)}s total`);

  return {
    outputPath,
    durationSeconds: ttsResult.audioDuration,
    script,
    steps,
  };
}
