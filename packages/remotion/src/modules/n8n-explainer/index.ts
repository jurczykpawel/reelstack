/**
 * n8n-explainer Remotion module.
 *
 * Self-registers the ScreenExplainer composition on import.
 * When extracted to a closed repo, change registry import to:
 *   import { registerComposition } from '@reelstack/remotion/compositions/registry';
 */

import { registerComposition } from '../../compositions/registry';
import { ScreenExplainerComposition } from './composition';
import { screenExplainerPropsSchema } from './schema';
import { calculateScreenExplainerMetadata } from './calculate-metadata';

const FPS = 30;

registerComposition({
  id: 'ScreenExplainer',
  component: ScreenExplainerComposition,
  schema: screenExplainerPropsSchema,
  calculateMetadata: calculateScreenExplainerMetadata,
  width: 1080,
  height: 1920,
  defaultDurationInFrames: FPS * 45,
  fps: FPS,
  defaultProps: {
    screenshotUrl: 'https://via.placeholder.com/1080x1920/1a1a2e/ffffff?text=n8n+Workflow',
    screenshotWidth: 1080,
    screenshotHeight: 1920,
    sections: [{
      text: 'This workflow shows how to automate image generation.',
      startTime: 0,
      endTime: 10,
      boardType: 'bird-eye' as const,
      kenBurns: { startScale: 1.0, endScale: 1.05, startPosition: { x: 50, y: 50 }, endPosition: { x: 50, y: 50 } },
    }],
    cues: [
      { id: '1', text: 'This workflow shows', startTime: 0, endTime: 2 },
      { id: '2', text: 'how to automate', startTime: 2, endTime: 4 },
      { id: '3', text: 'image generation', startTime: 4, endTime: 6 },
    ],
    voiceoverUrl: '',
    durationSeconds: 45,
    backgroundColor: '#1a1a2e',
  },
});

// Re-export for consumers
export { screenExplainerPropsSchema, type ScreenExplainerProps, type ScreenSection, type KenBurnsParams } from './schema';
export { ScreenExplainerComposition } from './composition';
export { calculateScreenExplainerMetadata } from './calculate-metadata';
