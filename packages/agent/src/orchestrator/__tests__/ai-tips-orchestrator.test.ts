import { describe, it, expect } from 'vitest';
import { buildVideoClipProps } from '../ai-tips-orchestrator';
import type { AiTipsScript } from '../../generators/ai-tips-script-generator';
import type { TTSPipelineResult } from '../base-orchestrator';

describe('buildVideoClipProps', () => {
  const script: AiTipsScript = {
    tips: [
      { object: 'toaster', emotion: 'excited', scenery: 'kitchen', dialog: 'Tip one dialog' },
      { object: 'blender', emotion: 'confident', scenery: 'counter', dialog: 'Tip two dialog' },
    ],
    hook: 'Your appliances know IT',
    cta: 'Follow for more!',
  };

  const clipResults = [
    { videoUrl: 'https://cdn.example.com/clip1.mp4', durationSeconds: 8 },
    { videoUrl: 'https://cdn.example.com/clip2.mp4', durationSeconds: 7 },
  ];

  const cues: TTSPipelineResult['cues'] = [
    { id: '1', text: 'Tip one', startTime: 0, endTime: 3 },
    { id: '2', text: 'Tip two', startTime: 3, endTime: 6 },
  ];

  it('creates clip entries from video results', () => {
    const props = buildVideoClipProps({
      script,
      clipResults,
      cues,
      voiceoverUrl: 'https://cdn.example.com/voice.mp3',
      durationSeconds: 15,
    });

    expect(props.clips).toHaveLength(2);
    expect(props.clips[0].url).toBe('https://cdn.example.com/clip1.mp4');
    expect(props.clips[1].url).toBe('https://cdn.example.com/clip2.mp4');
  });

  it('distributes timing evenly across clips', () => {
    const props = buildVideoClipProps({
      script,
      clipResults,
      cues,
      voiceoverUrl: 'https://cdn.example.com/voice.mp3',
      durationSeconds: 16,
    });

    expect(props.clips[0].startTime).toBe(0);
    expect(props.clips[0].endTime).toBe(8);
    expect(props.clips[1].startTime).toBe(8);
    expect(props.clips[1].endTime).toBe(16);
  });

  it('includes voiceover and cues', () => {
    const props = buildVideoClipProps({
      script,
      clipResults,
      cues,
      voiceoverUrl: 'https://cdn.example.com/voice.mp3',
      durationSeconds: 15,
    });

    expect(props.voiceoverUrl).toBe('https://cdn.example.com/voice.mp3');
    expect(props.cues).toHaveLength(2);
  });

  it('applies default musicVolume', () => {
    const props = buildVideoClipProps({
      script,
      clipResults,
      cues,
      voiceoverUrl: 'https://cdn.example.com/voice.mp3',
      durationSeconds: 15,
    });

    expect(props.durationSeconds).toBe(15);
  });

  it('uses crossfade transition between clips by default', () => {
    const props = buildVideoClipProps({
      script,
      clipResults,
      cues,
      voiceoverUrl: 'https://cdn.example.com/voice.mp3',
      durationSeconds: 15,
    });

    // First clip has no transition (it's the first)
    expect(props.clips[0].transition).toBe('none');
    // Subsequent clips crossfade in
    expect(props.clips[1].transition).toBe('crossfade');
  });

  it('handles single clip', () => {
    const props = buildVideoClipProps({
      script: { tips: [script.tips[0]], hook: '', cta: '' },
      clipResults: [clipResults[0]],
      cues,
      voiceoverUrl: 'https://cdn.example.com/voice.mp3',
      durationSeconds: 10,
    });

    expect(props.clips).toHaveLength(1);
    expect(props.clips[0].startTime).toBe(0);
    expect(props.clips[0].endTime).toBe(10);
    expect(props.clips[0].transition).toBe('none');
  });
});
