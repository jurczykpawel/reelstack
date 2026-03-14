import { z } from 'zod';
import { captionCueSchema } from '@reelstack/remotion/schemas/caption-cue';

const slideSegmentSchema = z.object({
  imageUrl: z.string(),
  startTime: z.number().nonnegative(),
  endTime: z.number().positive(),
  transition: z.enum(['crossfade', 'slide-left', 'slide-right', 'zoom-in', 'wipe', 'none']).default('crossfade'),
  transitionDurationMs: z.number().min(0).max(2000).default(400),
});

export const slideshowPropsSchema = z.object({
  slides: z.array(slideSegmentSchema).min(1),
  cues: z.array(captionCueSchema),
  voiceoverUrl: z.string().optional(),
  musicUrl: z.string().optional(),
  musicVolume: z.number().min(0).max(1).default(0.2),
  durationSeconds: z.number().positive(),
  backgroundColor: z.string().default('#000000'),
  captionStyle: z.object({
    fontSize: z.number().default(64),
    fontColor: z.string().default('#FFFFFF'),
    highlightColor: z.string().default('#FFD700'),
    position: z.number().min(0).max(100).default(80),
  }).optional(),
});

export type SlideshowProps = z.infer<typeof slideshowPropsSchema>;
export type SlideSegment = z.infer<typeof slideSegmentSchema>;
