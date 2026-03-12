import { z } from 'zod';
import { captionCueSchema } from './caption-cue';

const boardSectionSchema = z.object({
  /** URL of the board image (top half) */
  imageUrl: z.string(),
  /** Start time in seconds */
  startTime: z.number().nonnegative(),
  /** End time in seconds */
  endTime: z.number().positive(),
  /** Transition type to this section */
  transition: z.enum(['crossfade', 'slide-left', 'slide-right', 'zoom-in', 'wipe', 'none']).default('crossfade'),
  /** Transition duration in ms */
  transitionDurationMs: z.number().min(0).max(2000).default(300),
});

export const presenterExplainerPropsSchema = z.object({
  /** Board image sections (top half of the screen) */
  boardSections: z.array(boardSectionSchema).min(1),
  /** Avatar video URL (bottom half) */
  avatarVideoUrl: z.string(),
  /** Caption cues (middle overlay) */
  cues: z.array(captionCueSchema),
  /** Voiceover audio URL */
  voiceoverUrl: z.string().optional(),
  /** Background music URL */
  musicUrl: z.string().optional(),
  /** Music volume (0-1) */
  musicVolume: z.number().min(0).max(1).default(0.15),
  /** Total duration in seconds */
  durationSeconds: z.number().positive(),
  /** Background color */
  backgroundColor: z.string().default('#0a0a14'),
  /** Board section height as percentage (0-100) */
  boardHeightPercent: z.number().min(20).max(80).default(50),
  /** Caption styling overrides */
  captionStyle: z.object({
    fontSize: z.number().default(56),
    fontColor: z.string().default('#FFFFFF'),
    highlightColor: z.string().default('#FFD700'),
    position: z.number().min(0).max(100).default(50),
  }).optional(),
});

export type PresenterExplainerProps = z.infer<typeof presenterExplainerPropsSchema>;
export type BoardSection = z.infer<typeof boardSectionSchema>;
