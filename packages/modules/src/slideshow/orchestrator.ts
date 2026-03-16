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
import { runTTSPipeline, uploadVoiceover, renderVideo } from '@reelstack/agent';
import type { ProductionStep } from '@reelstack/agent';
import { createStorage } from '@reelstack/storage';
import { createLogger } from '@reelstack/logger';
import { generateSlideshowScript, wrapManualSlides } from './script-generator';
import type { SlideshowRequest, SlideshowResult, SlideshowScript } from './types';
import type { SlideshowProps } from './remotion/schema';

const baseLog = createLogger('slideshow');

/** Default background music (served from Remotion public/ dir). */
const DEFAULT_MUSIC_PATH = 'music/bg-upbeat.mp3';
const DEFAULT_MUSIC_VOLUME = 0.13;

// ── Props builder (pure, testable) ──────────────────────────

export interface BuildSlideshowPropsInput {
  script: SlideshowScript;
  imageUrls: string[];
  cues: Array<{
    id: string;
    text: string;
    startTime: number;
    endTime: number;
    words?: Array<{ text: string; startTime: number; endTime: number }>;
  }>;
  /** All word-level timestamps from transcription (for slide boundary detection). */
  words: Array<{ text: string; startTime: number; endTime: number }>;
  voiceoverUrl: string;
  durationSeconds: number;
  musicUrl?: string;
  musicVolume?: number;
}

/**
 * Find slide transition times from actual word timestamps.
 * Matches each slide's text to words in the timeline to find
 * when narration moves from one slide to the next.
 */
function findSlideBoundaries(
  slides: Array<{ title?: string; text?: string }>,
  words: Array<{ text: string; startTime: number; endTime: number }>,
  totalDuration: number
): number[] {
  if (words.length === 0 || slides.length === 0) return [];

  // Build per-slide word lists from the narration
  // The narration is: "slide1_text. slide2_text. slide3_text."
  // We find where each slide's FIRST unique word appears in the word timeline.
  const boundaries: number[] = [0]; // slide 0 always starts at 0

  let wordCursor = 0;
  for (let s = 1; s < slides.length; s++) {
    const slideText = `${slides[s].title ?? ''} ${slides[s].text ?? ''}`.trim().toLowerCase();
    const slideFirstWords = slideText.split(/\s+/).slice(0, 3); // first 3 words of this slide

    if (slideFirstWords.length === 0) {
      boundaries.push(boundaries[boundaries.length - 1]);
      continue;
    }

    // Search forward in word timeline for the first word of this slide
    let found = false;
    for (let w = wordCursor; w < words.length; w++) {
      const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (clean(words[w].text) === clean(slideFirstWords[0])) {
        // Check if next words also match (avoid false positives)
        let match = true;
        for (let k = 1; k < Math.min(slideFirstWords.length, 2); k++) {
          if (w + k < words.length && clean(words[w + k].text) !== clean(slideFirstWords[k])) {
            match = false;
            break;
          }
        }
        if (match) {
          boundaries.push(words[w].startTime);
          wordCursor = w;
          found = true;
          break;
        }
      }
    }

    if (!found) {
      // Fallback: proportional
      const proportion = s / slides.length;
      boundaries.push(totalDuration * proportion);
    }
  }

  boundaries.push(totalDuration); // end marker
  return boundaries;
}

export function buildSlideshowProps(input: BuildSlideshowPropsInput): SlideshowProps {
  const { script, imageUrls, cues, words, voiceoverUrl, durationSeconds, musicUrl, musicVolume } =
    input;

  const TRANSITIONS = ['crossfade', 'slide-left', 'zoom-in', 'wipe', 'slide-right'] as const;

  // Find actual slide boundaries from word timestamps
  const boundaries = findSlideBoundaries(script.slides, words, durationSeconds);

  const slides = imageUrls.map((url, i) => {
    const startTime = boundaries[i] ?? (durationSeconds * i) / imageUrls.length;
    const endTime = boundaries[i + 1] ?? durationSeconds;
    return {
      imageUrl: url,
      startTime,
      endTime,
      transition: i === 0 ? ('none' as const) : TRANSITIONS[(i - 1) % TRANSITIONS.length]!,
      transitionDurationMs: i === 0 ? 0 : 500,
    };
  });

  return {
    slides,
    cues,
    voiceoverUrl,
    musicUrl: musicUrl ?? DEFAULT_MUSIC_PATH,
    musicVolume: musicVolume ?? DEFAULT_MUSIC_VOLUME,
    durationSeconds,
    backgroundColor: '#000000',
    captionStyle: {
      fontSize: 60,
      fontColor: '#FFFFFF',
      fontWeight: 'bold' as const,
      highlightColor: '#FFD700',
      position: 72,
      backgroundColor: '#000000',
      backgroundOpacity: 0.65,
      padding: 18,
      outlineWidth: 3,
      outlineColor: '#000000',
      shadowBlur: 8,
    },
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
      outPath
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
  // Bridge top-level language to TTS language if not explicitly set.
  // E.g. language='en' → tts.language='en-US', language='pl' → tts.language='pl-PL'
  const ttsLanguage =
    request.tts?.language ??
    (request.language === 'pl'
      ? 'pl-PL'
      : request.language === 'en'
        ? 'en-US'
        : request.language
          ? `${request.language}-${request.language.toUpperCase()}`
          : undefined);

  const ttsResult = await runTTSPipeline(
    {
      script: script.fullNarration,
      tts: { ...request.tts, language: ttsLanguage },
      whisper: request.whisper,
      brandPreset: request.brandPreset,
    },
    tmpDir,
    onProgress
  );
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
    words: ttsResult.transcriptionWords,
    voiceoverUrl,
    durationSeconds: ttsResult.audioDuration,
    musicUrl: request.musicUrl,
    musicVolume: request.musicVolume,
  });

  // ── 7. RENDER ──────────────────────────────────────────────
  const { outputPath, step: renderStep } = await renderVideo(
    { ...props, compositionId: 'Slideshow' } as unknown as Record<string, unknown>,
    request.outputPath,
    onProgress
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
