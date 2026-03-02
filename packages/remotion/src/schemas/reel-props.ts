import { z } from 'zod';

const mediaSourceSchema = z.object({
  url: z.string(),
  type: z.enum(['video', 'image', 'color']),
  label: z.string().optional(),
  startFrom: z.number().optional(),
  endAt: z.number().optional(),
});

const bRollTransitionSchema = z.object({
  type: z.enum(['crossfade', 'slide-left', 'slide-right', 'zoom-in', 'wipe', 'none']).default('crossfade'),
  durationMs: z.number().min(0).max(2000).default(300),
});

const bRollSegmentSchema = z.object({
  startTime: z.number(),
  endTime: z.number(),
  media: mediaSourceSchema,
  animation: z.enum(['spring-scale', 'fade', 'slide', 'none']).optional(),
  transition: bRollTransitionSchema.optional(),
});

const subtitleWordSchema = z.object({
  text: z.string(),
  startTime: z.number(),
  endTime: z.number(),
});

const captionCueSchema = z.object({
  id: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  text: z.string(),
  words: z.array(subtitleWordSchema).optional(),
  animationStyle: z
    .enum(['none', 'word-highlight', 'word-by-word', 'karaoke', 'bounce', 'typewriter'])
    .optional(),
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
});

export const reelPropsSchema = z.object({
  layout: z.enum(['split-screen', 'fullscreen', 'picture-in-picture']),

  // Media
  primaryVideoUrl: z.string().optional(),
  secondaryVideoUrl: z.string().optional(),
  bRollSegments: z.array(bRollSegmentSchema).default([]),

  // Audio
  voiceoverUrl: z.string().optional(),
  musicUrl: z.string().optional(),
  musicVolume: z.number().min(0).max(1).default(0.3),

  // Captions
  cues: z.array(captionCueSchema).default([]),
  captionStyle: captionStyleSchema.optional(),

  // Visual
  showProgressBar: z.boolean().default(true),
  backgroundColor: z.string().default('#000000'),
});

export type ReelProps = z.infer<typeof reelPropsSchema>;
