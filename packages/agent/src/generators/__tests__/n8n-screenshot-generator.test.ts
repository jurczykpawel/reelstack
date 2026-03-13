import { describe, it, expect } from 'vitest';
import {
  computeKenBurnsParams,
  calculateNodeLayout,
} from '../n8n-screenshot-generator';
import type { N8nWorkflow } from '../n8n-workflow-fetcher';

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
    expect(layout[0].x).toBeLessThan(layout[1].x);
    expect(layout[1].x).toBeLessThan(layout[2].x);
  });
});

describe('computeKenBurnsParams', () => {
  it('returns gentle drift for bird-eye', () => {
    const kb = computeKenBurnsParams(MOCK_WORKFLOW, {
      boardType: 'bird-eye',
      highlightNodes: [],
    });
    expect(kb.startScale).toBe(1.0);
    expect(kb.endScale).toBe(1.05);
    expect(kb.startPosition.x).toBeCloseTo(48, 0);
    expect(kb.endPosition.x).toBeCloseTo(52, 0);
  });

  it('zooms into highlighted node', () => {
    const kb = computeKenBurnsParams(MOCK_WORKFLOW, {
      boardType: 'zoom',
      highlightNodes: ['OpenAI'],
    });
    // Should zoom more than bird-eye
    expect(kb.startScale).toBeGreaterThan(1.2);
    expect(kb.endScale).toBeGreaterThan(1.3);
    // Focus should be roughly in the center (OpenAI is middle node)
    expect(kb.startPosition.x).toBeGreaterThan(30);
    expect(kb.startPosition.x).toBeLessThan(70);
  });

  it('zooms into first node (left side)', () => {
    const kb = computeKenBurnsParams(MOCK_WORKFLOW, {
      boardType: 'zoom',
      highlightNodes: ['Webhook'],
    });
    // Focus should be on the left side
    expect(kb.startPosition.x).toBeLessThan(50);
  });

  it('zooms into last node (right side)', () => {
    const kb = computeKenBurnsParams(MOCK_WORKFLOW, {
      boardType: 'zoom',
      highlightNodes: ['Google Drive'],
    });
    // Focus should be on the right side
    expect(kb.startPosition.x).toBeGreaterThan(50);
  });

  it('falls back to bird-eye for empty highlights', () => {
    const kb = computeKenBurnsParams(MOCK_WORKFLOW, {
      boardType: 'zoom',
      highlightNodes: [],
    });
    expect(kb.startScale).toBe(1.0);
    expect(kb.endScale).toBe(1.05);
  });

  it('falls back for non-existent node names', () => {
    const kb = computeKenBurnsParams(MOCK_WORKFLOW, {
      boardType: 'zoom',
      highlightNodes: ['NonExistent'],
    });
    expect(kb.startScale).toBe(1.0);
    expect(kb.endScale).toBe(1.05);
  });

  it('handles multiple highlighted nodes', () => {
    const kb = computeKenBurnsParams(MOCK_WORKFLOW, {
      boardType: 'zoom',
      highlightNodes: ['Webhook', 'OpenAI'],
    });
    // Wider coverage = less zoom
    expect(kb.endScale).toBeLessThan(1.8);
    expect(kb.endScale).toBeGreaterThan(1.0);
  });
});
