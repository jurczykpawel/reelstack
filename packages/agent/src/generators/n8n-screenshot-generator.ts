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
 * - bird-eye: full image visible with gentle drift (1.0 → 1.1)
 * - zoom: meaningful zoom into highlighted nodes (1.5 → 2.5x)
 *
 * The composition uses smooth bezier-eased transitions between sections,
 * so we can use substantial zoom differences without jumping. Position
 * values clamped to 25-75% to stay within reasonable bounds while still
 * allowing clear directional movement.
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
    // Bird-eye: overview that fills most of the portrait frame.
    // For 3840x2160 screenshot in 1080x1920 video:
    //   baseScale = 1080/3840 = 0.28, so imgH at scale 1.0 = 607px in 1920px frame (32%)
    //   At 2.5x: imgH = 1519px (79%) — some background visible
    //   At 2.8x: imgH = 1701px (89%) — almost fills frame
    //   At 3.16x: imgH = 1920px (100%) — fills frame exactly
    return {
      startScale: 2.6,
      endScale: 2.9,
      startPosition: { x: 48, y: 45 },
      endPosition: { x: 52, y: 55 },
    };
  }

  // Zoom: center on highlighted nodes
  const highlighted = layout.filter(n => section.highlightNodes.includes(n.name));
  if (highlighted.length === 0) {
    // Fallback: no matching nodes found, treat as bird-eye
    return {
      startScale: 2.6,
      endScale: 2.9,
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

  // Clamp to 25-75% — allows meaningful directional movement while
  // staying away from edges. Smooth transitions handle the rest.
  const focusX = Math.max(25, Math.min(75, pctX));
  const focusY = Math.max(25, Math.min(75, pctY));

  // Zoom scale: fewer highlighted nodes = tighter zoom.
  // With manual positioning (fit-to-width base), these scales directly
  // control how much of the image width is visible.
  // For 3840x2160 in 1080x1920: baseScale=0.28, imgH_base=607px.
  // At 3.5x: imgH=2125px (>1920, fills frame). At 3.2x: imgH=1943px (barely fills).
  // We want imgH >= containerH (1920) so scale >= 1920/607 ≈ 3.16.
  // All zoom scales should be >= 3.2 to avoid gaps.
  const coverage = highlighted.length / layout.length;
  let startScale: number;
  let endScale: number;
  if (coverage <= 0.25) {
    startScale = 3.5;
    endScale = 3.8;
  } else if (coverage <= 0.5) {
    startScale = 3.2;
    endScale = 3.5;
  } else {
    startScale = 2.8;
    endScale = 3.2;
  }

  return {
    startScale,
    endScale,
    startPosition: { x: focusX - 2, y: focusY - 2 },
    endPosition: { x: focusX + 2, y: focusY + 2 },
  };
}
