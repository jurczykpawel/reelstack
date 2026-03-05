import { z } from 'zod';

export const createReelSchema = z.object({
  script: z.string().min(1).max(10000),
  layout: z.enum(['split-screen', 'fullscreen', 'picture-in-picture']).default('fullscreen'),
  style: z.enum(['dynamic', 'calm', 'cinematic', 'educational']).optional(),
  tts: z.object({
    provider: z.enum(['edge-tts', 'elevenlabs', 'openai']).default('edge-tts'),
    voice: z.string().optional(),
    language: z.string().default('pl-PL'),
  }).optional(),
  primaryVideoUrl: z.string().url().optional(),
  secondaryVideoUrl: z.string().url().optional(),
  brandPreset: z.object({
    captionTemplate: z.string().optional(),
    highlightColor: z.string().optional(),
    backgroundColor: z.string().optional(),
    defaultTransition: z.enum(['crossfade', 'slide-left', 'slide-right', 'zoom-in', 'wipe', 'none']).optional(),
  }).optional(),
});

export const publishReelSchema = z.object({
  reelId: z.string().uuid(),
  platforms: z.array(z.enum(['tiktok', 'instagram', 'youtube-shorts', 'facebook', 'linkedin', 'x'])).min(1),
  caption: z.string().min(1).max(5000),
  hashtags: z.array(z.string()).max(30).optional(),
  scheduleDate: z.string().datetime().optional(),
});
