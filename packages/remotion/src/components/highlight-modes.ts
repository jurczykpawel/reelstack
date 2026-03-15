import type React from 'react';

export interface HighlightModeRenderer {
  id: string;
  /** Return CSS style object for active (highlighted) word */
  activeStyle: (opts: {
    color: string;
    fontSize: number;
    padding: number;
    borderRadius: number;
  }) => React.CSSProperties;
}

const HIGHLIGHT_MODES = new Map<string, HighlightModeRenderer>();

export function registerHighlightMode(mode: HighlightModeRenderer): void {
  HIGHLIGHT_MODES.set(mode.id, mode);
}

export function getHighlightMode(
  id: string,
): HighlightModeRenderer | undefined {
  return HIGHLIGHT_MODES.get(id);
}

export function listHighlightModes(): string[] {
  return Array.from(HIGHLIGHT_MODES.keys());
}

// ── Public modes ──────────────────────────────────────────────

registerHighlightMode({
  id: 'text',
  activeStyle: () => ({}), // text mode just uses seg.color from renderAnimatedCaption
});

registerHighlightMode({
  id: 'pill',
  activeStyle: ({ color, padding, borderRadius }) => ({
    backgroundColor: color,
    padding: `${padding * 0.4}px ${padding}px`,
    marginLeft: `${-padding}px`,
    marginRight: `${-padding}px`,
    borderRadius,
  }),
});
