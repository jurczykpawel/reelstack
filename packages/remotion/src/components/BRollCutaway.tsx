import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, OffthreadVideo, Img } from 'remotion';
import type { BRollSegment } from '@reelstack/types';
import { resolveMediaUrl } from '../utils/resolve-media-url';
import { TextCardOverlay } from './TextCardOverlay';

interface BRollCutawayProps {
  readonly segment: BRollSegment;
}

export const BRollCutaway: React.FC<BRollCutawayProps> = ({ segment }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const startFrame = Math.round(segment.startTime * fps);
  const endFrame = Math.round(segment.endTime * fps);
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

  // Ken Burns: interpolate scale + transform-origin over segment duration
  const kb = media.kenBurns;
  const hasKenBurns = media.type === 'image' && kb;
  let kbScale = 1;
  let kbOriginX = 50;
  let kbOriginY = 50;
  if (hasKenBurns) {
    const progress = interpolate(
      frame,
      [startFrame, endFrame],
      [0, 1],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
    );
    kbScale = interpolate(progress, [0, 1], [kb.startScale ?? 1.0, kb.endScale ?? 1.3]);
    const sp = kb.startPosition ?? { x: 50, y: 50 };
    const ep = kb.endPosition ?? { x: 50, y: 50 };
    kbOriginX = interpolate(progress, [0, 1], [sp.x, ep.x]);
    kbOriginY = interpolate(progress, [0, 1], [sp.y, ep.y]);
  }

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
        <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
          <Img
            src={resolveMediaUrl(media.url)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              ...(hasKenBurns ? {
                transform: `scale(${kbScale})`,
                transformOrigin: `${kbOriginX}% ${kbOriginY}%`,
              } : {}),
            }}
          />
        </div>
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
      {media.type === 'text-card' && media.textCard && (
        <TextCardOverlay config={media.textCard} startFrame={startFrame} />
      )}
    </AbsoluteFill>
  );
};
