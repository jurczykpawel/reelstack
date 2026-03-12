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

/**
 * Caption overlay — renders per-word highlighted captions.
 * Uses inline <span> elements inside a <p> tag, exactly like short-video-maker.
 * NO display:inline-block, NO transform on word spans — just plain inline text with color changes.
 */
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

  // Pop-in animation on the whole cue container
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
  const isLabel = highlightMode === 'label';
  const isHormozi = highlightMode === 'hormozi';
  const isGlow = highlightMode === 'glow';
  const isPopWord = highlightMode === 'pop-word';
  const isUnderline = highlightMode === 'underline-sweep';
  const isBoxHighlight = highlightMode === 'box-highlight';
  const hormoziColor = captionStyle.highlightColor ?? '#FFFF00';
  const glowColor = captionStyle.highlightColor ?? '#FFFFFF';
  const accentColor = captionStyle.highlightColor ?? '#3B82F6';

  return (
    <div
      style={{
        position: 'absolute',
        top: `${verticalPosition}%`,
        left: 0,
        right: 0,
        transform: `translateY(-50%) scale(${entryScale})`,
        display: 'flex',
        justifyContent: captionStyle.alignment === 'left' ? 'flex-start' : captionStyle.alignment === 'right' ? 'flex-end' : 'center',
        padding: '0 40px',
        opacity: fadeOut,
      }}
    >
      {/* Same pattern as short-video-maker: <p> with inline <span> children and literal spaces */}
      <p
        style={{
          fontSize: captionStyle.fontSize,
          fontWeight: captionStyle.fontWeight,
          fontStyle: captionStyle.fontStyle,
          fontFamily: captionStyle.fontFamily,
          color: captionStyle.fontColor,
          textAlign: 'center',
          textShadow,
          textTransform: textTransform as any,
          lineHeight: captionStyle.lineHeight,
          maxWidth: '90%',
          margin: 0,
          padding: `${captionStyle.padding}px ${captionStyle.padding * 2}px`,
          backgroundColor: `${captionStyle.backgroundColor}${Math.round(captionStyle.backgroundOpacity * 255)
            .toString(16)
            .padStart(2, '0')}`,
          borderRadius: 16,
        }}
      >
        {segments.map((seg: WordSegment, i: number) => {
          const isActive = seg.style === 'active' || seg.style === 'highlighted';
          const showPill = isPill && isActive;
          const displayText = textTransform === 'uppercase'
            ? seg.text.toUpperCase()
            : seg.text;

          const showLabel = isLabel && isActive;
          const showHormozi = isHormozi && isActive;

          const showGlow = isGlow && isActive;
          const showPopWord = isPopWord && isActive;

          const textColor = (isPill || isLabel)
            ? captionStyle.fontColor
            : showHormozi
              ? hormoziColor
              : (seg.color ?? captionStyle.fontColor);

          const activeStyle = showPill ? {
            backgroundColor: pillColor,
            padding: `${pillPad * 0.4}px ${pillPad}px`,
            marginLeft: `${-pillPad}px`,
            marginRight: `${-pillPad}px`,
            borderRadius: pillRadius,
          } : showLabel ? {
            backgroundColor: pillColor,
            padding: `${pillPad * 0.3}px ${pillPad * 0.8}px`,
            marginLeft: `${-pillPad * 0.8}px`,
            marginRight: `${-pillPad * 0.8}px`,
            borderRadius: 4,
          } : showHormozi ? {
            display: 'inline-block' as const,
            transform: 'scale(1.15)',
            transformOrigin: 'center bottom',
          } : showGlow ? {
            textShadow: `0 0 12px ${glowColor}, 0 0 24px ${glowColor}88, 0 0 48px ${glowColor}44`,
          } : showPopWord ? {
            display: 'inline-block' as const,
            transform: 'scale(1.2)',
            transformOrigin: 'center bottom',
            transition: 'transform 0.1s ease-out',
          } : (isUnderline && isActive) ? {
            display: 'inline-block' as const,
            borderBottom: `4px solid ${accentColor}`,
            paddingBottom: 2,
          } : (isBoxHighlight && isActive) ? {
            display: 'inline-block' as const,
            backgroundColor: `${accentColor}55`,
            padding: '2px 6px',
            marginLeft: '-6px',
            marginRight: '-6px',
            borderRadius: 4,
            borderLeft: `3px solid ${accentColor}`,
          } : {};

          return (
            // eslint-disable-next-line react/jsx-key
            <>
              <span
                key={i}
                style={{
                  fontWeight: 'bold',
                  color: textColor,
                  ...activeStyle,
                }}
              >
                {displayText}
              </span>
              {i < segments.length - 1 ? ' ' : ''}
            </>
          );
        })}
      </p>
    </div>
  );
};
