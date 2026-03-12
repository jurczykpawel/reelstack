/**
 * Generates workflow diagram images (SVG) for n8n-explainer videos.
 *
 * Instead of requiring Playwright + running n8n instance, this generates
 * clean SVG diagrams from the workflow JSON directly. Each section gets
 * a diagram with appropriate zoom level and node highlighting.
 *
 * Future: can be swapped for Playwright-based screenshots of actual n8n editor.
 */
import type { N8nWorkflow } from './n8n-workflow-fetcher';

// ── Types ─────────────────────────────────────────────────────

export interface ScreenshotRequest {
  boardType: 'bird-eye' | 'zoom';
  highlightNodes: string[];
  width: number;
  height: number;
}

export interface NodeLayoutEntry {
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// ── Node colors by category ───────────────────────────────────

const NODE_COLORS: Record<string, { bg: string; border: string }> = {
  trigger: { bg: '#4CAF50', border: '#388E3C' },
  action: { bg: '#2196F3', border: '#1565C0' },
  transform: { bg: '#FF9800', border: '#E65100' },
  default: { bg: '#607D8B', border: '#455A64' },
};

function getNodeCategory(type: string): string {
  if (type.includes('Trigger') || type.includes('webhook') || type.includes('cron') || type.includes('manualTrigger')) return 'trigger';
  if (type.includes('If') || type.includes('Switch') || type.includes('Merge') || type.includes('Function') || type.includes('Set') || type.includes('Code')) return 'transform';
  return 'action';
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

// ── SVG generation ────────────────────────────────────────────

const HIGHLIGHT_COLOR = '#FFD700';
const HIGHLIGHT_GLOW = '#FFD70080';
const DIM_OPACITY = 0.3;
const BG_COLOR = '#1a1a2e';
const TEXT_COLOR = '#ffffff';
const CONNECTION_COLOR = '#666666';

export function generateWorkflowSvg(
  workflow: N8nWorkflow,
  request: ScreenshotRequest,
): string {
  const layout = calculateNodeLayout(workflow);
  if (layout.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${request.width}" height="${request.height}"><rect width="100%" height="100%" fill="${BG_COLOR}"/></svg>`;
  }

  // Calculate bounding box
  const minX = Math.min(...layout.map(n => n.x));
  const maxX = Math.max(...layout.map(n => n.x + n.width));
  const minY = Math.min(...layout.map(n => n.y));
  const maxY = Math.max(...layout.map(n => n.y + n.height));

  const contentWidth = maxX - minX + 100;
  const contentHeight = maxY - minY + 100;

  // Calculate viewBox based on board type
  let viewBox: string;
  if (request.boardType === 'zoom' && request.highlightNodes.length > 0) {
    // Zoom into highlighted nodes
    const highlighted = layout.filter(n => request.highlightNodes.includes(n.name));
    if (highlighted.length > 0) {
      const hMinX = Math.min(...highlighted.map(n => n.x));
      const hMaxX = Math.max(...highlighted.map(n => n.x + n.width));
      const hMinY = Math.min(...highlighted.map(n => n.y));
      const hMaxY = Math.max(...highlighted.map(n => n.y + n.height));
      const padding = 150;
      const zoomW = Math.max(hMaxX - hMinX + padding * 2, 400);
      const zoomH = Math.max(hMaxY - hMinY + padding * 2, 200);
      viewBox = `${hMinX - padding} ${hMinY - padding} ${zoomW} ${zoomH}`;
    } else {
      viewBox = `${minX - 50} ${minY - 50} ${contentWidth} ${contentHeight}`;
    }
  } else {
    viewBox = `${minX - 50} ${minY - 50} ${contentWidth} ${contentHeight}`;
  }

  const highlightSet = new Set(request.highlightNodes);
  const isZoom = request.boardType === 'zoom' && highlightSet.size > 0;

  // Build SVG
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${request.width}" height="${request.height}" viewBox="${viewBox}">`);
  parts.push(`<rect x="${minX - 100}" y="${minY - 100}" width="${contentWidth + 200}" height="${contentHeight + 200}" fill="${BG_COLOR}"/>`);

  // Glow filter for highlights
  parts.push(`<defs>
    <filter id="glow"><feGaussianBlur stdDeviation="6" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>`);

  // Draw connections
  for (const [sourceName, conn] of Object.entries(workflow.connections)) {
    const sourceNode = layout.find(n => n.name === sourceName);
    if (!sourceNode) continue;

    for (const outputs of conn.main) {
      for (const target of outputs) {
        const targetNode = layout.find(n => n.name === target.node);
        if (!targetNode) continue;

        const opacity = isZoom && !highlightSet.has(sourceName) && !highlightSet.has(target.node) ? DIM_OPACITY : 1;
        const x1 = sourceNode.x + sourceNode.width;
        const y1 = sourceNode.y + sourceNode.height / 2;
        const x2 = targetNode.x;
        const y2 = targetNode.y + targetNode.height / 2;
        const cx = (x1 + x2) / 2;

        parts.push(`<path d="M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}" fill="none" stroke="${CONNECTION_COLOR}" stroke-width="3" opacity="${opacity}"/>`);
      }
    }
  }

  // Draw nodes
  for (const node of layout) {
    const isHighlighted = highlightSet.has(node.name);
    const opacity = isZoom && !isHighlighted ? DIM_OPACITY : 1;
    const category = getNodeCategory(node.type);
    const colors = NODE_COLORS[category] ?? NODE_COLORS.default;
    const filter = isHighlighted ? ' filter="url(#glow)"' : '';
    const strokeColor = isHighlighted ? HIGHLIGHT_COLOR : colors.border;
    const strokeWidth = isHighlighted ? 4 : 2;

    parts.push(`<g opacity="${opacity}"${filter}>`);
    parts.push(`<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="8" fill="${colors.bg}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`);

    if (isHighlighted) {
      parts.push(`<rect x="${node.x - 4}" y="${node.y - 4}" width="${node.width + 8}" height="${node.height + 8}" rx="12" fill="none" stroke="${HIGHLIGHT_GLOW}" stroke-width="2"/>`);
    }

    // Node name (truncated if needed)
    const displayName = node.name.length > 18 ? node.name.slice(0, 16) + '...' : node.name;
    parts.push(`<text x="${node.x + node.width / 2}" y="${node.y + node.height / 2 + 5}" text-anchor="middle" fill="${TEXT_COLOR}" font-family="sans-serif" font-size="14" font-weight="bold">${escapeXml(displayName)}</text>`);
    parts.push('</g>');
  }

  parts.push('</svg>');
  return parts.join('\n');
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
