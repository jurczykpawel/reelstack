import { Composition } from 'remotion';
import { ReelComposition } from './ReelComposition';
import type { ReelProps } from '../schemas/reel-props';
import { calculateReelMetadata } from './calculate-metadata';

const FPS = 30;
const DEFAULT_DURATION_SECONDS = 15;

export const RemotionRoot: React.FC = () => {
  return (
    <Composition<ReelProps>
      id="Reel"
      component={ReelComposition}
      durationInFrames={FPS * DEFAULT_DURATION_SECONDS}
      fps={FPS}
      width={1080}
      height={1920}
      calculateMetadata={calculateReelMetadata}
      defaultProps={{
        layout: 'split-screen' as const,
        bRollSegments: [
          {
            startTime: 3,
            endTime: 5,
            media: { url: '#e94560', type: 'color' as const, label: 'B-ROLL 1' },
            animation: 'spring-scale' as const,
          },
          {
            startTime: 9,
            endTime: 11,
            media: { url: '#e94560', type: 'color' as const, label: 'B-ROLL 2' },
            animation: 'spring-scale' as const,
          },
        ],
        cues: [
          { id: '1', text: 'To jest hook', startTime: 0, endTime: 2 },
          { id: '2', text: 'który przyciąga', startTime: 2, endTime: 4 },
          { id: '3', text: 'uwagę widza', startTime: 4, endTime: 6 },
          { id: '4', text: 'a tutaj substance', startTime: 6, endTime: 8 },
          { id: '5', text: 'z konkretnymi tipami', startTime: 8, endTime: 10 },
          { id: '6', text: 'i payoff na końcu', startTime: 10, endTime: 12 },
          { id: '7', text: 'z mocnym CTA', startTime: 12, endTime: 15 },
        ],
        musicVolume: 0.3,
        showProgressBar: true,
        backgroundColor: '#000000',
      }}
    />
  );
};
