import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { CaptionOverlay } from '@reelstack/remotion/components/CaptionOverlay';
import { resolveMediaUrl } from '@reelstack/remotion/utils/resolve-media-url';
import type { SlideshowProps } from './schema';

// Ken Burns presets — each slide gets a different motion pattern
const KEN_BURNS_PRESETS = [
  { startScale: 1.0, endScale: 1.15, startX: 0, endX: -2, startY: 0, endY: -1 },   // zoom in + drift left
  { startScale: 1.12, endScale: 1.0, startX: -2, endX: 2, startY: -1, endY: 1 },    // zoom out + drift right
  { startScale: 1.0, endScale: 1.1, startX: 1, endX: -1, startY: -1, endY: 0 },     // zoom in + drift
  { startScale: 1.1, endScale: 1.0, startX: 0, endX: 0, startY: -2, endY: 1 },      // zoom out + vertical drift
  { startScale: 1.0, endScale: 1.12, startX: -1, endX: 1, startY: 0, endY: -1 },    // zoom in + right drift
] as const;

/**
 * Single slide with Ken Burns effect + entrance transition.
 */
const SlideImage: React.FC<{
  imageUrl: string;
  transitionDurationMs: number;
  slideIndex: number;
}> = ({ imageUrl, transitionDurationMs, slideIndex }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const transitionFrames = Math.round((transitionDurationMs / 1000) * fps);

  // Entrance: fade + scale from 1.05 to 1.0
  const entranceProgress = transitionFrames > 0
    ? interpolate(frame, [0, transitionFrames], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' })
    : 1;
  const entranceOpacity = entranceProgress;
  const entranceScale = interpolate(entranceProgress, [0, 1], [1.05, 1], { extrapolateRight: 'clamp' });

  // Ken Burns: slow zoom + pan over the entire slide duration
  const kb = KEN_BURNS_PRESETS[slideIndex % KEN_BURNS_PRESETS.length]!;
  const kbProgress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });
  // Ease in-out for smoother motion
  const eased = 0.5 - Math.cos(kbProgress * Math.PI) / 2;

  const kbScale = interpolate(eased, [0, 1], [kb.startScale, kb.endScale]);
  const kbX = interpolate(eased, [0, 1], [kb.startX, kb.endX]);
  const kbY = interpolate(eased, [0, 1], [kb.startY, kb.endY]);

  const totalScale = entranceScale * kbScale;
  const transform = `scale(${totalScale}) translate(${kbX}%, ${kbY}%)`;

  return (
    <AbsoluteFill
      style={{
        opacity: entranceOpacity,
        overflow: 'hidden',
      }}
    >
      <Img
        src={resolveMediaUrl(imageUrl)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform,
          transformOrigin: 'center center',
        }}
      />
    </AbsoluteFill>
  );
};

/**
 * Thin progress bar at the top of the reel.
 */
const ProgressBar: React.FC<{ color?: string }> = ({ color = '#FFFFFF' }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const progress = interpolate(frame, [0, durationInFrames], [0, 100], {
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: 4,
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        zIndex: 100,
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${progress}%`,
          backgroundColor: color,
          borderRadius: '0 2px 2px 0',
          transition: 'none',
        }}
      />
    </div>
  );
};

/**
 * SlideshowComposition: branded image slides with Ken Burns effect,
 * karaoke captions, voiceover, and progress bar.
 */
export const SlideshowComposition: React.FC<SlideshowProps> = (props) => {
  const { fps } = useVideoConfig();
  const {
    slides,
    cues,
    voiceoverUrl,
    musicUrl,
    musicVolume = 0.2,
    backgroundColor = '#000000',
    captionStyle,
  } = props;

  return (
    <AbsoluteFill style={{ backgroundColor }}>
      {/* Progress bar */}
      <ProgressBar color={captionStyle?.highlightColor ?? '#FFD700'} />

      {/* Slide images with Ken Burns */}
      {slides.map((slide, i) => {
        const startFrame = Math.round(slide.startTime * fps);
        const durationFrames = Math.round((slide.endTime - slide.startTime) * fps);

        return (
          <Sequence key={i} from={startFrame} durationInFrames={durationFrames}>
            <SlideImage
              imageUrl={slide.imageUrl}
              transitionDurationMs={slide.transitionDurationMs}
              slideIndex={i}
            />
          </Sequence>
        );
      })}

      {/* Caption overlay */}
      <CaptionOverlay
        cues={cues}
        style={captionStyle}
      />

      {/* Voiceover audio */}
      {voiceoverUrl && (
        <Audio src={resolveMediaUrl(voiceoverUrl)} volume={1} />
      )}

      {/* Background music */}
      {musicUrl && (
        <Audio src={resolveMediaUrl(musicUrl)} volume={musicVolume} />
      )}
    </AbsoluteFill>
  );
};
