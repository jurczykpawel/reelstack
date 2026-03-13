import { z } from 'zod';
import { captionCueSchema } from './caption-cue';

export const kenBurnsSchema = z.object({
  startScale: z.number().default(1.0),
  endScale: z.number().default(1.1),
  startPosition: z.object({ x: z.number(), y: z.number() }).default({ x: 50, y: 50 }),
  endPosition: z.object({ x: z.number(), y: z.number() }).default({ x: 50, y: 50 }),
});

const screenSectionSchema = z.object({
  /** Section narration text */
  text: z.string(),
  /** Start time in seconds */
  startTime: z.number().nonnegative(),
  /** End time in seconds */
  endTime: z.number().positive(),
  /** Board type: bird-eye (full workflow) or zoom (focused on specific nodes) */
  boardType: z.enum(['bird-eye', 'zoom']),
  /** Ken Burns effect config (drives zoom/pan per section) */
  kenBurns: kenBurnsSchema,
});

export const screenExplainerPropsSchema = z.object({
  /** Single high-res screenshot URL (shared across all sections) */
  screenshotUrl: z.string(),
  /** Sections with timing + Ken Burns config */
  sections: z.array(screenSectionSchema).min(1),
  /** Caption cues (from TTS + Whisper) */
  cues: z.array(captionCueSchema),
  /** Voiceover audio URL */
  voiceoverUrl: z.string(),
  /** Total duration in seconds */
  durationSeconds: z.number().positive(),
  /** Background color */
  backgroundColor: z.string().default('#1a1a2e'),
  /** Caption styling overrides */
  captionStyle: z.object({
    fontSize: z.number().default(64),
    fontColor: z.string().default('#FFFFFF'),
    highlightColor: z.string().default('#FFD700'),
    position: z.number().min(0).max(100).default(80),
  }).optional(),
});

export type ScreenExplainerProps = z.infer<typeof screenExplainerPropsSchema>;
export type ScreenSection = z.infer<typeof screenSectionSchema>;
export type KenBurnsParams = z.infer<typeof kenBurnsSchema>;
