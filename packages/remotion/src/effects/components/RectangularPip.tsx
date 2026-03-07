import { OffthreadVideo } from 'remotion';
import { useEffectAnimation } from '../hooks/useEffectAnimation';
import { resolveMediaUrl } from '../../utils/resolve-media-url';
import type { RectangularPipEffect } from '../types';

interface Props {
  readonly segment: RectangularPipEffect;
}

const MARGIN = 3; // % from edge

export const RectangularPip: React.FC<Props> = ({ segment }) => {
  const { visible, style } = useEffectAnimation(segment);

  if (!visible) return null;

  const {
    videoUrl,
    position = 'bottom-right',
    width = 40,
    height = 30,
    borderColor = '#3B82F6',
    borderWidth = 3,
    borderGlow = true,
    borderRadius = 12,
  } = segment;

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
        width: `${width}%`,
        height: `${height}%`,
        borderRadius,
        border: `${borderWidth}px solid ${borderColor}`,
        overflow: 'hidden',
        zIndex: 22,
        boxShadow: borderGlow
          ? `0 0 20px ${borderColor}80, 0 4px 20px rgba(0,0,0,0.4)`
          : '0 4px 20px rgba(0,0,0,0.4)',
        ...style,
      }}
    >
      <OffthreadVideo
        muted
        src={resolveMediaUrl(videoUrl)}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </div>
  );
};
