import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { renderAnimatedCaption } from '@reelstack/core';
import type { WordSegment } from '@reelstack/core';
import type { SubtitleCue, SubtitleStyle } from '@reelstack/types';
import { DEFAULT_SUBTITLE_STYLE } from '@reelstack/types';
import { getHighlightMode } from './highlight-modes';

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

  const isSingleWord = captionStyle.highlightMode === 'single-word';

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

  const modeRenderer = getHighlightMode(highlightMode) ?? getHighlightMode('text');

  // ── Single-word mode: show only the currently spoken word ───
  if (isSingleWord) {
    const activeWord = segments.find((s: WordSegment) => s.style === 'active' || s.style === 'highlighted');
    if (!activeWord) return null;

    const displayText = (captionStyle.textTransform ?? 'none') === 'uppercase'
      ? activeWord.text.toUpperCase()
      : activeWord.text;

    const wordScale = spring({
      frame: frame - cueStartFrame,
      fps,
      config: { damping: 10, stiffness: 180 },
    });

    return (
      <div
        style={{
          position: 'absolute',
          top: `${verticalPosition}%`,
          left: 0,
          right: 0,
          transform: 'translateY(-50%)',
          display: 'flex',
          justifyContent: 'center',
          padding: '0 40px',
          opacity: fadeOut,
        }}
      >
        <span
          style={{
            fontSize: captionStyle.fontSize * 1.4,
            fontWeight: 'bold',
            fontFamily: captionStyle.fontFamily,
            color: captionStyle.highlightColor ?? '#FFD700',
            textShadow: buildOutlineShadow(
              captionStyle.outlineWidth + 1,
              captionStyle.outlineColor,
              captionStyle.shadowBlur + 4,
              captionStyle.shadowColor,
            ),
            textTransform: (captionStyle.textTransform ?? 'none') as any,
            transform: `scale(${wordScale})`,
            display: 'inline-block',
          }}
        >
          {displayText}
        </span>
      </div>
    );
  }

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
          const displayText = textTransform === 'uppercase'
            ? seg.text.toUpperCase()
            : seg.text;

          const activeStyle = isActive && modeRenderer
            ? modeRenderer.activeStyle({
                color: pillColor,
                fontSize: captionStyle.fontSize,
                padding: pillPad,
                borderRadius: pillRadius,
              })
            : {};

          // Modes with background (pill, label, box-highlight) keep base font color;
          // otherwise use the segment highlight color
          const hasBg = isActive && activeStyle && 'backgroundColor' in activeStyle;
          const textColor = hasBg
            ? captionStyle.fontColor
            : (seg.color ?? captionStyle.fontColor);

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
