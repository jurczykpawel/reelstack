import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWorkflow, parseWorkflowUrl } from '../n8n-workflow-fetcher';

// ── URL parsing (pure) ──────────────────────────────────────

describe('parseWorkflowUrl', () => {
  it('extracts ID from standard n8n.io URL', () => {
    expect(parseWorkflowUrl('https://n8n.io/workflows/3121')).toBe('3121');
  });

  it('extracts ID from URL with slug suffix', () => {
    expect(parseWorkflowUrl('https://n8n.io/workflows/3121-my-workflow-name')).toBe('3121');
  });

  it('extracts ID from URL with trailing slash', () => {
    expect(parseWorkflowUrl('https://n8n.io/workflows/3121/')).toBe('3121');
  });

  it('accepts plain numeric ID', () => {
    expect(parseWorkflowUrl('3121')).toBe('3121');
  });

  it('throws on invalid URL', () => {
    expect(() => parseWorkflowUrl('https://example.com/workflows/3121')).toThrow();
  });

  it('throws on empty input', () => {
    expect(() => parseWorkflowUrl('')).toThrow();
  });
});

// ── Workflow fetching (mocked fetch) ──────────────────────────

const MOCK_API_RESPONSE = {
  data: {
    id: 3121,
    attributes: {
      name: 'Test Workflow',
      description: 'A test n8n workflow',
      workflow: {
        id: 'abc-123',
        name: 'Test Workflow',
        nodes: [
          {
            id: 'node-1',
            name: 'Start',
            type: 'n8n-nodes-base.manualTrigger',
            position: [250, 300],
            parameters: {},
            typeVersion: 1,
          },
          {
            id: 'node-2',
            name: 'HTTP Request',
            type: 'n8n-nodes-base.httpRequest',
            position: [450, 300],
            parameters: { url: 'https://api.example.com/data' },
            typeVersion: 4.2,
          },
        ],
        connections: {
          Start: {
            main: [[{ node: 'HTTP Request', type: 'main', index: 0 }]],
          },
        },
        meta: { instanceId: 'test-instance' },
        tags: [],
        active: false,
        settings: {},
      },
    },
  },
  meta: {},
};

describe('fetchWorkflow', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fetches and parses workflow from n8n API', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => MOCK_API_RESPONSE,
    });

    const workflow = await fetchWorkflow('https://n8n.io/workflows/3121');

    expect(workflow.id).toBe('3121');
    expect(workflow.name).toBe('Test Workflow');
    expect(workflow.description).toBe('A test n8n workflow');
    expect(workflow.nodes).toHaveLength(2);
    expect(workflow.nodes[0].name).toBe('Start');
    expect(workflow.nodes[1].type).toBe('n8n-nodes-base.httpRequest');
    expect(workflow.connections).toBeDefined();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.n8n.io/api/workflows/3121',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('accepts plain numeric ID', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => MOCK_API_RESPONSE,
    });

    const workflow = await fetchWorkflow('3121');
    expect(workflow.id).toBe('3121');
  });

  it('throws on 404', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await expect(fetchWorkflow('99999999')).rejects.toThrow(/not found|404/i);
  });

  it('throws on network error', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

    await expect(fetchWorkflow('3121')).rejects.toThrow('Network error');
  });

  it('throws on malformed API response', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ data: null }),
    });

    await expect(fetchWorkflow('3121')).rejects.toThrow();
  });
});
