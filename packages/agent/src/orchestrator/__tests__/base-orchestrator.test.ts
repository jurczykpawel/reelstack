import { describe, it, expect } from 'vitest';
import { buildTimingReference, resolvePresetConfig } from '../base-orchestrator';

describe('buildTimingReference', () => {
  it('returns empty string for empty words array', () => {
    expect(buildTimingReference([])).toBe('');
  });

  it('groups words into sentences by punctuation', () => {
    const words = [
      { text: 'Hello', startTime: 0, endTime: 0.5 },
      { text: 'world.', startTime: 0.5, endTime: 1.0 },
      { text: 'How', startTime: 1.2, endTime: 1.5 },
      { text: 'are', startTime: 1.5, endTime: 1.8 },
      { text: 'you?', startTime: 1.8, endTime: 2.2 },
    ];
    const result = buildTimingReference(words);
    expect(result).toBe(
      '[0.0s-1.0s] Hello world.\n[1.2s-2.2s] How are you?',
    );
  });

  it('flushes remaining words without punctuation as final sentence', () => {
    const words = [
      { text: 'No', startTime: 0, endTime: 0.3 },
      { text: 'punctuation', startTime: 0.3, endTime: 0.8 },
    ];
    const result = buildTimingReference(words);
    expect(result).toBe('[0.0s-0.8s] No punctuation');
  });

  it('handles single word ending with period', () => {
    const words = [{ text: 'Done.', startTime: 5.0, endTime: 5.5 }];
    expect(buildTimingReference(words)).toBe('[5.0s-5.5s] Done.');
  });

  it('handles exclamation marks as sentence boundaries', () => {
    const words = [
      { text: 'Wow!', startTime: 0, endTime: 0.5 },
      { text: 'Cool.', startTime: 0.6, endTime: 1.0 },
    ];
    const result = buildTimingReference(words);
    expect(result).toBe('[0.0s-0.5s] Wow!\n[0.6s-1.0s] Cool.');
  });
});

describe('resolvePresetConfig', () => {
  it('returns defaults when no brand preset provided', () => {
    const config = resolvePresetConfig(undefined);
    expect(config.animationStyle).toBeDefined();
    expect(config.maxWordsPerCue).toBeGreaterThan(0);
    expect(config.maxDurationPerCue).toBeGreaterThan(0);
  });

  it('uses brand preset overrides when provided', () => {
    const config = resolvePresetConfig({
      animationStyle: 'karaoke',
      maxWordsPerCue: 2,
      maxDurationPerCue: 1.5,
    });
    expect(config.animationStyle).toBe('karaoke');
    expect(config.maxWordsPerCue).toBe(2);
    expect(config.maxDurationPerCue).toBe(1.5);
  });

  it('falls back to preset defaults for unspecified fields', () => {
    const config = resolvePresetConfig({ captionPreset: 'mrbeast' });
    expect(config.animationStyle).toBeDefined();
    expect(config.maxWordsPerCue).toBeGreaterThan(0);
  });
});
