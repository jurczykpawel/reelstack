import { describe, it, expect } from 'vitest';
import { screenExplainerPropsSchema } from '../schemas/screen-explainer-props';

describe('screenExplainerPropsSchema', () => {
  const validProps = {
    sections: [{
      text: 'This workflow starts with a webhook.',
      startTime: 0,
      endTime: 5,
      svgContent: '<svg></svg>',
      boardType: 'bird-eye' as const,
    }],
    cues: [{
      id: '1',
      text: 'This workflow',
      startTime: 0,
      endTime: 1.5,
    }],
    voiceoverUrl: 'https://cdn.example.com/voice.mp3',
    durationSeconds: 30,
  };

  it('accepts valid minimal props', () => {
    const result = screenExplainerPropsSchema.safeParse(validProps);
    expect(result.success).toBe(true);
  });

  it('provides default backgroundColor', () => {
    const result = screenExplainerPropsSchema.safeParse(validProps);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.backgroundColor).toBe('#1a1a2e');
    }
  });

  it('accepts full props with Ken Burns and caption style', () => {
    const result = screenExplainerPropsSchema.safeParse({
      ...validProps,
      sections: [{
        ...validProps.sections[0],
        kenBurns: {
          startScale: 1.0,
          endScale: 1.2,
          startPosition: { x: 40, y: 50 },
          endPosition: { x: 60, y: 50 },
        },
      }],
      captionStyle: {
        fontSize: 72,
        fontColor: '#FFFFFF',
        highlightColor: '#FF0000',
        position: 75,
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty sections array', () => {
    const result = screenExplainerPropsSchema.safeParse({
      ...validProps,
      sections: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid boardType', () => {
    const result = screenExplainerPropsSchema.safeParse({
      ...validProps,
      sections: [{
        ...validProps.sections[0],
        boardType: 'invalid',
      }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative startTime', () => {
    const result = screenExplainerPropsSchema.safeParse({
      ...validProps,
      sections: [{
        ...validProps.sections[0],
        startTime: -1,
      }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects zero durationSeconds', () => {
    const result = screenExplainerPropsSchema.safeParse({
      ...validProps,
      durationSeconds: 0,
    });
    expect(result.success).toBe(false);
  });

  it('accepts cues with word-level timing', () => {
    const result = screenExplainerPropsSchema.safeParse({
      ...validProps,
      cues: [{
        id: '1',
        text: 'Hello world',
        startTime: 0,
        endTime: 2,
        words: [
          { text: 'Hello', startTime: 0, endTime: 1 },
          { text: 'world', startTime: 1, endTime: 2 },
        ],
        animationStyle: 'word-highlight',
      }],
    });
    expect(result.success).toBe(true);
  });
});
