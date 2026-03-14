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
  it('returns overview zoom for bird-eye', () => {
    const kb = computeKenBurnsParams(MOCK_WORKFLOW, {
      boardType: 'bird-eye',
      highlightNodes: [],
    });
    expect(kb.startScale).toBe(2.6);
    expect(kb.endScale).toBe(2.9);
    expect(kb.startPosition.x).toBeCloseTo(48, 0);
    expect(kb.endPosition.x).toBeCloseTo(52, 0);
  });

  it('zooms into highlighted node', () => {
    const kb = computeKenBurnsParams(MOCK_WORKFLOW, {
      boardType: 'zoom',
      highlightNodes: ['OpenAI'],
    });
    // Single node (1/3 coverage ~0.33, <= 0.5): startScale=3.2, endScale=3.5
    expect(kb.startScale).toBeGreaterThan(3.0);
    expect(kb.endScale).toBeGreaterThan(3.3);
    expect(kb.endScale).toBeLessThan(4.0);
    // Focus should be roughly in the center (OpenAI is middle node)
    // Clamped to 25-75 range
    expect(kb.startPosition.x).toBeGreaterThan(24);
    expect(kb.startPosition.x).toBeLessThan(76);
  });

  it('zooms into first node (left side, clamped)', () => {
    const kb = computeKenBurnsParams(MOCK_WORKFLOW, {
      boardType: 'zoom',
      highlightNodes: ['Webhook'],
    });
    // Focus should be on the left side (clamped to 25, minus drift = 23)
    expect(kb.startPosition.x).toBeLessThanOrEqual(50);
    expect(kb.startPosition.x).toBeGreaterThanOrEqual(22);
  });

  it('zooms into last node (right side, clamped)', () => {
    const kb = computeKenBurnsParams(MOCK_WORKFLOW, {
      boardType: 'zoom',
      highlightNodes: ['Google Drive'],
    });
    // Focus should be on the right side (clamped to 25-75 range)
    expect(kb.startPosition.x).toBeGreaterThanOrEqual(50);
    expect(kb.startPosition.x).toBeLessThanOrEqual(76);
  });

  it('falls back to bird-eye for empty highlights', () => {
    const kb = computeKenBurnsParams(MOCK_WORKFLOW, {
      boardType: 'zoom',
      highlightNodes: [],
    });
    expect(kb.startScale).toBe(2.6);
    expect(kb.endScale).toBe(2.9);
  });

  it('falls back for non-existent node names', () => {
    const kb = computeKenBurnsParams(MOCK_WORKFLOW, {
      boardType: 'zoom',
      highlightNodes: ['NonExistent'],
    });
    expect(kb.startScale).toBe(2.6);
    expect(kb.endScale).toBe(2.9);
  });

  it('handles multiple highlighted nodes', () => {
    const kb = computeKenBurnsParams(MOCK_WORKFLOW, {
      boardType: 'zoom',
      highlightNodes: ['Webhook', 'OpenAI'],
    });
    // 2/3 coverage ~0.67 > 0.5 → startScale=2.8, endScale=3.2
    expect(kb.endScale).toBeCloseTo(3.2, 1);
    expect(kb.endScale).toBeGreaterThan(3.0);
  });
});
