import { z } from 'zod';
import { effectSegmentSchema } from '../effects/schemas';
import { captionCueSchema } from './caption-cue';

const textCardConfigSchema = z.object({
  headline: z.string(),
  subtitle: z.string().optional(),
  background: z.string(),
  textColor: z.string().default('#FFFFFF'),
  textAlign: z.enum(['left', 'center', 'right']).default('center'),
  fontSize: z.number().default(64),
});

const kenBurnsConfigSchema = z.object({
  startScale: z.number().default(1.0),
  endScale: z.number().default(1.3),
  startPosition: z.object({ x: z.number(), y: z.number() }).default({ x: 50, y: 50 }),
  endPosition: z.object({ x: z.number(), y: z.number() }).default({ x: 50, y: 50 }),
});

const mediaPanelSourceSchema = z.object({
  url: z.string(),
  type: z.enum(['video', 'image']),
});

const mediaSourceSchema = z.object({
  url: z.string(),
  type: z.enum(['video', 'image', 'color', 'split-screen', 'text-card', 'multi-panel']),
  label: z.string().optional(),
  startFrom: z.number().optional(),
  endAt: z.number().optional(),
  textCard: textCardConfigSchema.optional(),
  kenBurns: kenBurnsConfigSchema.optional(),
  panels: z.array(mediaPanelSourceSchema).min(2).max(4).optional(),
});

const bRollTransitionSchema = z.object({
  type: z.enum([
    'crossfade', 'slide-left', 'slide-right', 'slide-perspective-right',
    'zoom-in', 'wipe', 'blur-dissolve', 'flash-white', 'whip-pan',
    'cross-zoom', 'iris-circle', 'spin', 'none',
  ]).default('crossfade'),
  durationMs: z.number().min(0).max(2000).default(300),
});

const bRollSegmentSchema = z.object({
  startTime: z.number(),
  endTime: z.number(),
  media: mediaSourceSchema,
  animation: z.enum(['spring-scale', 'fade', 'slide', 'none']).optional(),
  transition: bRollTransitionSchema.optional(),
  cssFilter: z.string().optional(),
});

const captionStyleSchema = z.object({
  fontFamily: z.string(),
  fontSize: z.number(),
  fontColor: z.string(),
  fontWeight: z.enum(['normal', 'bold']),
  fontStyle: z.enum(['normal', 'italic']),
  backgroundColor: z.string(),
  backgroundOpacity: z.number(),
  outlineColor: z.string(),
  outlineWidth: z.number(),
  shadowColor: z.string(),
  shadowBlur: z.number(),
  position: z.number(),
  alignment: z.enum(['left', 'center', 'right']),
  lineHeight: z.number(),
  padding: z.number(),
  highlightColor: z.string().optional(),
  upcomingColor: z.string().optional(),
  highlightMode: z.string().default('text'),
  textTransform: z.enum(['none', 'uppercase']).default('none'),
  pillColor: z.string().optional(),
  pillBorderRadius: z.number().optional(),
  pillPadding: z.number().optional(),
});

const pipSegmentSchema = z.object({
  startTime: z.number(),
  endTime: z.number(),
  videoUrl: z.string(),
  position: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']).default('bottom-right'),
  size: z.number().min(10).max(50).default(30),
  shape: z.enum(['circle', 'rounded', 'square']).default('circle'),
  borderColor: z.string().default('#FFFFFF'),
  borderWidth: z.number().default(3),
});

const lowerThirdSegmentSchema = z.object({
  startTime: z.number(),
  endTime: z.number(),
  title: z.string(),
  subtitle: z.string().optional(),
  backgroundColor: z.string().default('#000000CC'),
  textColor: z.string().default('#FFFFFF'),
  position: z.enum(['left', 'center']).default('left'),
  accentColor: z.string().default('#3B82F6'),
});

const ctaSegmentSchema = z.object({
  startTime: z.number(),
  endTime: z.number(),
  text: z.string(),
  style: z.enum(['button', 'banner', 'pill']).default('button'),
  backgroundColor: z.string().default('#3B82F6'),
  textColor: z.string().default('#FFFFFF'),
  position: z.enum(['bottom', 'center', 'top']).default('bottom'),
  icon: z.string().optional(),
});

const zoomSegmentSchema = z.object({
  startTime: z.number(),
  endTime: z.number(),
  scale: z.number().min(1).max(3).default(1.5),
  focusPoint: z.object({ x: z.number(), y: z.number() }).default({ x: 50, y: 50 }),
  easing: z.enum(['spring', 'smooth', 'instant']).default('spring'),
});

const highlightSegmentSchema = z.object({
  startTime: z.number(),
  endTime: z.number(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  color: z.string().default('#FF0000'),
  borderWidth: z.number().default(3),
  borderRadius: z.number().default(8),
  label: z.string().optional(),
  glow: z.boolean().default(false),
  style: z.enum(['border', 'marker']).default('border'),
});

const counterSegmentSchema = z.object({
  startTime: z.number(),
  endTime: z.number(),
  value: z.number(),
  prefix: z.string().default(''),
  suffix: z.string().default(''),
  format: z.enum(['full', 'abbreviated']).default('full'),
  textColor: z.string().default('#FFFFFF'),
  fontSize: z.number().default(72),
  position: z.enum(['center', 'top', 'bottom']).default('center'),
  mode: z.enum(['count-up', 'countdown']).default('count-up'),
});

const speedRampSegmentSchema = z.object({
  startTime: z.number(),
  endTime: z.number(),
  rate: z.number().min(0.1).max(4).default(1),
});

// Re-export shared schemas for reuse by YouTubeLongForm composition
export {
  bRollSegmentSchema,
  captionCueSchema,
  captionStyleSchema,
  pipSegmentSchema,
  lowerThirdSegmentSchema,
  ctaSegmentSchema,
  counterSegmentSchema,
  zoomSegmentSchema,
  highlightSegmentSchema,
  speedRampSegmentSchema,
};

export const reelPropsSchema = z.object({
  layout: z.enum(['split-screen', 'fullscreen', 'picture-in-picture']),

  // Media
  primaryVideoUrl: z.string().optional(),
  secondaryVideoUrl: z.string().optional(),
  bRollSegments: z.array(bRollSegmentSchema).default([]),

  // Independent layers
  pipSegments: z.array(pipSegmentSchema).default([]),
  lowerThirds: z.array(lowerThirdSegmentSchema).default([]),
  ctaSegments: z.array(ctaSegmentSchema).default([]),
  counters: z.array(counterSegmentSchema).default([]),
  zoomSegments: z.array(zoomSegmentSchema).default([]),
  highlights: z.array(highlightSegmentSchema).default([]),
  speedRamps: z.array(speedRampSegmentSchema).default([]),

  // Audio
  voiceoverUrl: z.string().optional(),
  musicUrl: z.string().optional(),
  musicVolume: z.number().min(0).max(1).default(0.3),

  // Captions
  cues: z.array(captionCueSchema).default([]),
  captionStyle: captionStyleSchema.optional(),
  dynamicCaptionPosition: z.boolean().default(false),

  // Plugin effects
  effects: z.array(effectSegmentSchema).default([]),

  // Visual
  showProgressBar: z.boolean().default(true),
  backgroundColor: z.string().default('#000000'),
});

export type ReelProps = z.infer<typeof reelPropsSchema>;
