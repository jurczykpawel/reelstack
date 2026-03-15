import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import type { ZoomSegment } from '@reelstack/types';

interface ZoomEffectProps {
  readonly segment: ZoomSegment;
  readonly children: React.ReactNode;
}

/**
 * Punch-in zoom effect over base content.
 * NetworkChuck style: sudden zoom on code/face for emphasis.
 */
export const ZoomEffect: React.FC<ZoomEffectProps> = ({ segment, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const startFrame = Math.round(segment.startTime * fps);
  const endFrame = Math.round(segment.endTime * fps);

  if (frame < startFrame || frame > endFrame) {
    return <AbsoluteFill>{children}</AbsoluteFill>;
  }

  const {
    scale = 1.5,
    focusPoint = { x: 50, y: 50 },
    easing = 'spring',
  } = segment;

  // Entrance zoom
  let zoomProgress: number;
  if (easing === 'instant') {
    // Jump-cut: instant scale change, no transition
    zoomProgress = 1;
  } else if (easing === 'spring') {
    zoomProgress = spring({
      frame: frame - startFrame,
      fps,
      config: { damping: 12, stiffness: 200 },
    });
  } else {
    const entranceDuration = Math.min(Math.round(0.5 * fps), endFrame - startFrame);
    zoomProgress = interpolate(
      frame,
      [startFrame, startFrame + entranceDuration],
      [0, 1],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
    );
  }

  // Exit: smooth zoom-out in last 0.3s
  const exitDuration = Math.round(0.3 * fps);
  const exitProgress = interpolate(
    frame,
    [endFrame - exitDuration, endFrame],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  const currentScale = interpolate(zoomProgress * exitProgress, [0, 1], [1, scale]);

  return (
    <AbsoluteFill
      style={{
        transform: `scale(${currentScale})`,
        transformOrigin: `${focusPoint.x}% ${focusPoint.y}%`,
        overflow: 'hidden',
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
