/**
 * ai-tips Remotion module.
 *
 * Self-registers the VideoClip composition on import.
 */

import { registerComposition } from '../../compositions/registry';
import { VideoClipComposition } from './composition';
import { videoClipPropsSchema } from './schema';

const FPS = 30;

registerComposition({
  id: 'VideoClip',
  component: VideoClipComposition,
  schema: videoClipPropsSchema,
  width: 1080,
  height: 1920,
  defaultDurationInFrames: FPS * 30,
  fps: FPS,
  defaultProps: {
    clips: [{
      url: 'https://example.com/clip1.mp4',
      startTime: 0,
      endTime: 10,
      transition: 'crossfade' as const,
      transitionDurationMs: 300,
    }],
    cues: [
      { id: '1', text: 'First tip from your toaster', startTime: 0, endTime: 3 },
      { id: '2', text: 'Clear your temp files!', startTime: 3, endTime: 6 },
    ],
    durationSeconds: 30,
    musicVolume: 0.15,
    backgroundColor: '#000000',
  },
});

// Re-export for consumers
export { videoClipPropsSchema, type VideoClipProps, type VideoClip } from './schema';
export { VideoClipComposition } from './composition';
