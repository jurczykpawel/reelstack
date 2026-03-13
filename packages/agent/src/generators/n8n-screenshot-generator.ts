/**
 * Ken Burns parameter computation for n8n-explainer videos.
 *
 * Uses workflow node positions to calculate zoom/pan targets
 * for each script section. The actual screenshot is provided
 * by an N8nScreenshotProvider (see n8n-screenshot-provider.ts).
 */
import type { N8nWorkflow } from './n8n-workflow-fetcher';
import type { KenBurnsParams } from '@reelstack/remotion/schemas/screen-explainer-props';

// ── Types ─────────────────────────────────────────────────────

export interface NodeLayoutEntry {
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// ── Layout calculation ────────────────────────────────────────

const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;

export function calculateNodeLayout(workflow: N8nWorkflow): NodeLayoutEntry[] {
  return workflow.nodes
    .map(node => ({
      name: node.name,
      type: node.type,
      x: node.position[0],
      y: node.position[1],
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    }))
    .sort((a, b) => a.x - b.x || a.y - b.y);
}

// ── Ken Burns computation ─────────────────────────────────────

/**
 * Compute Ken Burns parameters for a script section.
 *
 * - bird-eye: gentle drift across the full workflow (scale ~1.0 → 1.05)
 * - zoom: centers on highlightNodes with moderate scale (1.15 → 1.3)
 *
 * Position values are kept close to center (35-65 range) to prevent
 * jarring jumps between sections. The composition uses smooth eased
 * transitions, but the source params must also be reasonable.
 *
 * Returns % positions (0-100) for CSS transform-origin.
 */
export function computeKenBurnsParams(
  workflow: N8nWorkflow,
  section: { boardType: 'bird-eye' | 'zoom'; highlightNodes: string[] },
): KenBurnsParams {
  const layout = calculateNodeLayout(workflow);
  if (layout.length === 0) {
    return { startScale: 1.0, endScale: 1.05, startPosition: { x: 50, y: 50 }, endPosition: { x: 50, y: 50 } };
  }

  // Full workflow bounding box
  const allMinX = Math.min(...layout.map(n => n.x));
  const allMaxX = Math.max(...layout.map(n => n.x + n.width));
  const allMinY = Math.min(...layout.map(n => n.y));
  const allMaxY = Math.max(...layout.map(n => n.y + n.height));
  const allW = allMaxX - allMinX || 1;
  const allH = allMaxY - allMinY || 1;

  if (section.boardType === 'bird-eye' || section.highlightNodes.length === 0) {
    // Bird-eye: gentle drift, centered
    return {
      startScale: 1.0,
      endScale: 1.05,
      startPosition: { x: 48, y: 48 },
      endPosition: { x: 52, y: 52 },
    };
  }

  // Zoom: center on highlighted nodes
  const highlighted = layout.filter(n => section.highlightNodes.includes(n.name));
  if (highlighted.length === 0) {
    // Fallback: no matching nodes found, treat as bird-eye
    return {
      startScale: 1.0,
      endScale: 1.05,
      startPosition: { x: 50, y: 50 },
      endPosition: { x: 50, y: 50 },
    };
  }

  // Center of highlighted nodes in workflow coordinates
  const hCenterX = highlighted.reduce((s, n) => s + n.x + n.width / 2, 0) / highlighted.length;
  const hCenterY = highlighted.reduce((s, n) => s + n.y + n.height / 2, 0) / highlighted.length;

  // Convert to % of full workflow bounding box
  const pctX = ((hCenterX - allMinX) / allW) * 100;
  const pctY = ((hCenterY - allMinY) / allH) * 100;

  // Clamp to narrow range (35-65) to prevent extreme position jumps
  const focusX = Math.max(35, Math.min(65, pctX));
  const focusY = Math.max(35, Math.min(65, pctY));

  // Moderate zoom scale - enough to highlight but not extreme
  // Coverage: more nodes highlighted = less zoom needed
  const coverage = highlighted.length / layout.length;
  const zoomScale = coverage > 0.5 ? 1.15 : coverage > 0.25 ? 1.25 : 1.35;

  return {
    startScale: zoomScale - 0.05,
    endScale: zoomScale,
    startPosition: { x: focusX - 1, y: focusY - 1 },
    endPosition: { x: focusX + 1, y: focusY + 1 },
  };
}
