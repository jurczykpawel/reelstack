import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { CaptionOverlay } from '@reelstack/remotion/components/CaptionOverlay';
import { resolveMediaUrl } from '@reelstack/remotion/utils/resolve-media-url';
import { computeEntrance } from '@reelstack/remotion/utils/compute-entrance';
import type { SlideshowProps } from './schema';

/**
 * Single slide with transition animation.
 */
const SlideImage: React.FC<{
  imageUrl: string;
  transition: string;
  transitionDurationMs: number;
}> = ({ imageUrl, transition, transitionDurationMs }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const transitionFrames = Math.round((transitionDurationMs / 1000) * fps);
  const entrance = computeEntrance(frame, transitionFrames, transition as 'crossfade' | 'none');

  return (
    <AbsoluteFill
      style={{
        opacity: entrance.opacity,
        transform: entrance.transform,
      }}
    >
      <Img
        src={resolveMediaUrl(imageUrl)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />
    </AbsoluteFill>
  );
};

/**
 * SlideshowComposition: sequential fullscreen images with transitions + karaoke captions.
 *
 * Each slide is a PNG rendered by @reelstack/image-gen. Slides transition with
 * crossfade/slide/zoom effects. Voiceover and optional music are overlaid.
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
      {/* Slide images layer */}
      {slides.map((slide, i) => {
        const startFrame = Math.round(slide.startTime * fps);
        const durationFrames = Math.round((slide.endTime - slide.startTime) * fps);

        return (
          <Sequence key={i} from={startFrame} durationInFrames={durationFrames}>
            <SlideImage
              imageUrl={slide.imageUrl}
              transition={slide.transition}
              transitionDurationMs={slide.transitionDurationMs}
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
