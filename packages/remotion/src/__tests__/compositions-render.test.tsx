/**
 * Smoke tests: every Remotion composition renders without crashing.
 *
 * Uses renderToString with mocked Remotion hooks. These tests are intentionally
 * lightweight — they don't validate pixel output, only that the React tree
 * can be constructed without a runtime error (e.g. undefined.layout, missing
 * required props, etc.).
 *
 * For real visual validation use renderStill (slow, requires Chromium).
 */
import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi, beforeAll } from 'vitest';

// ── Mock Remotion ─────────────────────────────────────────────
// Remotion hooks require a Remotion context (Sequence/Composition wrapper).
// We replace them with simple stubs so we can call renderToString without
// starting the full Remotion runtime.
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

// ── Sample props ───────────────────────────────────────────────

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

const sampleScreenExplainerProps = {
  sections: [
    { text: 'Overview', startTime: 0, endTime: 5, svgContent: '<svg><rect width="100" height="100" fill="blue"/></svg>', boardType: 'bird-eye' as const },
    { text: 'Detail', startTime: 5, endTime: 10, svgContent: '<svg><circle r="50" fill="red"/></svg>', boardType: 'zoom' as const },
  ],
  cues: sampleCues,
  voiceoverUrl: 'https://cdn.example.com/voice.mp3',
  durationSeconds: 10,
  backgroundColor: '#1a1a2e',
};

const sampleVideoClipProps = {
  clips: [
    { url: 'https://cdn.example.com/clip1.mp4', startTime: 0, endTime: 5, transition: 'none' as const, transitionDurationMs: 0 },
    { url: 'https://cdn.example.com/clip2.mp4', startTime: 5, endTime: 10, transition: 'crossfade' as const, transitionDurationMs: 300 },
  ],
  cues: sampleCues,
  durationSeconds: 10,
  backgroundColor: '#000000',
  musicVolume: 0.15,
};

const samplePresenterProps = {
  boardSections: [
    { imageUrl: 'https://cdn.example.com/board1.png', startTime: 0, endTime: 15, transition: 'crossfade' as const },
    { imageUrl: 'https://cdn.example.com/board2.png', startTime: 15, endTime: 30, transition: 'slide-left' as const },
  ],
  avatarVideoUrl: 'https://cdn.example.com/avatar.mp4',
  cues: sampleCues,
  durationSeconds: 30,
  backgroundColor: '#0a0a14',
  musicVolume: 0.15,
  boardHeightPercent: 50,
};

// ── Tests ──────────────────────────────────────────────────────

describe('Composition smoke tests (renderToString)', () => {
  it('ReelComposition renders without crashing', async () => {
    const { ReelComposition } = await import('../compositions/ReelComposition');
    expect(() => renderToString(
      React.createElement(ReelComposition, sampleReelProps as never),
    )).not.toThrow();
  });

  it('ScreenExplainerComposition renders without crashing', async () => {
    const { ScreenExplainerComposition } = await import('../compositions/ScreenExplainerComposition');
    expect(() => renderToString(
      React.createElement(ScreenExplainerComposition, sampleScreenExplainerProps as never),
    )).not.toThrow();
  });

  it('VideoClipComposition renders without crashing', async () => {
    const { VideoClipComposition } = await import('../compositions/VideoClipComposition');
    expect(() => renderToString(
      React.createElement(VideoClipComposition, sampleVideoClipProps as never),
    )).not.toThrow();
  });

  it('PresenterExplainerComposition renders without crashing', async () => {
    const { PresenterExplainerComposition } = await import('../compositions/PresenterExplainerComposition');
    expect(() => renderToString(
      React.createElement(PresenterExplainerComposition, samplePresenterProps as never),
    )).not.toThrow();
  });

  it('ScreenExplainerComposition renders SVG content into output', async () => {
    const { ScreenExplainerComposition } = await import('../compositions/ScreenExplainerComposition');
    const html = renderToString(
      React.createElement(ScreenExplainerComposition, sampleScreenExplainerProps as never),
    );
    // SVG content should appear in output — verifies sections are actually rendered
    expect(html).toContain('fill="blue"');
    expect(html).toContain('fill="red"');
  });

  it('VideoClipComposition renders video elements for clips', async () => {
    const { VideoClipComposition } = await import('../compositions/VideoClipComposition');
    const html = renderToString(
      React.createElement(VideoClipComposition, sampleVideoClipProps as never),
    );
    expect(html).toContain('clip1.mp4');
    expect(html).toContain('clip2.mp4');
  });

  it('PresenterExplainerComposition renders board images and avatar', async () => {
    const { PresenterExplainerComposition } = await import('../compositions/PresenterExplainerComposition');
    const html = renderToString(
      React.createElement(PresenterExplainerComposition, samplePresenterProps as never),
    );
    expect(html).toContain('board1.png');
    expect(html).toContain('avatar.mp4');
  });
});
