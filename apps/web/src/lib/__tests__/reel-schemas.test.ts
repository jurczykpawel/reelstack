import { describe, it, expect } from 'vitest';
import { createReelSchema, publishReelSchema } from '../api/v1/reel-schemas';

describe('createReelSchema', () => {
  it('accepts minimal valid input', () => {
    const result = createReelSchema.safeParse({ script: 'Hello world' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.layout).toBe('fullscreen'); // default
    }
  });

  it('accepts full valid input', () => {
    const result = createReelSchema.safeParse({
      script: 'Test script',
      layout: 'split-screen',
      style: 'cinematic',
      tts: { provider: 'elevenlabs', voice: 'rachel', language: 'en-US' },
      primaryVideoUrl: 'https://example.com/video.mp4',
      secondaryVideoUrl: 'https://example.com/screen.mp4',
      brandPreset: {
        captionTemplate: 'bold-pop',
        highlightColor: '#FFD700',
        backgroundColor: '#000000',
        defaultTransition: 'crossfade',
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty script', () => {
    const result = createReelSchema.safeParse({ script: '' });
    expect(result.success).toBe(false);
  });

  it('rejects script over 10000 chars', () => {
    const result = createReelSchema.safeParse({ script: 'a'.repeat(10001) });
    expect(result.success).toBe(false);
  });

  it('rejects invalid layout', () => {
    const result = createReelSchema.safeParse({ script: 'Hello', layout: 'widescreen' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid style', () => {
    const result = createReelSchema.safeParse({ script: 'Hello', style: 'dramatic' });
    expect(result.success).toBe(false);
  });

  it('accepts all valid layouts', () => {
    for (const layout of ['split-screen', 'fullscreen', 'picture-in-picture']) {
      const result = createReelSchema.safeParse({ script: 'Hello', layout });
      expect(result.success).toBe(true);
    }
  });

  it('accepts all valid styles', () => {
    for (const style of ['dynamic', 'calm', 'cinematic', 'educational']) {
      const result = createReelSchema.safeParse({ script: 'Hello', style });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid primaryVideoUrl', () => {
    const result = createReelSchema.safeParse({ script: 'Hello', primaryVideoUrl: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('defaults tts language to pl-PL', () => {
    const result = createReelSchema.safeParse({ script: 'Hello', tts: {} });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tts?.language).toBe('pl-PL');
      expect(result.data.tts?.provider).toBe('edge-tts');
    }
  });
});

describe('publishReelSchema', () => {
  const validReelId = '550e8400-e29b-41d4-a716-446655440000';

  it('accepts valid publish request', () => {
    const result = publishReelSchema.safeParse({
      reelId: validReelId,
      platforms: ['tiktok', 'instagram'],
      caption: 'Check out this reel!',
    });
    expect(result.success).toBe(true);
  });

  it('accepts with optional fields', () => {
    const result = publishReelSchema.safeParse({
      reelId: validReelId,
      platforms: ['youtube-shorts'],
      caption: 'My reel',
      hashtags: ['#reelstack', '#automation'],
      scheduleDate: '2026-03-15T10:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-uuid reelId', () => {
    const result = publishReelSchema.safeParse({
      reelId: 'not-uuid',
      platforms: ['tiktok'],
      caption: 'Hello',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty platforms array', () => {
    const result = publishReelSchema.safeParse({
      reelId: validReelId,
      platforms: [],
      caption: 'Hello',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid platform', () => {
    const result = publishReelSchema.safeParse({
      reelId: validReelId,
      platforms: ['snapchat'],
      caption: 'Hello',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty caption', () => {
    const result = publishReelSchema.safeParse({
      reelId: validReelId,
      platforms: ['tiktok'],
      caption: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects caption over 5000 chars', () => {
    const result = publishReelSchema.safeParse({
      reelId: validReelId,
      platforms: ['tiktok'],
      caption: 'a'.repeat(5001),
    });
    expect(result.success).toBe(false);
  });

  it('accepts all valid platforms', () => {
    for (const platform of ['tiktok', 'instagram', 'youtube-shorts', 'facebook', 'linkedin', 'x']) {
      const result = publishReelSchema.safeParse({
        reelId: validReelId,
        platforms: [platform],
        caption: 'Hello',
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects too many hashtags', () => {
    const result = publishReelSchema.safeParse({
      reelId: validReelId,
      platforms: ['tiktok'],
      caption: 'Hello',
      hashtags: Array.from({ length: 31 }, (_, i) => `tag${i}`),
    });
    expect(result.success).toBe(false);
  });
});
