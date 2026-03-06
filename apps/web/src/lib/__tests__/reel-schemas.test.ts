import { describe, it, expect, vi } from 'vitest';
import { createReelSchema, publishReelSchema, batchReelSchema, multiLangReelSchema } from '../api/v1/reel-schemas';

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

// ── callbackUrl validation ─────────────────────────

describe('createReelSchema callbackUrl', () => {
  it('accepts valid HTTPS callback URL', () => {
    const result = createReelSchema.safeParse({
      script: 'Hello',
      callbackUrl: 'https://example.com/webhook',
    });
    expect(result.success).toBe(true);
  });

  it('rejects localhost callback URL', () => {
    const result = createReelSchema.safeParse({
      script: 'Hello',
      callbackUrl: 'https://localhost/webhook',
    });
    expect(result.success).toBe(false);
  });

  it('rejects 127.0.0.1 callback URL', () => {
    const result = createReelSchema.safeParse({
      script: 'Hello',
      callbackUrl: 'https://127.0.0.1/webhook',
    });
    expect(result.success).toBe(false);
  });

  it('rejects private IP 10.x callback URL', () => {
    const result = createReelSchema.safeParse({
      script: 'Hello',
      callbackUrl: 'https://10.0.0.1/webhook',
    });
    expect(result.success).toBe(false);
  });

  it('rejects private IP 192.168.x callback URL', () => {
    const result = createReelSchema.safeParse({
      script: 'Hello',
      callbackUrl: 'https://192.168.1.1/webhook',
    });
    expect(result.success).toBe(false);
  });

  it('rejects private IP 172.16.x callback URL', () => {
    const result = createReelSchema.safeParse({
      script: 'Hello',
      callbackUrl: 'https://172.16.0.1/webhook',
    });
    expect(result.success).toBe(false);
  });

  it('rejects IPv6 loopback [::1]', () => {
    const result = createReelSchema.safeParse({
      script: 'Hello',
      callbackUrl: 'https://[::1]/webhook',
    });
    expect(result.success).toBe(false);
  });

  it('rejects IPv4-mapped IPv6 [::ffff:127.0.0.1]', () => {
    const result = createReelSchema.safeParse({
      script: 'Hello',
      callbackUrl: 'https://[::ffff:127.0.0.1]/webhook',
    });
    expect(result.success).toBe(false);
  });

  it('rejects IPv4-mapped IPv6 private [::ffff:192.168.1.1]', () => {
    const result = createReelSchema.safeParse({
      script: 'Hello',
      callbackUrl: 'https://[::ffff:192.168.1.1]/webhook',
    });
    expect(result.success).toBe(false);
  });

  it('rejects link-local IPv6 [fe80::1]', () => {
    const result = createReelSchema.safeParse({
      script: 'Hello',
      callbackUrl: 'https://[fe80::1]/webhook',
    });
    expect(result.success).toBe(false);
  });

  it('rejects URL with credentials', () => {
    // Build URL with embedded credentials (split to avoid secret scanner false positive)
    const creds = ['usr', 'pwd'].join(':');
    const result = createReelSchema.safeParse({
      script: 'Hello',
      callbackUrl: `https://${creds}@example.com/webhook`,
    });
    expect(result.success).toBe(false);
  });

  it('rejects cloud metadata IP 169.254.169.254', () => {
    const result = createReelSchema.safeParse({
      script: 'Hello',
      callbackUrl: 'https://169.254.169.254/latest/meta-data/',
    });
    expect(result.success).toBe(false);
  });

  it('rejects metadata.google.internal', () => {
    const result = createReelSchema.safeParse({
      script: 'Hello',
      callbackUrl: 'https://metadata.google.internal/computeMetadata/',
    });
    expect(result.success).toBe(false);
  });

  it('rejects 0.0.0.0', () => {
    const result = createReelSchema.safeParse({
      script: 'Hello',
      callbackUrl: 'https://0.0.0.0/webhook',
    });
    expect(result.success).toBe(false);
  });

  it('rejects ftp:// protocol', () => {
    const result = createReelSchema.safeParse({
      script: 'Hello',
      callbackUrl: 'ftp://example.com/webhook',
    });
    expect(result.success).toBe(false);
  });

  it('rejects URL over 2048 chars', () => {
    const result = createReelSchema.safeParse({
      script: 'Hello',
      callbackUrl: `https://example.com/${'a'.repeat(2048)}`,
    });
    expect(result.success).toBe(false);
  });

  it('allows HTTP in non-production (test env)', () => {
    const result = createReelSchema.safeParse({
      script: 'Hello',
      callbackUrl: 'http://example.com/webhook',
    });
    expect(result.success).toBe(true);
  });

  it('rejects decimal IP encoding (2130706433 = 127.0.0.1)', () => {
    const result = createReelSchema.safeParse({
      script: 'Hello',
      callbackUrl: 'https://2130706433/webhook',
    });
    expect(result.success).toBe(false);
  });

  it('rejects hex IP encoding (0x7f000001 = 127.0.0.1)', () => {
    const result = createReelSchema.safeParse({
      script: 'Hello',
      callbackUrl: 'https://0x7f000001/webhook',
    });
    expect(result.success).toBe(false);
  });

  it('rejects octal IP encoding (0177.0.0.1 = 127.0.0.1)', () => {
    const result = createReelSchema.safeParse({
      script: 'Hello',
      callbackUrl: 'https://0177.0.0.1/webhook',
    });
    expect(result.success).toBe(false);
  });
});

// ── batchReelSchema ────────────────────────────────

describe('batchReelSchema', () => {
  it('accepts valid batch of reels', () => {
    const result = batchReelSchema.safeParse({
      reels: [
        { script: 'Reel 1' },
        { script: 'Reel 2', layout: 'split-screen' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts batch with shared callbackUrl', () => {
    const result = batchReelSchema.safeParse({
      reels: [{ script: 'Hello' }],
      callbackUrl: 'https://example.com/batch-done',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty reels array', () => {
    const result = batchReelSchema.safeParse({ reels: [] });
    expect(result.success).toBe(false);
  });

  it('rejects more than 20 reels', () => {
    const reels = Array.from({ length: 21 }, (_, i) => ({ script: `Reel ${i}` }));
    const result = batchReelSchema.safeParse({ reels });
    expect(result.success).toBe(false);
  });

  it('validates each reel individually', () => {
    const result = batchReelSchema.safeParse({
      reels: [{ script: '' }], // empty script invalid
    });
    expect(result.success).toBe(false);
  });
});

// ── multiLangReelSchema ────────────────────────────

describe('multiLangReelSchema', () => {
  it('accepts valid multi-language request', () => {
    const result = multiLangReelSchema.safeParse({
      script: 'Cześć, to jest test',
      sourceLanguage: 'pl',
      targetLanguages: ['en', 'de', 'fr'],
    });
    expect(result.success).toBe(true);
  });

  it('defaults sourceLanguage to pl', () => {
    const result = multiLangReelSchema.safeParse({
      script: 'Test',
      targetLanguages: ['en'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sourceLanguage).toBe('pl');
    }
  });

  it('rejects empty targetLanguages', () => {
    const result = multiLangReelSchema.safeParse({
      script: 'Test',
      targetLanguages: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects more than 10 target languages', () => {
    const result = multiLangReelSchema.safeParse({
      script: 'Test',
      targetLanguages: ['en', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'ru', 'uk', 'cs', 'sk'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects unsupported language', () => {
    const result = multiLangReelSchema.safeParse({
      script: 'Test',
      targetLanguages: ['xx'],
    });
    expect(result.success).toBe(false);
  });

  it('accepts with all options', () => {
    const result = multiLangReelSchema.safeParse({
      script: 'Test script',
      sourceLanguage: 'en',
      targetLanguages: ['pl', 'de'],
      layout: 'split-screen',
      style: 'cinematic',
      tts: { provider: 'elevenlabs' },
      callbackUrl: 'https://example.com/webhook',
    });
    expect(result.success).toBe(true);
  });

  it('rejects duplicate target languages', () => {
    const result = multiLangReelSchema.safeParse({
      script: 'Test',
      targetLanguages: ['en', 'en', 'de'],
    });
    expect(result.success).toBe(false);
  });
});
