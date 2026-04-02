import { describe, test, expect } from 'vitest';
import {
  renderAnimatedCaption,
  CAPTION_ANIMATION_STYLES,
  getAnimationStyleDisplayName,
} from '../engines/caption-animation-renderer';
import type { SubtitleCue } from '@reelstack/types';

function makeCue(overrides?: Partial<SubtitleCue>): SubtitleCue {
  return {
    id: 'cue-1',
    startTime: 1.0,
    endTime: 3.0,
    text: 'Hello world test',
    words: [
      { text: 'Hello', startTime: 1.0, endTime: 1.4 },
      { text: 'world', startTime: 1.4, endTime: 1.8 },
      { text: 'test', startTime: 1.8, endTime: 2.2 },
    ],
    ...overrides,
  };
}

describe('caption-animation-renderer', () => {
  describe('snap-pop', () => {
    const cue = makeCue({ animationStyle: 'snap-pop' });

    test('words before their startTime are hidden', () => {
      const frame = renderAnimatedCaption(cue, 1.0);
      // "Hello" just started, "world" and "test" not yet
      const worldSeg = frame.segments.find((s) => s.text === 'world');
      expect(worldSeg?.opacity).toBe(0);
      expect(worldSeg?.style).toBe('hidden');
    });

    test('word at startTime has pop scale > 1.0', () => {
      const frame = renderAnimatedCaption(cue, 1.001);
      const helloSeg = frame.segments.find((s) => s.text === 'Hello');
      expect(helloSeg?.opacity).toBe(1);
      expect(helloSeg?.scale).toBeGreaterThan(1.0);
      expect(helloSeg?.scale).toBeLessThanOrEqual(1.3);
    });

    test('word settles to scale 1.0 after pop duration', () => {
      // 0.12s after word start = settled
      const frame = renderAnimatedCaption(cue, 1.15);
      const helloSeg = frame.segments.find((s) => s.text === 'Hello');
      expect(helloSeg?.scale).toBe(1);
      expect(helloSeg?.opacity).toBe(1);
    });

    test('all words visible after all have started', () => {
      const frame = renderAnimatedCaption(cue, 2.0);
      expect(frame.segments.length).toBe(3);
      for (const seg of frame.segments) {
        expect(seg.opacity).toBe(1);
        expect(seg.scale).toBe(1);
      }
    });

    test('returns empty outside cue time range', () => {
      const before = renderAnimatedCaption(cue, 0.5);
      expect(before.visible).toBe(false);
      const after = renderAnimatedCaption(cue, 3.5);
      expect(after.visible).toBe(false);
    });
  });

  test('CAPTION_ANIMATION_STYLES includes snap-pop', () => {
    expect(CAPTION_ANIMATION_STYLES).toContain('snap-pop');
  });

  test('getAnimationStyleDisplayName returns Snap Pop', () => {
    expect(getAnimationStyleDisplayName('snap-pop')).toBe('Snap Pop');
  });
});
