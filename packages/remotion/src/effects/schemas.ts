import { z } from 'zod';

// ==========================================
// Shared sub-schemas
// ==========================================

const entranceSchema = z.enum([
  'spring-scale', 'fade', 'slide-up', 'slide-down',
  'slide-left', 'slide-right', 'glitch', 'bounce', 'pop', 'none',
]).optional();

const exitSchema = z.enum([
  'fade', 'slide-down', 'shrink', 'glitch', 'none',
]).optional();

const sfxSchema = z.object({
  url: z.string(),
  volume: z.number().min(0).max(1).optional(),
}).optional();

const positionXYSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
});

function baseFields() {
  return {
    startTime: z.number().min(0),
    endTime: z.number().min(0),
    entrance: entranceSchema,
    exit: exitSchema,
    sfx: sfxSchema,
  };
}

// ==========================================
// Per-effect schemas
// ==========================================

export const emojiPopupSchema = z.object({
  type: z.literal('emoji-popup'),
  ...baseFields(),
  emoji: z.string().min(1),
  position: positionXYSchema.default({ x: 50, y: 30 }),
  size: z.number().min(20).max(300).default(80),
  rotation: z.number().default(0),
});

export const textEmphasisSchema = z.object({
  type: z.literal('text-emphasis'),
  ...baseFields(),
  text: z.string().min(1).max(50),
  fontSize: z.number().min(24).max(200).default(96),
  fontColor: z.string().default('#FFFFFF'),
  backgroundColor: z.string().optional(),
  position: z.enum(['center', 'top', 'bottom']).default('center'),
});

export const screenShakeSchema = z.object({
  type: z.literal('screen-shake'),
  ...baseFields(),
  intensity: z.number().min(1).max(30).default(8),
  frequency: z.number().min(1).max(10).default(3),
});

export const colorFlashSchema = z.object({
  type: z.literal('color-flash'),
  ...baseFields(),
  color: z.string().default('#FFFFFF'),
  maxOpacity: z.number().min(0).max(1).default(0.6),
});

export const pngOverlaySchema = z.object({
  type: z.literal('png-overlay'),
  ...baseFields(),
  url: z.string(),
  position: positionXYSchema.default({ x: 50, y: 50 }),
  size: z.number().min(5).max(100).default(30),
  opacity: z.number().min(0).max(1).default(1),
});

export const gifOverlaySchema = z.object({
  type: z.literal('gif-overlay'),
  ...baseFields(),
  url: z.string(),
  position: positionXYSchema.default({ x: 50, y: 50 }),
  size: z.number().min(5).max(100).default(30),
});

export const blurBackgroundSchema = z.object({
  type: z.literal('blur-background'),
  ...baseFields(),
  blurAmount: z.number().min(1).max(50).default(20),
  overlayUrl: z.string().optional(),
  overlayText: z.string().optional(),
  overlayFontSize: z.number().default(64),
  overlayColor: z.string().default('#FFFFFF'),
});

export const parallaxScreenshotSchema = z.object({
  type: z.literal('parallax-screenshot'),
  ...baseFields(),
  url: z.string(),
  scrollDirection: z.enum(['up', 'down']).default('up'),
  depth: z.number().min(0.5).max(3).default(1.2),
  borderRadius: z.number().default(16),
});

export const splitScreenDividerSchema = z.object({
  type: z.literal('split-screen-divider'),
  ...baseFields(),
  dividerColor: z.string().default('#FFFFFF'),
  dividerWidth: z.number().default(4),
  direction: z.enum(['horizontal', 'vertical']).default('horizontal'),
  animationSpeed: z.number().min(0.1).max(5).default(1),
});

export const subscribeBannerSchema = z.object({
  type: z.literal('subscribe-banner'),
  ...baseFields(),
  channelName: z.string().min(1),
  backgroundColor: z.string().default('#FF0000'),
  textColor: z.string().default('#FFFFFF'),
  position: z.enum(['bottom', 'top']).default('bottom'),
});

export const glitchTransitionSchema = z.object({
  type: z.literal('glitch-transition'),
  ...baseFields(),
  rgbSplitAmount: z.number().min(1).max(30).default(10),
  scanlineOpacity: z.number().min(0).max(1).default(0.3),
  displacement: z.number().min(1).max(50).default(15),
});

export const circularCounterSchema = z.object({
  type: z.literal('circular-counter'),
  ...baseFields(),
  segments: z.array(z.object({
    value: z.number(),
    holdFrames: z.number().optional(),
  })).min(1),
  size: z.number().min(50).max(500).default(200),
  trackColor: z.string().default('#333333'),
  fillColor: z.string().default('#3B82F6'),
  textColor: z.string().default('#FFFFFF'),
  fontSize: z.number().default(48),
  strokeWidth: z.number().min(2).max(30).default(10),
  position: z.enum(['center', 'top-right', 'top-left', 'bottom-right', 'bottom-left']).default('center'),
});

export const rectangularPipSchema = z.object({
  type: z.literal('rectangular-pip'),
  ...baseFields(),
  videoUrl: z.string(),
  position: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']).default('bottom-right'),
  width: z.number().min(10).max(80).default(40),
  height: z.number().min(10).max(80).default(30),
  borderColor: z.string().default('#3B82F6'),
  borderWidth: z.number().default(3),
  borderGlow: z.boolean().default(true),
  borderRadius: z.number().default(12),
});

// ==========================================
// Discriminated union
// ==========================================

export const effectSegmentSchema = z.discriminatedUnion('type', [
  emojiPopupSchema,
  textEmphasisSchema,
  screenShakeSchema,
  colorFlashSchema,
  pngOverlaySchema,
  gifOverlaySchema,
  blurBackgroundSchema,
  parallaxScreenshotSchema,
  splitScreenDividerSchema,
  subscribeBannerSchema,
  glitchTransitionSchema,
  circularCounterSchema,
  rectangularPipSchema,
]);
