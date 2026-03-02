import { AbsoluteFill, OffthreadVideo, useVideoConfig } from 'remotion';
import { resolveMediaUrl } from '../utils/resolve-media-url';

interface FullscreenLayoutProps {
  readonly primaryVideoUrl?: string;
}

/**
 * Fullscreen layout: single video source fills the entire frame.
 * Used for "subtitle burn" mode - video + captions overlay.
 */
export const FullscreenLayout: React.FC<FullscreenLayoutProps> = ({
  primaryVideoUrl,
}) => {
  const { width, height } = useVideoConfig();

  return (
    <>
      {primaryVideoUrl ? (
        <OffthreadVideo
          muted
          src={resolveMediaUrl(primaryVideoUrl)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <AbsoluteFill
          style={{
            backgroundColor: '#1a1a2e',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              fontSize: 28,
              color: '#8a8aaa',
              fontFamily: 'monospace',
              letterSpacing: 2,
              opacity: 0.5,
            }}
          >
            FULLSCREEN VIDEO
          </div>
        </AbsoluteFill>
      )}
    </>
  );
};
