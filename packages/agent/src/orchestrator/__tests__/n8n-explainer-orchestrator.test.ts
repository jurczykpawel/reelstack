import { describe, it, expect, vi } from 'vitest';
import { buildScreenExplainerProps } from '../n8n-explainer-orchestrator';
import type { N8nExplainerScript } from '../../generators/n8n-script-generator';

describe('buildScreenExplainerProps', () => {
  const mockScript: N8nExplainerScript = {
    sections: [
      { text: 'Overview of the workflow.', highlightNodes: [], boardType: 'bird-eye' },
      { text: 'The webhook receives data.', highlightNodes: ['Webhook'], boardType: 'zoom' },
      { text: 'OpenAI processes it.', highlightNodes: ['OpenAI'], boardType: 'zoom' },
    ],
    totalDuration: 30,
  };

  const mockSvgs = [
    '<svg>bird-eye</svg>',
    '<svg>zoom-webhook</svg>',
    '<svg>zoom-openai</svg>',
  ];

  const mockCues = [
    { id: '1', text: 'Overview of', startTime: 0, endTime: 4 },
    { id: '2', text: 'the workflow.', startTime: 4, endTime: 8 },
    { id: '3', text: 'The webhook', startTime: 10, endTime: 14 },
    { id: '4', text: 'receives data.', startTime: 14, endTime: 18 },
    { id: '5', text: 'OpenAI processes it.', startTime: 20, endTime: 28 },
  ];

  it('builds props with correct number of sections', () => {
    const props = buildScreenExplainerProps({
      script: mockScript,
      svgs: mockSvgs,
      cues: mockCues,
      voiceoverUrl: 'https://cdn.example.com/voice.mp3',
      durationSeconds: 30,
    });

    expect(props.sections).toHaveLength(3);
    expect(props.voiceoverUrl).toBe('https://cdn.example.com/voice.mp3');
    expect(props.durationSeconds).toBe(30);
  });

  it('distributes timing evenly across sections', () => {
    const props = buildScreenExplainerProps({
      script: mockScript,
      svgs: mockSvgs,
      cues: mockCues,
      voiceoverUrl: 'https://cdn.example.com/voice.mp3',
      durationSeconds: 30,
    });

    // Each section should have startTime < endTime
    for (const section of props.sections) {
      expect(section.endTime).toBeGreaterThan(section.startTime);
    }

    // First section starts at 0
    expect(props.sections[0].startTime).toBe(0);

    // Last section ends at duration
    expect(props.sections[props.sections.length - 1].endTime).toBe(30);

    // No gaps between sections
    for (let i = 1; i < props.sections.length; i++) {
      expect(props.sections[i].startTime).toBe(props.sections[i - 1].endTime);
    }
  });

  it('assigns SVG content to each section', () => {
    const props = buildScreenExplainerProps({
      script: mockScript,
      svgs: mockSvgs,
      cues: mockCues,
      voiceoverUrl: 'https://cdn.example.com/voice.mp3',
      durationSeconds: 30,
    });

    expect(props.sections[0].svgContent).toBe('<svg>bird-eye</svg>');
    expect(props.sections[1].svgContent).toBe('<svg>zoom-webhook</svg>');
    expect(props.sections[2].svgContent).toBe('<svg>zoom-openai</svg>');
  });

  it('preserves board type from script', () => {
    const props = buildScreenExplainerProps({
      script: mockScript,
      svgs: mockSvgs,
      cues: mockCues,
      voiceoverUrl: 'https://cdn.example.com/voice.mp3',
      durationSeconds: 30,
    });

    expect(props.sections[0].boardType).toBe('bird-eye');
    expect(props.sections[1].boardType).toBe('zoom');
  });

  it('passes cues through', () => {
    const props = buildScreenExplainerProps({
      script: mockScript,
      svgs: mockSvgs,
      cues: mockCues,
      voiceoverUrl: 'https://cdn.example.com/voice.mp3',
      durationSeconds: 30,
    });

    expect(props.cues).toHaveLength(5);
    expect(props.cues[0].text).toBe('Overview of');
  });
});
