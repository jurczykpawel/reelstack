import { describe, it, expect } from 'vitest';
import { buildScreenExplainerProps } from '../n8n-explainer-orchestrator';
import type { N8nExplainerScript } from '../../generators/n8n-script-generator';
import type { N8nWorkflow } from '../../generators/n8n-workflow-fetcher';

const mockWorkflow: N8nWorkflow = {
  id: '3121',
  name: 'AI Image Generator',
  description: 'Generate images using AI',
  nodes: [
    { id: '1', name: 'Webhook', type: 'n8n-nodes-base.webhook', position: [250, 300], parameters: {} },
    { id: '2', name: 'OpenAI', type: 'n8n-nodes-base.openAi', position: [450, 300], parameters: {} },
    { id: '3', name: 'Google Drive', type: 'n8n-nodes-base.googleDrive', position: [650, 300], parameters: {} },
  ],
  connections: {
    Webhook: { main: [[{ node: 'OpenAI', type: 'main', index: 0 }]] },
    OpenAI: { main: [[{ node: 'Google Drive', type: 'main', index: 0 }]] },
  },
};

describe('buildScreenExplainerProps', () => {
  const mockScript: N8nExplainerScript = {
    sections: [
      { text: 'Overview of the workflow.', highlightNodes: [], boardType: 'bird-eye' },
      { text: 'The webhook receives data.', highlightNodes: ['Webhook'], boardType: 'zoom' },
      { text: 'OpenAI processes it.', highlightNodes: ['OpenAI'], boardType: 'zoom' },
    ],
    totalDuration: 30,
  };

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
      workflow: mockWorkflow,
      screenshotUrl: 'https://cdn.example.com/screenshot.png',
      cues: mockCues,
      voiceoverUrl: 'https://cdn.example.com/voice.mp3',
      durationSeconds: 30,
    });

    expect(props.sections).toHaveLength(3);
    expect(props.screenshotUrl).toBe('https://cdn.example.com/screenshot.png');
    expect(props.voiceoverUrl).toBe('https://cdn.example.com/voice.mp3');
    expect(props.durationSeconds).toBe(30);
  });

  it('distributes timing evenly across sections', () => {
    const props = buildScreenExplainerProps({
      script: mockScript,
      workflow: mockWorkflow,
      screenshotUrl: 'https://cdn.example.com/screenshot.png',
      cues: mockCues,
      voiceoverUrl: 'https://cdn.example.com/voice.mp3',
      durationSeconds: 30,
    });

    expect(props.sections[0].startTime).toBe(0);
    expect(props.sections[props.sections.length - 1].endTime).toBe(30);

    for (let i = 1; i < props.sections.length; i++) {
      expect(props.sections[i].startTime).toBe(props.sections[i - 1].endTime);
    }
  });

  it('computes Ken Burns params per section', () => {
    const props = buildScreenExplainerProps({
      script: mockScript,
      workflow: mockWorkflow,
      screenshotUrl: 'https://cdn.example.com/screenshot.png',
      cues: mockCues,
      voiceoverUrl: 'https://cdn.example.com/voice.mp3',
      durationSeconds: 30,
    });

    // Bird-eye: gentle zoom
    expect(props.sections[0].kenBurns.startScale).toBe(1.0);
    expect(props.sections[0].kenBurns.endScale).toBe(1.05);

    // Zoom sections: higher scale
    expect(props.sections[1].kenBurns.endScale).toBeGreaterThan(1.2);
    expect(props.sections[2].kenBurns.endScale).toBeGreaterThan(1.2);
  });

  it('preserves board type from script', () => {
    const props = buildScreenExplainerProps({
      script: mockScript,
      workflow: mockWorkflow,
      screenshotUrl: 'https://cdn.example.com/screenshot.png',
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
      workflow: mockWorkflow,
      screenshotUrl: 'https://cdn.example.com/screenshot.png',
      cues: mockCues,
      voiceoverUrl: 'https://cdn.example.com/voice.mp3',
      durationSeconds: 30,
    });

    expect(props.cues).toHaveLength(5);
    expect(props.cues[0].text).toBe('Overview of');
  });
});
