import { describe, it, expect } from 'vitest';
import { videoClipPropsSchema } from '../schema';

describe('videoClipPropsSchema', () => {
  const validProps = {
    clips: [{
      url: 'https://cdn.example.com/clip1.mp4',
      startTime: 0,
      endTime: 5,
    }],
    cues: [{
      id: '1',
      text: 'First tip',
      startTime: 0,
      endTime: 2,
    }],
    durationSeconds: 30,
  };

  it('accepts valid minimal props', () => {
    const result = videoClipPropsSchema.safeParse(validProps);
    expect(result.success).toBe(true);
  });

  it('provides defaults', () => {
    const result = videoClipPropsSchema.safeParse(validProps);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.backgroundColor).toBe('#000000');
      expect(result.data.musicVolume).toBe(0.15);
      expect(result.data.clips[0].transition).toBe('crossfade');
      expect(result.data.clips[0].transitionDurationMs).toBe(300);
    }
  });

  it('accepts multiple clips', () => {
    const result = videoClipPropsSchema.safeParse({
      ...validProps,
      clips: [
        { url: 'https://cdn.example.com/clip1.mp4', startTime: 0, endTime: 5 },
        { url: 'https://cdn.example.com/clip2.mp4', startTime: 5, endTime: 10, transition: 'slide-left' },
        { url: 'https://cdn.example.com/clip3.mp4', startTime: 10, endTime: 15, transition: 'zoom-in' },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clips).toHaveLength(3);
    }
  });

  it('accepts full props with voiceover and music', () => {
    const result = videoClipPropsSchema.safeParse({
      ...validProps,
      voiceoverUrl: 'https://cdn.example.com/voice.mp3',
      musicUrl: 'https://cdn.example.com/bg-music.mp3',
      musicVolume: 0.2,
      captionStyle: {
        fontSize: 72,
        highlightColor: '#FF0000',
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty clips array', () => {
    const result = videoClipPropsSchema.safeParse({
      ...validProps,
      clips: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects zero durationSeconds', () => {
    const result = videoClipPropsSchema.safeParse({
      ...validProps,
      durationSeconds: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid transition type', () => {
    const result = videoClipPropsSchema.safeParse({
      ...validProps,
      clips: [{
        url: 'https://cdn.example.com/clip1.mp4',
        startTime: 0,
        endTime: 5,
        transition: 'bounce',
      }],
    });
    expect(result.success).toBe(false);
  });
});
