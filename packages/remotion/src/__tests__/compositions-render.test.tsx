/**
 * Smoke tests: every Remotion composition renders without crashing.
 *
 * Uses renderToString with mocked Remotion hooks. These tests are intentionally
 * lightweight — they don't validate pixel output, only that the React tree
 * can be constructed without a runtime error (e.g. undefined.layout, missing
 * required props, etc.).
 *
 * Core compositions are tested with explicit props.
 * Module compositions (n8n-explainer, ai-tips, presenter-explainer) live in
 * @reelstack/modules and are NOT tested here — they have their own test suite.
 */
import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';

// ── Mock Remotion ─────────────────────────────────────────────
vi.mock('remotion', () => ({
  useCurrentFrame: () => 0,
  useVideoConfig: () => ({ fps: 30, durationInFrames: 300, width: 1080, height: 1920, id: 'Test' }),
  AbsoluteFill: ({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) =>
    React.createElement('div', { style }, children),
  Audio: () => null,
  Sequence: ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  Img: ({ src, style }: { src?: string; style?: React.CSSProperties }) =>
    React.createElement('img', { src, style }),
  OffthreadVideo: ({ src, style }: { src?: string; style?: React.CSSProperties }) =>
    React.createElement('video', { src, style }),
  interpolate: (value: number, input: number[], output: number[]) => {
    if (input.length < 2 || output.length < 2) return output[0] ?? 0;
    const t = (value - input[0]) / (input[input.length - 1] - input[0]);
    return output[0] + t * (output[output.length - 1] - output[0]);
  },
  random: (_seed?: string | number) => 0.5,
  staticFile: (s: string) => s,
  spring: () => 1,
  noise2D: () => 0,
  Easing: { bezier: () => (t: number) => t, linear: (t: number) => t },
}));

// ── Core composition sample props ─────────────────────────────

const sampleCues = [
  { id: '1', text: 'Hello world', startTime: 0, endTime: 2 },
  { id: '2', text: 'This is a test', startTime: 2, endTime: 5 },
];

const sampleReelProps = {
  layout: 'fullscreen' as const,
  primaryVideoUrl: 'https://cdn.example.com/primary.mp4',
  cues: sampleCues,
  bRollSegments: [],
  speedRamps: [],
  durationSeconds: 10,
  showProgressBar: false,
  backgroundColor: '#000000',
};

// ── Tests ──────────────────────────────────────────────────────

describe('Core composition smoke tests', () => {
  it('ReelComposition renders without crashing', async () => {
    const { ReelComposition } = await import('../compositions/ReelComposition');
    expect(() => renderToString(
      React.createElement(ReelComposition, sampleReelProps as never),
    )).not.toThrow();
  });
});
