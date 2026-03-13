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
 * ScreenExplainerComposition: single workflow screenshot with per-section
 * Ken Burns zoom/pan + TTS + captions.
 *
 * One <Img> is shared across all sections. Each Sequence applies different
 * Ken Burns parameters to show bird-eye or zoomed-in views.
 */
export const ScreenExplainerComposition: React.FC<ScreenExplainerProps> = (props) => {
  const { fps } = useVideoConfig();

  const {
    screenshotUrl,
    sections,
    cues,
    voiceoverUrl,
    backgroundColor = '#1a1a2e',
    captionStyle,
  } = props;

  return (
    <AbsoluteFill style={{ backgroundColor }}>
      {/* Board layer: shared screenshot with per-section Ken Burns */}
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
              screenshotUrl={screenshotUrl}
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
 * Renders the shared screenshot with Ken Burns effect for this section.
 */
const SectionBoard: React.FC<{
  section: ScreenSection;
  screenshotUrl: string;
}> = ({ section, screenshotUrl }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const durationFrames = Math.round((section.endTime - section.startTime) * fps);

  const kb = section.kenBurns;
  const progress = Math.min(frame / Math.max(durationFrames, 1), 1);
  const scale = interpolate(progress, [0, 1], [kb.startScale, kb.endScale]);
  const posX = interpolate(progress, [0, 1], [kb.startPosition.x, kb.endPosition.x]);
  const posY = interpolate(progress, [0, 1], [kb.startPosition.y, kb.endPosition.y]);

  // Fade in/out at section boundaries
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
      >
        <Img
          src={resolveMediaUrl(screenshotUrl)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
