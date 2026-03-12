import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Sequence,
  OffthreadVideo,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { CaptionOverlay } from '../components/CaptionOverlay';
import { resolveMediaUrl } from '../utils/resolve-media-url';
import { computeEntrance } from '../utils/compute-entrance';
import type { VideoClipProps, VideoClip } from '../schemas/video-clip-props';

/**
 * VideoClipComposition: stitches multiple video clips with transitions + captions.
 * Used for ai-tips mode (Pixar-style talking objects) and any multi-clip compositions.
 *
 * Each clip plays in sequence. Adjacent clips can have crossfade/slide/zoom/wipe transitions.
 * Captions and optional voiceover/music are overlaid on top.
 */
export const VideoClipComposition: React.FC<VideoClipProps> = (props) => {
  const { fps } = useVideoConfig();
  const {
    clips,
    cues,
    voiceoverUrl,
    musicUrl,
    musicVolume = 0.15,
    backgroundColor = '#000000',
    captionStyle,
  } = props;

  return (
    <AbsoluteFill style={{ backgroundColor }}>
      {/* Video clips layer */}
      {clips.map((clip, i) => {
        const startFrame = Math.round(clip.startTime * fps);
        const durationFrames = Math.round((clip.endTime - clip.startTime) * fps);
        return (
          <Sequence
            key={i}
            from={startFrame}
            durationInFrames={durationFrames}
          >
            <ClipSegment
              clip={clip}
            />
          </Sequence>
        );
      })}

      {/* Captions layer */}
      <AbsoluteFill style={{ zIndex: 10 }}>
        <CaptionOverlay
          cues={cues as Parameters<typeof CaptionOverlay>[0]['cues']}
          style={{
            fontSize: captionStyle?.fontSize ?? 64,
            fontColor: captionStyle?.fontColor ?? '#FFFFFF',
            highlightColor: captionStyle?.highlightColor ?? '#FFD700',
            position: captionStyle?.position ?? 80,
          }}
        />
      </AbsoluteFill>

      {/* Voiceover audio */}
      {voiceoverUrl && (
        <Audio src={resolveMediaUrl(voiceoverUrl)} />
      )}

      {/* Background music */}
      {musicUrl && (
        <Audio src={resolveMediaUrl(musicUrl)} volume={musicVolume} />
      )}
    </AbsoluteFill>
  );
};

/**
 * Renders a single video clip with entrance transition.
 */
const ClipSegment: React.FC<{
  clip: VideoClip;
}> = ({ clip }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const transition = clip.transition ?? 'crossfade';
  const transitionDurationMs = clip.transitionDurationMs ?? 300;
  const transitionFrames = Math.round((transitionDurationMs / 1000) * fps);

  // Entrance animation
  const entrance = computeEntrance(frame, transitionFrames, transition);

  return (
    <AbsoluteFill style={{ opacity: entrance.opacity, transform: entrance.transform }}>
      <OffthreadVideo
        muted
        src={resolveMediaUrl(clip.url)}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </AbsoluteFill>
  );
};
