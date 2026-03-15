import type { ProductionPlan, GeneratedAsset, EffectPlan, BrandPreset } from '../types';
import { BUILT_IN_CAPTION_PRESETS, DEFAULT_CAPTION_PRESET } from '@reelstack/types';
import type { CaptionPreset } from '@reelstack/types';
import { EFFECT_CATALOG, sfxIdToUrl } from '@reelstack/remotion/catalog';
import { createLogger } from '@reelstack/logger';

const log = createLogger('composition-assembler');

/**
 * Shape matching ReelProps from packages/remotion/src/schemas/reel-props.ts
 * We define it locally to avoid importing React/Remotion dependencies.
 */
export interface AssembledProps {
  layout: 'split-screen' | 'fullscreen' | 'picture-in-picture';
  primaryVideoUrl?: string;
  secondaryVideoUrl?: string;
  voiceoverUrl?: string;
  bRollSegments: BRollSegment[];
  effects: EffectEntry[];
  pipSegments: unknown[];
  lowerThirds: unknown[];
  ctaSegments: unknown[];
  counters: unknown[];
  zoomSegments: unknown[];
  highlights: unknown[];
  cues: CueEntry[];
  captionStyle?: Record<string, unknown>;
  dynamicCaptionPosition: boolean;
  musicUrl?: string;
  musicVolume: number;
  showProgressBar: boolean;
  backgroundColor: string;
}

interface BRollSegment {
  startTime: number;
  endTime: number;
  media: { url: string; type: 'video' | 'image' | 'color' | 'text-card'; label?: string; textCard?: { headline: string; background: string; textColor?: string } };
  animation?: string;
  transition?: { type: string; durationMs: number };
}

interface EffectEntry {
  type: string;
  startTime: number;
  endTime: number;
  [key: string]: unknown;
}

interface CueEntry {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  words?: Array<{ text: string; startTime: number; endTime: number }>;
  animationStyle?: string;
}

export interface AssemblyInput {
  plan: ProductionPlan;
  assets: readonly GeneratedAsset[];
  cues: readonly CueEntry[];
  voiceoverFilename?: string;
  brandPreset?: BrandPreset;
}

/** Extract string from unknown, return undefined if not string */
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}
/** Extract number from unknown, return undefined if not number */
function num(v: unknown): number | undefined {
  return typeof v === 'number' && isFinite(v) ? v : undefined;
}

/**
 * Assembles a ProductionPlan + generated assets + cues into ReelProps.
 */
export function assembleComposition(input: AssemblyInput): AssembledProps {
  const { plan, assets, cues, voiceoverFilename, brandPreset } = input;

  // Build asset lookup: shotId -> url
  const assetMap = new Map<string, GeneratedAsset>();
  for (const asset of assets) {
    if (asset.shotId) assetMap.set(asset.shotId, asset);
  }

  log.info(
    {
      totalAssets: assets.length,
      mappedAssets: assetMap.size,
      assetDetails: assets.map((a) => ({
        shotId: a.shotId ?? 'PRIMARY',
        toolId: a.toolId,
        type: a.type,
        url: a.url.substring(0, 100),
        durationSeconds: a.durationSeconds,
      })),
    },
    'Asset map built',
  );

  // Primary video URL
  let primaryVideoUrl: string | undefined;
  if (plan.primarySource.type === 'user-recording') {
    primaryVideoUrl = plan.primarySource.url;
  } else if (plan.primarySource.type === 'avatar' || plan.primarySource.type === 'ai-video') {
    // Find the primary asset (no shotId)
    const primaryAsset = assets.find((a) => !a.shotId);
    primaryVideoUrl = primaryAsset?.url;
  }

  // Convert shots to B-roll segments
  const bRollSegments: BRollSegment[] = [];

  for (const shot of plan.shots) {
    if (shot.visual.type === 'primary') continue;

    if (shot.visual.type === 'text-card') {
      bRollSegments.push({
        startTime: shot.startTime,
        endTime: shot.endTime,
        media: {
          url: shot.visual.background,
          type: 'text-card',
          textCard: {
            headline: shot.visual.headline,
            background: shot.visual.background,
          },
        },
        animation: 'fade',
        transition: { type: shot.transition.type, durationMs: shot.transition.durationMs },
      });
      continue;
    }

    // b-roll, ai-video, or ai-image
    const asset = assetMap.get(shot.id);
    if (!asset) {
      log.warn({ shotId: shot.id }, 'No generated asset for shot, using placeholder');
      bRollSegments.push({
        startTime: shot.startTime,
        endTime: shot.endTime,
        media: { url: '#333333', type: 'color', label: shot.reason },
        animation: 'fade',
        transition: { type: shot.transition.type, durationMs: shot.transition.durationMs },
      });
      continue;
    }

    // Detect media type: check asset type first, then URL extension (Pexels image: prefix returns jpeg URLs with stock-video type)
    const imageExtensions = /\.(jpe?g|png|webp|gif|avif|bmp|tiff?)(\?|$)/i;
    const isImageByType = asset.type === 'ai-image' || asset.type === 'stock-image';
    const isImageByUrl = imageExtensions.test(asset.url);
    const mediaType = isImageByType || isImageByUrl ? 'image' : 'video';

    // Validate URL - allow http(s) and local file paths (for generated temp files)
    let validUrl = asset.url;
    if (!asset.url.startsWith('/') && !asset.url.startsWith('http://') && !asset.url.startsWith('https://')) {
      log.warn({ url: asset.url, shotId: shot.id }, 'Invalid asset URL scheme, using placeholder');
      validUrl = '#333333';
    }

    bRollSegments.push({
      startTime: shot.startTime,
      endTime: shot.endTime,
      media: { url: validUrl, type: validUrl === '#333333' ? 'color' : mediaType },
      animation: 'spring-scale',
      transition: { type: shot.transition.type, durationMs: shot.transition.durationMs },
    });
  }

  log.info(
    {
      bRollCount: bRollSegments.length,
      bRollDetails: bRollSegments.map((br) => ({
        startTime: br.startTime,
        endTime: br.endTime,
        mediaType: br.media.type,
        mediaUrl: br.media.url.substring(0, 100),
        transition: br.transition?.type,
      })),
      primaryVideoUrl: primaryVideoUrl?.substring(0, 100) ?? 'NONE',
    },
    'B-roll segments assembled',
  );

  // Convert effects - flatten config into top-level props (spread config first so sanitized fields can't be overridden)
  // Build default SFX lookup from catalog
  const defaultSfxMap = new Map<string, string>();
  for (const entry of EFFECT_CATALOG) {
    if (entry.defaultSfx) {
      defaultSfxMap.set(entry.type, entry.defaultSfx);
    }
  }

  const effects: EffectEntry[] = plan.effects.map((e) => {
    const base: EffectEntry = {
      ...e.config,
      type: e.type,
      startTime: e.startTime,
      endTime: e.endTime,
    };

    // Resolve SFX: LLM config > default from catalog
    const configSfx = e.config.sfx as { id?: string; volume?: number } | null | undefined;

    if (configSfx === null) {
      // LLM explicitly muted SFX — don't add any
      delete base.sfx;
    } else if (configSfx?.id) {
      // LLM specified a custom SFX
      base.sfx = { url: sfxIdToUrl(configSfx.id), volume: configSfx.volume ?? 0.7 };
    } else {
      // Apply default SFX from catalog if available
      const defaultSfxId = defaultSfxMap.get(e.type);
      if (defaultSfxId) {
        base.sfx = { url: sfxIdToUrl(defaultSfxId), volume: 0.7 };
      }
    }

    return base;
  });

  // Resolve caption style with 3-layer priority:
  // 1. preset defaults (lowest)
  // 2. LLM plan.captionStyle suggestions (middle)
  // 3. individual brandPreset overrides (highest)
  const presetName = brandPreset?.captionPreset ?? DEFAULT_CAPTION_PRESET;
  const preset: CaptionPreset = BUILT_IN_CAPTION_PRESETS[presetName] ?? BUILT_IN_CAPTION_PRESETS[DEFAULT_CAPTION_PRESET];

  // LLM suggestions from plan (sanitized in production-planner.ts)
  const llm = (plan.captionStyle ?? {}) as Record<string, unknown>;

  const captionStyle = {
    fontFamily: brandPreset?.fontFamily ?? str(llm.fontFamily) ?? preset.style.fontFamily,
    fontSize: brandPreset?.fontSize ?? num(llm.fontSize) ?? preset.style.fontSize,
    fontColor: brandPreset?.fontColor ?? str(llm.fontColor) ?? preset.style.fontColor,
    fontWeight: brandPreset?.fontWeight ?? str(llm.fontWeight) as 'normal' | 'bold' ?? preset.style.fontWeight,
    fontStyle: str(llm.fontStyle) as 'normal' | 'italic' ?? preset.style.fontStyle,
    backgroundColor: str(llm.backgroundColor) ?? preset.style.backgroundColor,
    backgroundOpacity: num(llm.backgroundOpacity) ?? preset.style.backgroundOpacity,
    outlineColor: brandPreset?.outlineColor ?? str(llm.outlineColor) ?? preset.style.outlineColor,
    outlineWidth: brandPreset?.outlineWidth ?? num(llm.outlineWidth) ?? preset.style.outlineWidth,
    shadowColor: str(llm.shadowColor) ?? preset.style.shadowColor,
    shadowBlur: num(llm.shadowBlur) ?? preset.style.shadowBlur,
    position: brandPreset?.position ?? num(llm.position) ?? preset.style.position,
    alignment: str(llm.alignment) as 'left' | 'center' | 'right' ?? preset.style.alignment,
    lineHeight: num(llm.lineHeight) ?? preset.style.lineHeight,
    padding: num(llm.padding) ?? preset.style.padding,
    highlightColor: brandPreset?.highlightColor ?? str(llm.highlightColor) ?? preset.style.highlightColor,
    upcomingColor: str(llm.upcomingColor) ?? '#8888A0',
    highlightMode: str(llm.highlightMode) as 'text' | 'pill' ?? preset.style.highlightMode ?? 'text',
    textTransform: brandPreset?.textTransform ?? str(llm.textTransform) as 'none' | 'uppercase' ?? preset.style.textTransform ?? 'none',
  };

  // Map plan segments to props
  const zoomSegments = (plan.zoomSegments ?? []).map((z) => ({
    startTime: z.startTime,
    endTime: z.endTime,
    scale: z.scale,
    focusPoint: z.focusPoint,
    easing: z.easing,
  }));

  const lowerThirds = (plan.lowerThirds ?? []).map((l) => ({
    startTime: l.startTime,
    endTime: l.endTime,
    title: l.title,
    subtitle: l.subtitle,
    backgroundColor: l.backgroundColor,
    textColor: l.textColor,
    position: l.position,
    accentColor: l.accentColor,
  }));

  const counters = (plan.counters ?? []).map((c) => ({
    startTime: c.startTime,
    endTime: c.endTime,
    value: c.value,
    prefix: c.prefix,
    suffix: c.suffix,
    format: c.format,
    textColor: c.textColor,
    fontSize: c.fontSize,
    position: c.position,
  }));

  const highlights = (plan.highlights ?? []).map((h) => ({
    startTime: h.startTime,
    endTime: h.endTime,
    x: h.x,
    y: h.y,
    width: h.width,
    height: h.height,
    color: h.color,
    borderWidth: h.borderWidth,
    label: h.label,
    glow: h.glow,
  }));

  const ctaSegments = (plan.ctaSegments ?? []).map((c) => ({
    startTime: c.startTime,
    endTime: c.endTime,
    text: c.text,
    style: c.style,
    backgroundColor: c.backgroundColor,
    textColor: c.textColor,
    position: c.position,
  }));

  return {
    layout: brandPreset?.layout ?? plan.layout,
    primaryVideoUrl,
    voiceoverUrl: voiceoverFilename,
    bRollSegments,
    effects,
    pipSegments: [],
    lowerThirds,
    ctaSegments,
    counters,
    zoomSegments,
    highlights,
    cues: cues.map((c) => ({ ...c })),
    captionStyle,
    dynamicCaptionPosition: brandPreset?.dynamicCaptionPosition ?? preset.dynamicCaptionPosition,
    musicUrl: brandPreset?.musicUrl,
    musicVolume: brandPreset?.musicVolume ?? preset.musicVolume,
    showProgressBar: brandPreset?.showProgressBar ?? preset.showProgressBar,
    backgroundColor: brandPreset?.backgroundColor ?? '#000000',
  };
}
