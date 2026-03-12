import { describe, it, expect } from 'vitest';
import { buildPresenterExplainerProps } from '../presenter-explainer-orchestrator';
import type { PresenterScript } from '../../generators/presenter-script-generator';
import type { TTSPipelineResult } from '../base-orchestrator';

describe('buildPresenterExplainerProps', () => {
  const script: PresenterScript = {
    sections: [
      {
        text: 'Your computer is slow because of toolbars.',
        boardImageSpec: { type: 'ai-gen', prompt: 'laptop with toolbars' },
        emotion: 'sarcastic',
      },
      {
        text: 'Let me show you how to fix it.',
        boardImageSpec: { type: 'screenshot', url: 'https://example.com/task-manager' },
        emotion: 'helpful',
      },
    ],
    hook: 'Why is your PC slow?',
    cta: 'Follow for more!',
    totalDuration: 30,
  };

  const boardImageUrls = [
    'https://cdn.example.com/board1.png',
    'https://cdn.example.com/board2.png',
  ];

  const cues: TTSPipelineResult['cues'] = [
    { id: '1', text: 'Your computer', startTime: 0, endTime: 3 },
    { id: '2', text: 'is slow', startTime: 3, endTime: 6 },
  ];

  it('creates board sections from image URLs', () => {
    const props = buildPresenterExplainerProps({
      script,
      boardImageUrls,
      avatarVideoUrl: 'https://cdn.example.com/avatar.mp4',
      cues,
      voiceoverUrl: 'https://cdn.example.com/voice.mp3',
      durationSeconds: 30,
    });

    expect(props.boardSections).toHaveLength(2);
    expect(props.boardSections[0].imageUrl).toBe('https://cdn.example.com/board1.png');
    expect(props.boardSections[1].imageUrl).toBe('https://cdn.example.com/board2.png');
  });

  it('distributes timing evenly across board sections', () => {
    const props = buildPresenterExplainerProps({
      script,
      boardImageUrls,
      avatarVideoUrl: 'https://cdn.example.com/avatar.mp4',
      cues,
      voiceoverUrl: 'https://cdn.example.com/voice.mp3',
      durationSeconds: 30,
    });

    expect(props.boardSections[0].startTime).toBe(0);
    expect(props.boardSections[0].endTime).toBe(15);
    expect(props.boardSections[1].startTime).toBe(15);
    expect(props.boardSections[1].endTime).toBe(30);
  });

  it('includes avatar video URL', () => {
    const props = buildPresenterExplainerProps({
      script,
      boardImageUrls,
      avatarVideoUrl: 'https://cdn.example.com/avatar.mp4',
      cues,
      voiceoverUrl: 'https://cdn.example.com/voice.mp3',
      durationSeconds: 30,
    });

    expect(props.avatarVideoUrl).toBe('https://cdn.example.com/avatar.mp4');
  });

  it('sets first section transition to none', () => {
    const props = buildPresenterExplainerProps({
      script,
      boardImageUrls,
      avatarVideoUrl: 'https://cdn.example.com/avatar.mp4',
      cues,
      voiceoverUrl: 'https://cdn.example.com/voice.mp3',
      durationSeconds: 30,
    });

    expect(props.boardSections[0].transition).toBe('none');
    expect(props.boardSections[1].transition).toBe('crossfade');
  });

  it('passes through cues and voiceover', () => {
    const props = buildPresenterExplainerProps({
      script,
      boardImageUrls,
      avatarVideoUrl: 'https://cdn.example.com/avatar.mp4',
      cues,
      voiceoverUrl: 'https://cdn.example.com/voice.mp3',
      durationSeconds: 30,
    });

    expect(props.cues).toHaveLength(2);
    expect(props.voiceoverUrl).toBe('https://cdn.example.com/voice.mp3');
    expect(props.durationSeconds).toBe(30);
  });
});
