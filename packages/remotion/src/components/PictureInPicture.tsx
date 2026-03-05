import { useCurrentFrame, useVideoConfig, spring, interpolate, OffthreadVideo } from 'remotion';
import type { PipSegment } from '@reelstack/types';
import { resolveMediaUrl } from '../utils/resolve-media-url';

interface PictureInPictureProps {
  readonly segment: PipSegment;
}

const MARGIN = 3; // % from edge

export const PictureInPicture: React.FC<PictureInPictureProps> = ({ segment }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();

  const startFrame = Math.round(segment.startTime * fps);
  const endFrame = Math.round(segment.endTime * fps);

  // Not visible outside time range
  if (frame < startFrame || frame > endFrame) return null;

  const {
    position = 'bottom-right',
    size = 30,
    shape = 'circle',
    borderColor = '#FFFFFF',
    borderWidth = 3,
  } = segment;

  // Entrance spring
  const entryScale = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 12, stiffness: 180 },
  });

  // Exit fade (last 0.3s)
  const exitFadeDuration = Math.round(0.3 * fps);
  const exitOpacity = interpolate(
    frame,
    [endFrame - exitFadeDuration, endFrame],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  const pixelSize = (size / 100) * width;
  const borderRadius = shape === 'circle' ? '50%' : shape === 'rounded' ? 16 : 0;

  const positionStyle: React.CSSProperties = {};
  if (position.includes('top')) positionStyle.top = `${MARGIN}%`;
  if (position.includes('bottom')) positionStyle.bottom = `${MARGIN}%`;
  if (position.includes('left')) positionStyle.left = `${MARGIN}%`;
  if (position.includes('right')) positionStyle.right = `${MARGIN}%`;

  return (
    <div
      style={{
        position: 'absolute',
        ...positionStyle,
        width: pixelSize,
        height: shape === 'circle' ? pixelSize : pixelSize * 0.75,
        borderRadius,
        border: `${borderWidth}px solid ${borderColor}`,
        overflow: 'hidden',
        transform: `scale(${entryScale})`,
        opacity: exitOpacity,
        zIndex: 10,
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      }}
    >
      <OffthreadVideo
        muted
        src={resolveMediaUrl(segment.videoUrl)}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </div>
  );
};
