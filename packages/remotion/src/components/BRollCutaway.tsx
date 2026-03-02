import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, OffthreadVideo, Img } from 'remotion';
import type { BRollSegment } from '@reelstack/types';
import { resolveMediaUrl } from '../utils/resolve-media-url';

interface BRollCutawayProps {
  readonly segment: BRollSegment;
}

export const BRollCutaway: React.FC<BRollCutawayProps> = ({ segment }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const startFrame = Math.round(segment.startTime * fps);
  const animation = segment.animation ?? 'spring-scale';

  let scale = 1;
  if (animation === 'spring-scale') {
    const s = spring({
      frame: frame - startFrame,
      fps,
      config: { damping: 15, stiffness: 100 },
    });
    scale = 0.8 + s * 0.2;
  }

  const media = segment.media;

  return (
    <AbsoluteFill
      style={{
        transform: `scale(${scale})`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {media.type === 'video' && (
        <OffthreadVideo
          muted
          src={resolveMediaUrl(media.url)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          startFrom={media.startFrom ? Math.round(media.startFrom * fps) : undefined}
          endAt={media.endAt ? Math.round(media.endAt * fps) : undefined}
        />
      )}
      {media.type === 'image' && (
        <Img src={resolveMediaUrl(media.url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      )}
      {media.type === 'color' && (
        <AbsoluteFill style={{ backgroundColor: media.url }}>
          {media.label && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                fontSize: 64,
                fontWeight: 'bold',
                color: '#fff',
                fontFamily: 'sans-serif',
              }}
            >
              {media.label}
            </div>
          )}
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
