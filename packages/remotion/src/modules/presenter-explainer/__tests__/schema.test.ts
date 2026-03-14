import { describe, it, expect } from 'vitest';
import { presenterExplainerPropsSchema } from '../schema';

describe('presenterExplainerPropsSchema', () => {
  const validProps = {
    boardSections: [{
      imageUrl: 'https://cdn.example.com/board1.png',
      startTime: 0,
      endTime: 15,
    }],
    avatarVideoUrl: 'https://cdn.example.com/avatar.mp4',
    cues: [{
      id: '1',
      text: 'Welcome to the explanation',
      startTime: 0,
      endTime: 3,
    }],
    durationSeconds: 60,
  };

  it('accepts valid minimal props', () => {
    const result = presenterExplainerPropsSchema.safeParse(validProps);
    expect(result.success).toBe(true);
  });

  it('provides defaults', () => {
    const result = presenterExplainerPropsSchema.safeParse(validProps);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.backgroundColor).toBe('#0a0a14');
      expect(result.data.musicVolume).toBe(0.15);
      expect(result.data.boardHeightPercent).toBe(50);
      expect(result.data.boardSections[0].transition).toBe('crossfade');
    }
  });

  it('accepts multiple board sections', () => {
    const result = presenterExplainerPropsSchema.safeParse({
      ...validProps,
      boardSections: [
        { imageUrl: 'https://cdn.example.com/board1.png', startTime: 0, endTime: 15 },
        { imageUrl: 'https://cdn.example.com/board2.png', startTime: 15, endTime: 30, transition: 'slide-left' },
        { imageUrl: 'https://cdn.example.com/board3.png', startTime: 30, endTime: 45, transition: 'zoom-in' },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.boardSections).toHaveLength(3);
    }
  });

  it('accepts full props with music and caption style', () => {
    const result = presenterExplainerPropsSchema.safeParse({
      ...validProps,
      voiceoverUrl: 'https://cdn.example.com/voice.mp3',
      musicUrl: 'https://cdn.example.com/bg-music.mp3',
      musicVolume: 0.1,
      boardHeightPercent: 55,
      captionStyle: {
        fontSize: 48,
        highlightColor: '#FF4444',
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty boardSections array', () => {
    const result = presenterExplainerPropsSchema.safeParse({
      ...validProps,
      boardSections: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects zero durationSeconds', () => {
    const result = presenterExplainerPropsSchema.safeParse({
      ...validProps,
      durationSeconds: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects boardHeightPercent out of range', () => {
    const result = presenterExplainerPropsSchema.safeParse({
      ...validProps,
      boardHeightPercent: 10,
    });
    expect(result.success).toBe(false);
  });
});
