/**
 * Generates narration script for n8n-explainer videos.
 * LLM analyzes workflow JSON and produces per-section narration
 * with node highlights and board types (bird-eye vs zoom).
 */
import type { N8nWorkflow } from './n8n-workflow-fetcher';

// ── Types ─────────────────────────────────────────────────────

export interface N8nExplainerSection {
  text: string;
  highlightNodes: string[];
  boardType: 'bird-eye' | 'zoom';
}

export interface N8nExplainerScript {
  sections: N8nExplainerSection[];
  totalDuration: number;
}

export interface N8nScriptOptions {
  /** LLM call function - injected for testability */
  llmCall: (prompt: string) => Promise<string>;
  /** Target language (default: 'en') */
  language?: string;
  /** Target duration in seconds (default: 45) */
  targetDuration?: number;
}

// ── Pure helpers ──────────────────────────────────────────────

/**
 * Build a human-readable summary of the workflow for the LLM prompt.
 * Includes nodes, their types, connections, and overall structure.
 */
export function buildWorkflowSummary(workflow: N8nWorkflow): string {
  const lines: string[] = [];
  lines.push(`Workflow: "${workflow.name}" (${workflow.nodes.length} nodes)`);
  if (workflow.description) {
    lines.push(`Description: ${workflow.description}`);
  }

  lines.push('');
  lines.push('Nodes:');
  for (const node of workflow.nodes) {
    const params = Object.keys(node.parameters).length > 0
      ? ` [params: ${Object.keys(node.parameters).join(', ')}]`
      : '';
    lines.push(`  - "${node.name}" (${node.type})${params}`);
  }

  lines.push('');
  lines.push('Connections:');
  for (const [source, conn] of Object.entries(workflow.connections)) {
    for (const [type, outputGroups] of Object.entries(conn)) {
      for (const outputs of outputGroups) {
        for (const target of outputs) {
          const label = type === 'main' ? '' : ` [${type}]`;
          lines.push(`  "${source}" → "${target.node}"${label}`);
        }
      }
    }
  }

  return lines.join('\n');
}

// ── Script generator ──────────────────────────────────────────

const SYSTEM_PROMPT = `You are a video script writer for n8n workflow explainer videos.
Given a workflow structure, write a narration script that explains what the workflow does,
step by step, in a clear and engaging way.

Output MUST be valid JSON with this exact structure:
{
  "sections": [
    {
      "text": "narration text for this section",
      "highlightNodes": ["NodeName1"],
      "boardType": "bird-eye" or "zoom"
    }
  ],
  "totalDuration": <estimated duration in seconds>
}

Rules:
- Start with a bird-eye overview section (boardType: "bird-eye") showing the full workflow
- Then zoom into each key node/step (boardType: "zoom") with highlightNodes naming the focused node(s)
- End with a bird-eye summary if the workflow is complex (4+ nodes)
- Each section should be 1-3 sentences (5-15 seconds of speech)
- highlightNodes MUST use exact node names from the workflow
- Keep it conversational and easy to follow
- Explain WHAT the workflow does, not technical implementation details
- Output ONLY the JSON, no markdown, no extra text`;

export async function generateN8nScript(
  workflow: N8nWorkflow,
  options: N8nScriptOptions,
): Promise<N8nExplainerScript> {
  const language = options.language ?? 'en';
  const targetDuration = options.targetDuration ?? 45;
  const summary = buildWorkflowSummary(workflow);

  const prompt = `${SYSTEM_PROMPT}

Language: ${language === 'pl' ? 'Polish (polski)' : language === 'en' ? 'English' : language}
Target duration: ~${targetDuration} seconds

Workflow to explain:
${summary}`;

  const response = await options.llmCall(prompt);

  // Parse and validate
  let parsed: unknown;
  try {
    // Strip markdown code fences if present
    const cleaned = response.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`LLM returned invalid JSON for n8n script: ${response.slice(0, 200)}`);
  }

  const obj = parsed as Record<string, unknown>;

  if (!Array.isArray(obj.sections) || obj.sections.length === 0) {
    throw new Error('LLM response missing sections array');
  }

  const sections: N8nExplainerSection[] = obj.sections.map((s: Record<string, unknown>) => ({
    text: String(s.text ?? ''),
    highlightNodes: Array.isArray(s.highlightNodes) ? s.highlightNodes.map(String) : [],
    boardType: s.boardType === 'zoom' ? 'zoom' : 'bird-eye',
  }));

  return {
    sections,
    totalDuration: typeof obj.totalDuration === 'number' ? obj.totalDuration : targetDuration,
  };
}
