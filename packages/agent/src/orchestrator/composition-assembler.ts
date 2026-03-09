import type { ProductionPlan, GeneratedAsset, EffectPlan } from '../types';
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
  brandPreset?: {
    captionTemplate?: { fontFamily?: string; fontSize?: number; fontColor?: string; backgroundColor?: string };
    highlightColor?: string;
    backgroundColor?: string;
  };
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

    const mediaType = asset.type === 'ai-image' || asset.type === 'stock-image' ? 'image' : 'video';

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

  // Convert effects - flatten config into top-level props (spread config first so sanitized fields can't be overridden)
  const effects: EffectEntry[] = plan.effects.map((e) => ({
    ...e.config,
    type: e.type,
    startTime: e.startTime,
    endTime: e.endTime,
  }));

  // Caption style
  const captionStyle = brandPreset
    ? {
        fontFamily: brandPreset.captionTemplate?.fontFamily ?? 'Outfit, sans-serif',
        fontSize: brandPreset.captionTemplate?.fontSize ?? 64,
        fontColor: brandPreset.captionTemplate?.fontColor ?? '#F5F5F0',
        fontWeight: 'bold',
        fontStyle: 'normal',
        backgroundColor: brandPreset.captionTemplate?.backgroundColor ?? '#0E0E12',
        backgroundOpacity: 0.85,
        outlineColor: '#0E0E12',
        outlineWidth: 3,
        shadowColor: '#000000',
        shadowBlur: 12,
        position: 75,
        alignment: 'center',
        lineHeight: 1.3,
        padding: 16,
        highlightColor: brandPreset.highlightColor ?? '#F59E0B',
        upcomingColor: brandPreset.captionTemplate?.fontColor ?? '#8888A0',
        highlightMode: 'text',
        textTransform: 'none',
      }
    : undefined;

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
    layout: plan.layout,
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
    dynamicCaptionPosition: false,
    musicVolume: 0,
    showProgressBar: true,
    backgroundColor: brandPreset?.backgroundColor ?? '#000000',
  };
}
