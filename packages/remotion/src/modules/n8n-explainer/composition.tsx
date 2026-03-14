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
import { CaptionOverlay } from '../../components/CaptionOverlay';
import { resolveMediaUrl } from '../../utils/resolve-media-url';
import type { ScreenExplainerProps } from './schema';

/**
 * ScreenExplainerComposition: single workflow screenshot with continuous
 * Ken Burns zoom/pan + TTS + captions.
 *
 * Image display: manual positioning with fit-to-width base.
 * Container is full-bleed (entire video height). At scale 1.0 the full
 * image is visible. A gradient overlay at the bottom ensures caption
 * readability over the image.
 */
export const ScreenExplainerComposition: React.FC<ScreenExplainerProps> = (props) => {
  const { width: videoWidth, height: videoHeight, fps } = useVideoConfig();
  const frame = useCurrentFrame();

  const {
    screenshotUrl,
    screenshotWidth,
    screenshotHeight,
    sections,
    cues,
    voiceoverUrl,
    backgroundColor = '#1a1a2e',
    captionStyle,
  } = props;

  // ── Image container: full video area ────────────────────────
  const containerW = videoWidth;
  const containerH = videoHeight;

  // Base scale: fit image to container width
  const baseScale = containerW / screenshotWidth;
  const imgBaseH = screenshotHeight * baseScale;

  // ── Build continuous Ken Burns keyframes ──────────────────────
  const TRANSITION_SECONDS = 0.8;
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

      const prevScale = prevKb.endScale;
      const prevPosX = prevKb.endPosition.x;
      const prevPosY = prevKb.endPosition.y;

      scale = interpolate(eased, [0, 1], [prevScale, scale]);
      posX = interpolate(eased, [0, 1], [prevPosX, posX]);
      posY = interpolate(eased, [0, 1], [prevPosY, posY]);
    }
  }

  // ── Manual image positioning ────────────────────────────────
  const imgW = containerW * scale;
  const imgH = imgBaseH * scale;

  // Focal point in image coordinates (posX/posY are 0-100% of image)
  const focalX = (posX / 100) * imgW;
  const focalY = (posY / 100) * imgH;

  // Position image so focal point is at container center
  let imgLeft = containerW / 2 - focalX;
  let imgTop = containerH / 2 - focalY;

  // Clamp so image doesn't leave visible gaps in the container.
  // If image is smaller than container on an axis, center it instead.
  if (imgW >= containerW) {
    imgLeft = Math.min(0, Math.max(containerW - imgW, imgLeft));
  } else {
    imgLeft = (containerW - imgW) / 2;
  }
  if (imgH >= containerH) {
    imgTop = Math.min(0, Math.max(containerH - imgH, imgTop));
  } else {
    imgTop = (containerH - imgH) / 2;
  }

  // ── Intro fade ──────────────────────────────────────────────
  const introFade = interpolate(frame, [0, fps * 0.5], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor }}>
      {/* Screenshot layer - full bleed */}
      <AbsoluteFill style={{ opacity: introFade }}>
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: containerW,
            height: containerH,
            overflow: 'hidden',
          }}
        >
          <Img
            src={resolveMediaUrl(screenshotUrl)}
            style={{
              position: 'absolute',
              width: imgW,
              height: imgH,
              left: imgLeft,
              top: imgTop,
              imageRendering: 'high-quality' as React.CSSProperties['imageRendering'],
            }}
          />
        </div>

        {/* Gradient overlay for caption readability */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '30%',
            background: 'linear-gradient(transparent, rgba(26, 26, 46, 0.85) 60%, rgba(26, 26, 46, 0.95))',
            pointerEvents: 'none',
          }}
        />
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
