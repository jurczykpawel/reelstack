import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { renderAnimatedCaption } from '@reelstack/core';
import type { WordSegment } from '@reelstack/core';
import type { SubtitleCue, SubtitleStyle } from '@reelstack/types';
import { DEFAULT_SUBTITLE_STYLE } from '@reelstack/types';

interface CaptionOverlayProps {
  readonly cues: readonly SubtitleCue[];
  readonly style?: Partial<SubtitleStyle>;
}

/**
 * Builds a multi-layer text-shadow that acts as a solid outline.
 * Much better than WebkitTextStroke which eats into letterforms.
 */
function buildOutlineShadow(width: number, color: string, blur: number, shadowColor: string): string {
  if (width <= 0 && blur <= 0) return 'none';

  const shadows: string[] = [];

  // Directional outline shadows (8 directions for solid outline)
  if (width > 0) {
    const d = width;
    shadows.push(
      `${d}px 0 0 ${color}`,
      `${-d}px 0 0 ${color}`,
      `0 ${d}px 0 ${color}`,
      `0 ${-d}px 0 ${color}`,
      `${d}px ${d}px 0 ${color}`,
      `${-d}px ${d}px 0 ${color}`,
      `${d}px ${-d}px 0 ${color}`,
      `${-d}px ${-d}px 0 ${color}`,
    );
  }

  // Glow/blur shadow
  if (blur > 0) {
    shadows.push(`0 0 ${blur}px ${shadowColor}`);
  }

  return shadows.join(', ');
}

export const CaptionOverlay: React.FC<CaptionOverlayProps> = ({
  cues,
  style: styleOverride,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  const captionStyle = { ...DEFAULT_SUBTITLE_STYLE, ...styleOverride };

  const activeCue = cues.find(
    (c) => currentTime >= c.startTime && currentTime < c.endTime,
  );

  if (!activeCue) return null;

  const { segments, visible } = renderAnimatedCaption(activeCue, currentTime, {
    highlightColor: captionStyle.highlightColor,
    upcomingColor: captionStyle.upcomingColor,
  });

  if (!visible || segments.length === 0) return null;

  // Pop-in animation
  const cueStartFrame = Math.round(activeCue.startTime * fps);
  const cueEndFrame = Math.round(activeCue.endTime * fps);

  const entryScale = spring({
    frame: frame - cueStartFrame,
    fps,
    config: { damping: 12, stiffness: 200 },
  });

  const fadeOut = interpolate(
    frame,
    [cueEndFrame - 10, cueEndFrame],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  const verticalPosition = captionStyle.position;
  const textShadow = buildOutlineShadow(
    captionStyle.outlineWidth,
    captionStyle.outlineColor,
    captionStyle.shadowBlur,
    captionStyle.shadowColor,
  );

  const highlightMode = captionStyle.highlightMode ?? 'text';
  const textTransform = captionStyle.textTransform ?? 'none';
  const pillColor = captionStyle.pillColor ?? captionStyle.highlightColor ?? '#3B82F6';
  const pillRadius = captionStyle.pillBorderRadius ?? 10;
  const pillPad = captionStyle.pillPadding ?? 10;

  const isPill = highlightMode === 'pill';

  return (
    <div
      style={{
        position: 'absolute',
        top: `${verticalPosition}%`,
        left: 40,
        right: 40,
        transform: `translateY(-50%) scale(${entryScale})`,
        textAlign: captionStyle.alignment,
        opacity: fadeOut,
      }}
    >
      <div
        style={{
          display: 'inline-block',
          backgroundColor: `${captionStyle.backgroundColor}${Math.round(captionStyle.backgroundOpacity * 255)
            .toString(16)
            .padStart(2, '0')}`,
          padding: `${captionStyle.padding}px ${captionStyle.padding * 2}px`,
          borderRadius: 16,
        }}
      >
        {segments.map((seg: WordSegment, i: number) => {
          const showPill = isPill && seg.style === 'active';
          const displayText = textTransform === 'uppercase'
            ? seg.text.toUpperCase()
            : seg.text;

          // In pill mode: active word keeps base font color, pill provides the highlight.
          // In text mode: color comes from the animation renderer (seg.color).
          const textColor = isPill
            ? captionStyle.fontColor
            : (seg.color ?? captionStyle.fontColor);

          return (
            <span
              key={i}
              style={{
                fontSize: captionStyle.fontSize,
                fontWeight: captionStyle.fontWeight,
                fontStyle: captionStyle.fontStyle,
                fontFamily: captionStyle.fontFamily,
                color: textColor,
                opacity: seg.opacity,
                transform: `scale(${seg.scale}) translateY(${seg.offsetY}px)`,
                display: 'inline-block',
                marginRight: 8,
                lineHeight: captionStyle.lineHeight,
                textShadow,
                textTransform: textTransform as any,
                // Pill highlight: colored background behind active word
                ...(showPill ? {
                  backgroundColor: pillColor,
                  padding: `${pillPad * 0.4}px ${pillPad}px`,
                  marginLeft: -pillPad * 0.3,
                  marginRight: -pillPad * 0.3 + 8,
                  borderRadius: pillRadius,
                } : {}),
              }}
            >
              {displayText}
            </span>
          );
        })}
      </div>
    </div>
  );
};
