import React from 'react';
import {
  useCurrentFrame,
  useVideoConfig,
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  Img,
} from 'remotion';
import { CaptionOverlay } from '../components/CaptionOverlay';
import { resolveMediaUrl } from '../utils/resolve-media-url';
import type { ScreenExplainerProps, ScreenSection } from '../schemas/screen-explainer-props';

/**
 * ScreenExplainerComposition: SVG board images with Ken Burns + TTS + captions.
 * Used for n8n-explainer mode. Simpler than ReelComposition - no B-roll overlay
 * system, just a sequence of full-screen SVG images with smooth transitions.
 */
export const ScreenExplainerComposition: React.FC<ScreenExplainerProps> = (props) => {
  const { fps } = useVideoConfig();

  const {
    sections,
    cues,
    voiceoverUrl,
    backgroundColor = '#1a1a2e',
    captionStyle,
  } = props;

  return (
    <AbsoluteFill style={{ backgroundColor }}>
      {/* Board images layer */}
      {sections.map((section, i) => {
        const sectionDuration = section.endTime - section.startTime;
        const startFrame = Math.round(section.startTime * fps);
        const durationFrames = Math.round(sectionDuration * fps);

        return (
          <Sequence
            key={i}
            from={startFrame}
            durationInFrames={durationFrames}
          >
            <SectionBoard
              section={section}
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

      {/* Audio layer */}
      {voiceoverUrl && (
        <Audio src={resolveMediaUrl(voiceoverUrl)} />
      )}
    </AbsoluteFill>
  );
};

/**
 * Renders a single section's SVG board image with Ken Burns effect.
 */
const SectionBoard: React.FC<{
  section: ScreenSection;
}> = ({ section }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const durationFrames = Math.round((section.endTime - section.startTime) * fps);

  // Ken Burns: gentle zoom + pan over the section duration
  const kb = section.kenBurns ?? {
    startScale: 1.0,
    endScale: section.boardType === 'bird-eye' ? 1.05 : 1.1,
    startPosition: { x: 50, y: 50 },
    endPosition: { x: 50, y: 50 },
  };

  const progress = Math.min(frame / Math.max(durationFrames, 1), 1);
  const scale = interpolate(progress, [0, 1], [kb.startScale, kb.endScale]);
  const posX = interpolate(progress, [0, 1], [kb.startPosition.x, kb.endPosition.x]);
  const posY = interpolate(progress, [0, 1], [kb.startPosition.y, kb.endPosition.y]);

  // Fade in/out
  const fadeIn = interpolate(frame, [0, Math.min(fps * 0.3, durationFrames)], [0, 1], { extrapolateRight: 'clamp' });
  const fadeOut = interpolate(
    frame,
    [Math.max(durationFrames - fps * 0.3, 0), durationFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const opacity = Math.min(fadeIn, fadeOut);

  return (
    <AbsoluteFill style={{ opacity }}>
      <div
        style={{
          width: '100%',
          height: '100%',
          transform: `scale(${scale})`,
          transformOrigin: `${posX}% ${posY}%`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        dangerouslySetInnerHTML={{ __html: section.svgContent }}
      />
    </AbsoluteFill>
  );
};
