/**
 * Slideshow Remotion module.
 * Self-registers the Slideshow composition on import.
 */

import { registerComposition } from '@reelstack/remotion/compositions/registry';
import { SlideshowComposition } from './composition';
import { slideshowPropsSchema } from './schema';

const FPS = 30;

registerComposition({
  id: 'Slideshow',
  component: SlideshowComposition,
  schema: slideshowPropsSchema,
  width: 1080,
  height: 1920,
  defaultDurationInFrames: FPS * 30,
  fps: FPS,
  defaultProps: {
    slides: [
      {
        imageUrl: 'https://via.placeholder.com/1080x1920/1a1a2e/FFFFFF?text=Slide+1',
        startTime: 0,
        endTime: 6,
        transition: 'none' as const,
        transitionDurationMs: 0,
      },
      {
        imageUrl: 'https://via.placeholder.com/1080x1920/16213e/FFFFFF?text=Slide+2',
        startTime: 6,
        endTime: 12,
        transition: 'crossfade' as const,
        transitionDurationMs: 400,
      },
    ],
    cues: [
      { id: '1', text: 'Welcome to the slideshow', startTime: 0, endTime: 3 },
      { id: '2', text: 'This is slide two', startTime: 6, endTime: 9 },
    ],
    durationSeconds: 12,
    musicVolume: 0.2,
    backgroundColor: '#000000',
  },
});

export { slideshowPropsSchema, type SlideshowProps } from './schema';
export { SlideshowComposition } from './composition';
