/**
 * Fetches and parses n8n workflow JSON from the public n8n.io API.
 *
 * API: GET https://api.n8n.io/api/workflows/{id}
 * No authentication required.
 */

const N8N_API_BASE = 'https://api.n8n.io/api/workflows';

// ── Types ─────────────────────────────────────────────────────

export interface N8nNode {
  id: string;
  name: string;
  type: string;
  position: [number, number];
  parameters: Record<string, unknown>;
  typeVersion?: number;
}

export interface N8nWorkflow {
  /** Workflow ID (from the public URL, e.g. "3121") */
  id: string;
  name: string;
  description: string;
  nodes: N8nNode[];
  connections: Record<string, { main: Array<Array<{ node: string; type: string; index: number }>> }>;
  meta?: Record<string, unknown>;
  tags?: Array<{ id: string; name: string }>;
}

// ── URL parsing ───────────────────────────────────────────────

/**
 * Extract workflow ID from n8n.io URL or plain numeric string.
 * Accepted formats:
 * - "https://n8n.io/workflows/3121"
 * - "https://n8n.io/workflows/3121-my-workflow-name"
 * - "3121"
 */
export function parseWorkflowUrl(input: string): string {
  if (!input) throw new Error('Workflow URL or ID is required');

  // Plain numeric ID
  if (/^\d+$/.test(input.trim())) return input.trim();

  // URL format
  const match = input.match(/n8n\.io\/workflows\/(\d+)/);
  if (!match) throw new Error(`Invalid n8n workflow URL: ${input}. Expected https://n8n.io/workflows/<id>`);

  return match[1];
}

// ── Fetcher ───────────────────────────────────────────────────

/**
 * Fetch workflow from n8n.io public API.
 * Accepts a full URL (https://n8n.io/workflows/3121) or plain ID ("3121").
 */
export async function fetchWorkflow(urlOrId: string): Promise<N8nWorkflow> {
  const id = parseWorkflowUrl(urlOrId);
  const apiUrl = `${N8N_API_BASE}/${id}`;

  const res = await fetch(apiUrl, {
    signal: AbortSignal.timeout(15_000),
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`Workflow ${id} not found (404)`);
    }
    throw new Error(`n8n API error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json() as N8nApiResponse;

  if (!json?.data?.attributes?.workflow) {
    throw new Error(`Invalid API response for workflow ${id}: missing workflow data`);
  }

  const { attributes } = json.data;
  const wf = attributes.workflow;

  return {
    id,
    name: wf.name ?? attributes.name ?? 'Untitled',
    description: attributes.description ?? '',
    nodes: (wf.nodes ?? []).map(n => ({
      id: n.id ?? '',
      name: n.name ?? '',
      type: n.type ?? '',
      position: n.position ?? [0, 0],
      parameters: n.parameters ?? {},
      typeVersion: n.typeVersion,
    })),
    connections: wf.connections ?? {},
    meta: wf.meta,
    tags: wf.tags?.map(t => ({ id: String(t.id), name: t.name })),
  };
}

// ── Internal types ────────────────────────────────────────────

interface N8nApiResponse {
  data?: {
    id: number;
    attributes: {
      name: string;
      description?: string;
      workflow: {
        id?: string;
        name?: string;
        nodes?: Array<{
          id?: string;
          name?: string;
          type?: string;
          position?: [number, number];
          parameters?: Record<string, unknown>;
          typeVersion?: number;
        }>;
        connections?: Record<string, { main: Array<Array<{ node: string; type: string; index: number }>> }>;
        meta?: Record<string, unknown>;
        tags?: Array<{ id: string | number; name: string }>;
      };
    };
  };
}
