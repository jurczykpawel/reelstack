/**
 * presenter-explainer Remotion module.
 *
 * Self-registers the PresenterExplainer composition on import.
 */

import { registerComposition } from '../../compositions/registry';
import { PresenterExplainerComposition } from './composition';
import { presenterExplainerPropsSchema } from './schema';

const FPS = 30;

registerComposition({
  id: 'PresenterExplainer',
  component: PresenterExplainerComposition,
  schema: presenterExplainerPropsSchema,
  width: 1080,
  height: 1920,
  defaultDurationInFrames: FPS * 60,
  fps: FPS,
  defaultProps: {
    boardSections: [{
      imageUrl: 'https://example.com/board1.png',
      startTime: 0,
      endTime: 30,
      transition: 'crossfade' as const,
      transitionDurationMs: 300,
    }],
    avatarVideoUrl: 'https://example.com/avatar.mp4',
    cues: [
      { id: '1', text: 'Welcome to this explainer', startTime: 0, endTime: 3 },
      { id: '2', text: 'Let me show you something', startTime: 3, endTime: 6 },
    ],
    durationSeconds: 60,
    musicVolume: 0.15,
    backgroundColor: '#0a0a14',
    boardHeightPercent: 50,
  },
});

// Re-export for consumers
export { presenterExplainerPropsSchema, type PresenterExplainerProps, type BoardSection } from './schema';
export { PresenterExplainerComposition } from './composition';
