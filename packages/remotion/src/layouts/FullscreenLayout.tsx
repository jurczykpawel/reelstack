import { AbsoluteFill, OffthreadVideo, useCurrentFrame, useVideoConfig } from 'remotion';
import { resolveMediaUrl } from '../utils/resolve-media-url';
import { remapFrame } from '../utils/remap-frame';

interface FullscreenLayoutProps {
  readonly primaryVideoUrl?: string;
  readonly speedRamps?: readonly { startTime: number; endTime: number; rate: number }[];
}

/**
 * Fullscreen layout: single video source fills the entire frame.
 * Used for "subtitle burn" mode - video + captions overlay.
 */
export const FullscreenLayout: React.FC<FullscreenLayoutProps> = ({
  primaryVideoUrl,
  speedRamps,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const hasSpeedRamps = speedRamps && speedRamps.length > 0;
  const videoFrame = hasSpeedRamps ? remapFrame(frame, fps, speedRamps) : undefined;

  return (
    <>
      {primaryVideoUrl ? (
        <OffthreadVideo
          muted
          src={resolveMediaUrl(primaryVideoUrl)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          startFrom={videoFrame}
        />
      ) : (
        <AbsoluteFill
          style={{
            backgroundColor: '#0a0a14',
          }}
        />
      )}
    </>
  );
};
