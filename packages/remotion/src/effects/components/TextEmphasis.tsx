import { useEffectAnimation } from '../hooks/useEffectAnimation';
import type { TextEmphasisEffect } from '../types';

interface Props {
  readonly segment: TextEmphasisEffect;
}

export const TextEmphasis: React.FC<Props> = ({ segment }) => {
  const { visible, style } = useEffectAnimation(segment);

  if (!visible) return null;

  const {
    text,
    fontSize = 96,
    fontColor = '#FFFFFF',
    backgroundColor,
    position = 'center',
  } = segment;

  const positionStyle: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'center',
    zIndex: 26,
    pointerEvents: 'none',
  };

  if (position === 'top') positionStyle.top = '10%';
  else if (position === 'bottom') positionStyle.bottom = '10%';
  else { positionStyle.top = '50%'; positionStyle.transform = 'translateY(-50%)'; }

  return (
    <div style={positionStyle}>
      <div
        style={{
          fontSize,
          fontWeight: 900,
          fontFamily: 'Outfit, Impact, sans-serif',
          color: fontColor,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          textShadow: '0 4px 24px rgba(0,0,0,0.7), 0 0 60px rgba(0,0,0,0.3)',
          padding: backgroundColor ? '8px 24px' : undefined,
          backgroundColor: backgroundColor ?? undefined,
          borderRadius: backgroundColor ? 8 : undefined,
          ...style,
        }}
      >
        {text}
      </div>
    </div>
  );
};
