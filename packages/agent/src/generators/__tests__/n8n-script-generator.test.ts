import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateN8nScript, buildWorkflowSummary } from '../n8n-script-generator';
import type { N8nWorkflow } from '../n8n-workflow-fetcher';

const MOCK_WORKFLOW: N8nWorkflow = {
  id: '3121',
  name: 'AI Image Generator',
  description: 'Generate images using AI and save to Google Drive',
  nodes: [
    { id: '1', name: 'Webhook', type: 'n8n-nodes-base.webhook', position: [250, 300], parameters: {} },
    { id: '2', name: 'OpenAI', type: 'n8n-nodes-base.openAi', position: [450, 300], parameters: { operation: 'imageGenerate' } },
    { id: '3', name: 'Google Drive', type: 'n8n-nodes-base.googleDrive', position: [650, 300], parameters: { operation: 'upload' } },
  ],
  connections: {
    Webhook: { main: [[{ node: 'OpenAI', type: 'main', index: 0 }]] },
    OpenAI: { main: [[{ node: 'Google Drive', type: 'main', index: 0 }]] },
  },
};

// ── Pure helper ──────────────────────────────────────────────

describe('buildWorkflowSummary', () => {
  it('builds readable summary of workflow nodes and connections', () => {
    const summary = buildWorkflowSummary(MOCK_WORKFLOW);
    expect(summary).toContain('Webhook');
    expect(summary).toContain('OpenAI');
    expect(summary).toContain('Google Drive');
    expect(summary).toContain('n8n-nodes-base.webhook');
  });

  it('includes node count', () => {
    const summary = buildWorkflowSummary(MOCK_WORKFLOW);
    expect(summary).toContain('3');
  });
});

// ── Script generation (mocked LLM) ──────────────────────────

describe('generateN8nScript', () => {
  const mockLlmCall = vi.fn();

  beforeEach(() => {
    mockLlmCall.mockReset();
  });

  it('returns script with sections matching workflow flow', async () => {
    mockLlmCall.mockResolvedValue(JSON.stringify({
      sections: [
        {
          text: 'This workflow starts with a webhook trigger that listens for incoming requests.',
          highlightNodes: ['Webhook'],
          boardType: 'bird-eye',
        },
        {
          text: 'Next, it sends the request to OpenAI to generate an image.',
          highlightNodes: ['OpenAI'],
          boardType: 'zoom',
        },
        {
          text: 'Finally, the generated image is uploaded to Google Drive.',
          highlightNodes: ['Google Drive'],
          boardType: 'zoom',
        },
      ],
      totalDuration: 30,
    }));

    const script = await generateN8nScript(MOCK_WORKFLOW, { llmCall: mockLlmCall });

    expect(script.sections).toHaveLength(3);
    expect(script.sections[0].text).toContain('webhook');
    expect(script.sections[0].highlightNodes).toContain('Webhook');
    expect(script.sections[0].boardType).toBe('bird-eye');
    expect(script.sections[1].boardType).toBe('zoom');
    expect(script.totalDuration).toBe(30);
  });

  it('passes workflow summary to LLM', async () => {
    mockLlmCall.mockResolvedValue(JSON.stringify({
      sections: [{ text: 'Test', highlightNodes: ['Webhook'], boardType: 'bird-eye' }],
      totalDuration: 10,
    }));

    await generateN8nScript(MOCK_WORKFLOW, { llmCall: mockLlmCall });

    expect(mockLlmCall).toHaveBeenCalledOnce();
    const prompt = mockLlmCall.mock.calls[0][0];
    expect(prompt).toContain('Webhook');
    expect(prompt).toContain('OpenAI');
    expect(prompt).toContain('Google Drive');
  });

  it('respects language option', async () => {
    mockLlmCall.mockResolvedValue(JSON.stringify({
      sections: [{ text: 'Ten workflow...', highlightNodes: ['Webhook'], boardType: 'bird-eye' }],
      totalDuration: 15,
    }));

    await generateN8nScript(MOCK_WORKFLOW, { llmCall: mockLlmCall, language: 'pl' });

    const prompt = mockLlmCall.mock.calls[0][0];
    expect(prompt).toMatch(/polish|polski|pl/i);
  });

  it('throws on invalid LLM response', async () => {
    mockLlmCall.mockResolvedValue('not json at all');

    await expect(
      generateN8nScript(MOCK_WORKFLOW, { llmCall: mockLlmCall }),
    ).rejects.toThrow();
  });

  it('throws on LLM response missing sections', async () => {
    mockLlmCall.mockResolvedValue(JSON.stringify({ totalDuration: 10 }));

    await expect(
      generateN8nScript(MOCK_WORKFLOW, { llmCall: mockLlmCall }),
    ).rejects.toThrow(/sections/i);
  });
});
