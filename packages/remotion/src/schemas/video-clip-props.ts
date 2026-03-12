import { z } from 'zod';
import { captionCueSchema } from './caption-cue';

const videoClipSchema = z.object({
  /** URL of the video clip */
  url: z.string(),
  /** Start time in the final composition (seconds) */
  startTime: z.number().nonnegative(),
  /** End time in the final composition (seconds) */
  endTime: z.number().positive(),
  /** Transition to next clip */
  transition: z.enum(['crossfade', 'slide-left', 'slide-right', 'zoom-in', 'wipe', 'none']).default('crossfade'),
  /** Transition duration in ms */
  transitionDurationMs: z.number().min(0).max(2000).default(300),
});

export const videoClipPropsSchema = z.object({
  /** Ordered array of video clips to stitch */
  clips: z.array(videoClipSchema).min(1),
  /** Caption cues */
  cues: z.array(captionCueSchema),
  /** Voiceover audio URL (optional - clips may have their own audio) */
  voiceoverUrl: z.string().optional(),
  /** Background music URL */
  musicUrl: z.string().optional(),
  /** Music volume (0-1) */
  musicVolume: z.number().min(0).max(1).default(0.15),
  /** Total duration in seconds */
  durationSeconds: z.number().positive(),
  /** Background color (shown during transitions) */
  backgroundColor: z.string().default('#000000'),
  /** Caption styling overrides */
  captionStyle: z.object({
    fontSize: z.number().default(64),
    fontColor: z.string().default('#FFFFFF'),
    highlightColor: z.string().default('#FFD700'),
    position: z.number().min(0).max(100).default(80),
  }).optional(),
});

export type VideoClipProps = z.infer<typeof videoClipPropsSchema>;
export type VideoClip = z.infer<typeof videoClipSchema>;
