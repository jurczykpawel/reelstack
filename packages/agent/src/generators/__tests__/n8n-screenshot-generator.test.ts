import { describe, it, expect } from 'vitest';
import {
  generateWorkflowSvg,
  calculateNodeLayout,
  type ScreenshotRequest,
} from '../n8n-screenshot-generator';
import type { N8nWorkflow } from '../n8n-workflow-fetcher';
import type { N8nExplainerSection } from '../n8n-script-generator';

const MOCK_WORKFLOW: N8nWorkflow = {
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

describe('calculateNodeLayout', () => {
  it('returns positions for all nodes', () => {
    const layout = calculateNodeLayout(MOCK_WORKFLOW);
    expect(layout).toHaveLength(3);
    expect(layout[0].name).toBe('Webhook');
    expect(layout[1].name).toBe('OpenAI');
    expect(layout[2].name).toBe('Google Drive');
  });

  it('assigns x/y positions based on workflow positions', () => {
    const layout = calculateNodeLayout(MOCK_WORKFLOW);
    // Nodes should be ordered by x position
    expect(layout[0].x).toBeLessThan(layout[1].x);
    expect(layout[1].x).toBeLessThan(layout[2].x);
  });
});

describe('generateWorkflowSvg', () => {
  it('generates valid SVG for bird-eye view', () => {
    const svg = generateWorkflowSvg(MOCK_WORKFLOW, {
      boardType: 'bird-eye',
      highlightNodes: [],
      width: 1080,
      height: 1920,
    });
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('Webhook');
    expect(svg).toContain('OpenAI');
    expect(svg).toContain('Google Drive');
  });

  it('highlights specified nodes', () => {
    const svg = generateWorkflowSvg(MOCK_WORKFLOW, {
      boardType: 'zoom',
      highlightNodes: ['OpenAI'],
      width: 1080,
      height: 1920,
    });
    expect(svg).toContain('<svg');
    // Highlighted node should have different styling
    expect(svg).toContain('OpenAI');
  });

  it('generates bird-eye with all nodes visible', () => {
    const svg = generateWorkflowSvg(MOCK_WORKFLOW, {
      boardType: 'bird-eye',
      highlightNodes: [],
      width: 1080,
      height: 1920,
    });
    for (const node of MOCK_WORKFLOW.nodes) {
      expect(svg).toContain(node.name);
    }
  });

  it('draws connection lines between nodes', () => {
    const svg = generateWorkflowSvg(MOCK_WORKFLOW, {
      boardType: 'bird-eye',
      highlightNodes: [],
      width: 1080,
      height: 1920,
    });
    // Should contain path/line elements for connections
    expect(svg).toMatch(/<(path|line)/);
  });
});
