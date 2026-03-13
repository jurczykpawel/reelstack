import React from 'react';
import {
  useCurrentFrame,
  useVideoConfig,
  AbsoluteFill,
  Audio,
  interpolate,
  Img,
  Easing,
} from 'remotion';
import { CaptionOverlay } from '../components/CaptionOverlay';
import { resolveMediaUrl } from '../utils/resolve-media-url';
import type { ScreenExplainerProps } from '../schemas/screen-explainer-props';

/**
 * ScreenExplainerComposition: single workflow screenshot with continuous
 * Ken Burns zoom/pan + TTS + captions.
 *
 * ONE <Img> is rendered for the entire video. Ken Burns parameters are
 * smoothly interpolated across section boundaries using eased transitions.
 * This prevents the "jumping screensaver" effect.
 */
export const ScreenExplainerComposition: React.FC<ScreenExplainerProps> = (props) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();

  const {
    screenshotUrl,
    sections,
    cues,
    voiceoverUrl,
    backgroundColor = '#1a1a2e',
    captionStyle,
  } = props;

  // ── Build continuous Ken Burns keyframes ──────────────────────
  // For each section boundary, we create a smooth transition zone.
  // Between transitions, the KB params hold steady.
  const TRANSITION_SECONDS = 0.8;
  const transitionFrames = Math.round(TRANSITION_SECONDS * fps);

  // Current time in seconds
  const currentTime = frame / fps;

  // Find which section we're in
  let sectionIndex = 0;
  for (let i = 0; i < sections.length; i++) {
    if (currentTime >= sections[i].startTime && currentTime < sections[i].endTime) {
      sectionIndex = i;
      break;
    }
    if (i === sections.length - 1) sectionIndex = i;
  }

  const current = sections[sectionIndex];
  const kb = current.kenBurns;

  // Progress within section (0 to 1)
  const sectionDuration = current.endTime - current.startTime;
  const sectionProgress = Math.max(0, Math.min(1,
    (currentTime - current.startTime) / Math.max(sectionDuration, 0.01)
  ));

  // Interpolate KB within the section (gentle drift)
  let scale = interpolate(sectionProgress, [0, 1], [kb.startScale, kb.endScale]);
  let posX = interpolate(sectionProgress, [0, 1], [kb.startPosition.x, kb.endPosition.x]);
  let posY = interpolate(sectionProgress, [0, 1], [kb.startPosition.y, kb.endPosition.y]);

  // Smooth blend during transition into this section from previous
  if (sectionIndex > 0) {
    const prev = sections[sectionIndex - 1];
    const prevKb = prev.kenBurns;
    const timeSinceSectionStart = currentTime - current.startTime;

    if (timeSinceSectionStart < TRANSITION_SECONDS) {
      const blendProgress = timeSinceSectionStart / TRANSITION_SECONDS;
      const eased = Easing.bezier(0.4, 0, 0.2, 1)(blendProgress);

      // Previous section's end state
      const prevScale = prevKb.endScale;
      const prevPosX = prevKb.endPosition.x;
      const prevPosY = prevKb.endPosition.y;

      scale = interpolate(eased, [0, 1], [prevScale, scale]);
      posX = interpolate(eased, [0, 1], [prevPosX, posX]);
      posY = interpolate(eased, [0, 1], [prevPosY, posY]);
    }
  }

  // ── Intro fade ──────────────────────────────────────────────
  const introFade = interpolate(frame, [0, fps * 0.5], [0, 1], { extrapolateRight: 'clamp' });

  // ── Render ──────────────────────────────────────────────────
  // The screenshot is placed in the upper ~60% of the portrait frame.
  // transform-origin uses the KB position to zoom into the right area.
  // translate keeps the image stable by counteracting the origin shift.

  return (
    <AbsoluteFill style={{ backgroundColor }}>
      {/* Screenshot layer - fixed position, continuous KB animation */}
      <AbsoluteFill style={{ opacity: introFade }}>
        <div
          style={{
            position: 'absolute',
            top: '5%',
            left: '2%',
            right: '2%',
            height: '55%',
            overflow: 'hidden',
            borderRadius: 16,
          }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              transform: `scale(${scale})`,
              transformOrigin: `${posX}% ${posY}%`,
              transition: 'none',
            }}
          >
            <Img
              src={resolveMediaUrl(screenshotUrl)}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          </div>
        </div>
      </AbsoluteFill>

      {/* Captions layer */}
      <AbsoluteFill style={{ zIndex: 10 }}>
        <CaptionOverlay
          cues={cues as Parameters<typeof CaptionOverlay>[0]['cues']}
          style={{
            fontSize: captionStyle?.fontSize ?? 64,
            fontColor: captionStyle?.fontColor ?? '#FFFFFF',
            highlightColor: captionStyle?.highlightColor ?? '#FFD700',
            position: captionStyle?.position ?? 85,
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
