import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Sequence,
  OffthreadVideo,
  Img,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { CaptionOverlay } from '../../components/CaptionOverlay';
import { resolveMediaUrl } from '../../utils/resolve-media-url';
import { computeEntrance } from '../../utils/compute-entrance';
import type { PresenterExplainerProps, BoardSection } from './schema';

/**
 * PresenterExplainerComposition: split-screen with board images (top) + avatar (bottom) + captions (middle).
 * Used for presenter-explainer mode where an AI avatar explains a topic with visual aids.
 *
 * Layout:
 * ┌──────────────────┐
 * │   Board Images   │  ← top boardHeightPercent%
 * │  (screenshots,   │
 * │   infographics)  │
 * ├──────────────────┤
 * │    Captions      │  ← overlaid at the split boundary
 * ├──────────────────┤
 * │   Avatar Video   │  ← bottom (100 - boardHeightPercent)%
 * │  (presenter)     │
 * └──────────────────┘
 */
export const PresenterExplainerComposition: React.FC<PresenterExplainerProps> = (props) => {
  const { fps } = useVideoConfig();
  const {
    boardSections,
    avatarVideoUrl,
    cues,
    voiceoverUrl,
    musicUrl,
    musicVolume = 0.15,
    backgroundColor = '#0a0a14',
    boardHeightPercent = 50,
    captionStyle,
  } = props;

  return (
    <AbsoluteFill style={{ backgroundColor }}>
      {/* Board images layer (top half) */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: `${boardHeightPercent}%`,
        overflow: 'hidden',
      }}>
        {boardSections.map((section, i) => {
          const startFrame = Math.round(section.startTime * fps);
          const durationFrames = Math.round((section.endTime - section.startTime) * fps);

          return (
            <Sequence key={i} from={startFrame} durationInFrames={durationFrames}>
              <BoardImage section={section} />
            </Sequence>
          );
        })}
      </div>

      {/* Avatar video layer (bottom half) */}
      <div style={{
        position: 'absolute',
        top: `${boardHeightPercent}%`,
        left: 0,
        width: '100%',
        height: `${100 - boardHeightPercent}%`,
        overflow: 'hidden',
      }}>
        <OffthreadVideo
          muted
          src={resolveMediaUrl(avatarVideoUrl)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>

      {/* Captions layer (positioned at the split boundary) */}
      <AbsoluteFill style={{ zIndex: 10 }}>
        <CaptionOverlay
          cues={cues as Parameters<typeof CaptionOverlay>[0]['cues']}
          style={{
            fontSize: captionStyle?.fontSize ?? 56,
            fontColor: captionStyle?.fontColor ?? '#FFFFFF',
            highlightColor: captionStyle?.highlightColor ?? '#FFD700',
            position: captionStyle?.position ?? boardHeightPercent,
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
 * Renders a single board section image with entrance transition.
 */
const BoardImage: React.FC<{ section: BoardSection }> = ({ section }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const transition = section.transition ?? 'crossfade';
  const transitionDurationMs = section.transitionDurationMs ?? 300;
  const transitionFrames = Math.round((transitionDurationMs / 1000) * fps);

  const entrance = computeEntrance(frame, transitionFrames, transition);

  return (
    <AbsoluteFill style={{ opacity: entrance.opacity, transform: entrance.transform }}>
      <Img
        src={resolveMediaUrl(section.imageUrl)}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </AbsoluteFill>
  );
};
