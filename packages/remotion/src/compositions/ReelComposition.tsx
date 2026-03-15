import { AbsoluteFill, Audio, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { loadFont as loadOutfit } from '@remotion/google-fonts/Outfit';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadMontserrat } from '@remotion/google-fonts/Montserrat';
import { loadFont as loadPoppins } from '@remotion/google-fonts/Poppins';
import { loadFont as loadRoboto } from '@remotion/google-fonts/Roboto';
import { loadFont as loadUbuntu } from '@remotion/google-fonts/Ubuntu';
import type { ReelProps } from '../schemas/reel-props';
import { resolveMediaUrl } from '../utils/resolve-media-url';
import { SplitScreenLayout } from '../layouts/SplitScreenLayout';
import { FullscreenLayout } from '../layouts/FullscreenLayout';
import { CaptionOverlay } from '../components/CaptionOverlay';
import { ProgressBar } from '../components/ProgressBar';
import { BRollCutaway } from '../components/BRollCutaway';
import { PictureInPicture } from '../components/PictureInPicture';
import { LowerThird } from '../components/LowerThird';
import { CtaOverlay } from '../components/CtaOverlay';
import { AnimatedCounter } from '../components/AnimatedCounter';
import { ZoomEffect } from '../components/ZoomEffect';
import { HighlightBox } from '../components/HighlightBox';
import { getEffect } from '../effects';

// Load all fonts used by caption presets and templates, with Polish character support
loadOutfit('normal', { weights: ['500', '600', '700'], subsets: ['latin', 'latin-ext'] });
loadInter('normal', { weights: ['400', '500', '600', '700'], subsets: ['latin', 'latin-ext'] });
loadMontserrat('normal', { weights: ['400', '500', '600', '700'], subsets: ['latin', 'latin-ext'] });
loadPoppins('normal', { weights: ['400', '500', '600', '700'], subsets: ['latin', 'latin-ext'] });
loadRoboto('normal', { weights: ['400', '500', '700'], subsets: ['latin', 'latin-ext'] });
loadUbuntu('normal', { weights: ['400', '500', '700'], subsets: ['latin', 'latin-ext'] });

const DEFAULT_TRANSITION_MS = 300;

/**
 * Entrance-only transition: computes how far the overlay has entered.
 * No exit animation - overlays stay at opacity 1 until replaced or hard-cut.
 */
function computeEntrance(
  currentTime: number,
  segment: ReelProps['bRollSegments'][number],
): { opacity: number; transform: string; clipPath?: string; filter?: string } {
  const transition = segment.transition ?? { type: 'crossfade' as const, durationMs: DEFAULT_TRANSITION_MS };
  const type = transition.type ?? 'crossfade';
  const durationSec = (transition.durationMs ?? DEFAULT_TRANSITION_MS) / 1000;

  if (type === 'none') {
    return { opacity: 1, transform: 'none' };
  }

  const progress = interpolate(
    currentTime,
    [segment.startTime, segment.startTime + durationSec],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  switch (type) {
    case 'crossfade':
      return { opacity: progress, transform: 'none' };
    case 'slide-left':
      return { opacity: 1, transform: `translateX(${(1 - progress) * 100}%)` };
    case 'slide-right':
      return { opacity: 1, transform: `translateX(${-(1 - progress) * 100}%)` };
    case 'zoom-in': {
      const scale = interpolate(progress, [0, 1], [1.3, 1]);
      return { opacity: progress, transform: `scale(${scale})` };
    }
    case 'slide-perspective-right': {
      // Card slides from the right with 3D perspective — left edge closer, right edge recedes into depth.
      const tx = interpolate(progress, [0, 1], [100, 0]);
      const rotY = interpolate(progress, [0, 1], [-22, 0]);
      return { opacity: 1, transform: `perspective(900px) translateX(${tx}%) rotateY(${rotY}deg)` };
    }
    case 'wipe':
      return { opacity: 1, transform: 'none', clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)` };
    case 'blur-dissolve': {
      const blur = interpolate(progress, [0, 0.5, 1], [20, 10, 0]);
      return { opacity: progress, transform: 'none', filter: `blur(${blur}px)` };
    }
    case 'flash-white':
      // White flash spike at midpoint, then reveal
      if (progress < 0.5) {
        return { opacity: 0, transform: 'none' };
      }
      return { opacity: 1, transform: 'none' };
    case 'whip-pan': {
      const tx = interpolate(progress, [0, 1], [120, 0]);
      const blur = interpolate(progress, [0, 0.5, 1], [15, 8, 0]);
      return { opacity: 1, transform: `translateX(${tx}%)`, filter: `blur(${blur}px)` };
    }
    case 'cross-zoom': {
      const scale = interpolate(progress, [0, 0.4, 1], [2, 1.2, 1]);
      const blur = interpolate(progress, [0, 0.4, 1], [12, 4, 0]);
      return { opacity: progress, transform: `scale(${scale})`, filter: `blur(${blur}px)` };
    }
    case 'iris-circle':
      return {
        opacity: 1,
        transform: 'none',
        clipPath: `circle(${progress * 100}% at 50% 50%)`,
      };
    case 'spin': {
      const rot = interpolate(progress, [0, 1], [180, 0]);
      const scale = interpolate(progress, [0, 0.5, 1], [0.3, 0.8, 1]);
      return { opacity: progress, transform: `rotate(${rot}deg) scale(${scale})` };
    }
    default:
      return { opacity: progress, transform: 'none' };
  }
}

/**
 * Renders overlay content based on media type.
 */
function OverlayContent({
  segment,
  primaryVideoUrl,
  secondaryVideoUrl,
}: {
  segment: ReelProps['bRollSegments'][number];
  primaryVideoUrl?: string;
  secondaryVideoUrl?: string;
}) {
  return <BRollCutaway segment={segment} />;
}

export const ReelComposition: React.FC<ReelProps> = ({
  layout,
  primaryVideoUrl,
  secondaryVideoUrl,
  bRollSegments,
  pipSegments = [],
  lowerThirds = [],
  ctaSegments = [],
  counters = [],
  zoomSegments = [],
  highlights = [],
  speedRamps = [],
  effects = [],
  voiceoverUrl,
  musicUrl,
  musicVolume = 0.3,
  cues,
  captionStyle,
  dynamicCaptionPosition = false,
  showProgressBar = true,
  backgroundColor = '#000000',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  const hasBRoll = bRollSegments.length > 0;

  // The ONE active overlay at current time
  const activeOverlay = bRollSegments.find(
    (br) => currentTime >= br.startTime && currentTime < br.endTime,
  );

  // When transitioning between adjacent segments, keep the previous overlay
  // visible underneath the incoming one. This prevents the base layer from
  // flashing through during the entrance transition.
  let heldOverlay: (typeof bRollSegments)[number] | null = null;
  if (activeOverlay) {
    const entranceDur = ((activeOverlay.transition?.durationMs ?? DEFAULT_TRANSITION_MS) / 1000);
    const inEntrance = currentTime < activeOverlay.startTime + entranceDur;
    if (inEntrance) {
      const found = bRollSegments.find((br) => {
        if (br === activeOverlay) return false;
        // Segment ended right when active started (adjacent, within 100ms tolerance)
        return br.endTime <= activeOverlay.startTime
          && br.endTime > activeOverlay.startTime - 0.1;
      });
      heldOverlay = found ?? null;
    }
  }

  // Exit fade: when an overlay ends and there's NO next adjacent segment,
  // apply a gentle crossfade out to the base layer.
  let exitingOverlay: (typeof bRollSegments)[number] | null = null;
  let exitOpacity = 1;
  if (!activeOverlay) {
    const EXIT_DURATION = 0.3; // seconds
    const found = bRollSegments.find((br) => {
      return currentTime >= br.endTime - EXIT_DURATION && currentTime < br.endTime;
    });
    if (found) {
      // Check if there's a next adjacent segment (if so, no exit fade needed)
      const hasNextAdjacent = bRollSegments.some(
        (br) => br !== found && Math.abs(br.startTime - found.endTime) < 0.1,
      );
      if (!hasNextAdjacent) {
        exitingOverlay = found;
        exitOpacity = interpolate(
          currentTime,
          [found.endTime - EXIT_DURATION, found.endTime],
          [1, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        );
      }
    }
  }

  const activeStyle = activeOverlay ? computeEntrance(currentTime, activeOverlay) : null;

  // Dynamic caption positioning: when enabled, captions move up for
  // split-screen/B-roll, smoothly transitioning in sync with overlay entrance/exit.
  let dynamicCaptionStyle = captionStyle;
  if (dynamicCaptionPosition && captionStyle) {
    const basePosition = captionStyle.position ?? 80;
    const positionForOverlayType = (type: string | undefined): number => {
      if (!type) return basePosition; // fullscreen
      if (type === 'split-screen') return Math.max(basePosition - 15, 50);
      return Math.max(basePosition - 5, 50); // B-roll
    };

    let captionPosition = positionForOverlayType(undefined);
    if (activeOverlay) {
      const from = positionForOverlayType(heldOverlay?.media.type);
      const target = positionForOverlayType(activeOverlay.media.type);
      const transitionSec = (activeOverlay.transition?.durationMs ?? DEFAULT_TRANSITION_MS) / 1000;
      const progress = interpolate(
        currentTime,
        [activeOverlay.startTime, activeOverlay.startTime + transitionSec],
        [0, 1],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
      );
      captionPosition = interpolate(progress, [0, 1], [from, target]);
    } else if (exitingOverlay) {
      const from = positionForOverlayType(exitingOverlay.media.type);
      const target = positionForOverlayType(undefined);
      captionPosition = interpolate(exitOpacity, [1, 0], [from, target]);
    }
    dynamicCaptionStyle = { ...captionStyle, position: captionPosition };
  }

  // Active zoom segment
  const activeZoom = zoomSegments.find(
    (z) => currentTime >= z.startTime && currentTime < z.endTime,
  );

  const baseContent = layout === 'split-screen' ? (
    <SplitScreenLayout
      primaryVideoUrl={primaryVideoUrl}
      secondaryVideoUrl={secondaryVideoUrl}
    />
  ) : (
    <FullscreenLayout primaryVideoUrl={primaryVideoUrl} speedRamps={speedRamps} />
  );

  return (
    <AbsoluteFill style={{ backgroundColor }}>
      {/* LAYER 0: Base + Zoom */}
      {activeZoom ? (
        <ZoomEffect segment={activeZoom}>{baseContent}</ZoomEffect>
      ) : (
        <AbsoluteFill>{baseContent}</AbsoluteFill>
      )}

      {/* LAYER 1a: Held overlay - previous segment kept visible during incoming entrance */}
      {heldOverlay && (
        <AbsoluteFill>
          <OverlayContent
            segment={heldOverlay}
            primaryVideoUrl={primaryVideoUrl}
            secondaryVideoUrl={secondaryVideoUrl}
          />
        </AbsoluteFill>
      )}

      {/* LAYER 1b: Exiting overlay - gentle fade out when ending with gap */}
      {exitingOverlay && (
        <AbsoluteFill style={{ opacity: exitOpacity }}>
          <OverlayContent
            segment={exitingOverlay}
            primaryVideoUrl={primaryVideoUrl}
            secondaryVideoUrl={secondaryVideoUrl}
          />
        </AbsoluteFill>
      )}

      {/* LAYER 2: Active overlay with entrance transition */}
      {activeOverlay && activeStyle && (
        <AbsoluteFill
          style={{
            opacity: activeStyle.clipPath ? 1 : activeStyle.opacity,
            transform: activeStyle.transform,
            overflow: 'hidden',
            ...(activeStyle.clipPath ? { clipPath: activeStyle.clipPath } : {}),
            ...(activeStyle.filter ? { filter: activeStyle.filter } : {}),
          }}
        >
          <OverlayContent
            segment={activeOverlay}
            primaryVideoUrl={primaryVideoUrl}
            secondaryVideoUrl={secondaryVideoUrl}
          />
        </AbsoluteFill>
      )}

      {/* Flash-white overlay for flash-white transition */}
      {activeOverlay && activeOverlay.transition?.type === 'flash-white' && (() => {
        const transitionDur = (activeOverlay.transition?.durationMs ?? DEFAULT_TRANSITION_MS) / 1000;
        const flashProgress = interpolate(
          currentTime,
          [activeOverlay.startTime, activeOverlay.startTime + transitionDur],
          [0, 1],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        );
        // White flash peaks at midpoint
        const flashOpacity = flashProgress < 0.5
          ? interpolate(flashProgress, [0, 0.5], [0, 1])
          : interpolate(flashProgress, [0.5, 1], [1, 0]);
        return flashOpacity > 0 ? (
          <AbsoluteFill
            style={{
              backgroundColor: '#FFFFFF',
              opacity: flashOpacity,
              zIndex: 20,
              pointerEvents: 'none',
            }}
          />
        ) : null;
      })()}

      {/* LAYER 3: Picture-in-Picture */}
      {pipSegments.map((seg, i) => (
        <PictureInPicture key={`pip-${i}`} segment={seg} />
      ))}

      {/* LAYER 4: Lower Thirds */}
      {lowerThirds.map((seg, i) => (
        <LowerThird key={`lt-${i}`} segment={seg} />
      ))}

      {/* LAYER 5: Highlight Boxes */}
      {highlights.map((seg, i) => (
        <HighlightBox key={`hl-${i}`} segment={seg} />
      ))}

      {/* LAYER 6: Audio tracks */}
      {voiceoverUrl && <Audio src={resolveMediaUrl(voiceoverUrl)} volume={1} />}
      {musicUrl && <Audio src={resolveMediaUrl(musicUrl)} volume={musicVolume} />}

      {/* LAYER 7: Animated captions */}
      {cues.length > 0 && (
        <CaptionOverlay cues={cues} style={dynamicCaptionStyle} />
      )}

      {/* LAYER 8: Animated counters */}
      {counters.map((seg, i) => (
        <AnimatedCounter key={`counter-${i}`} segment={seg} />
      ))}

      {/* LAYER 9: CTA overlays */}
      {ctaSegments.map((seg, i) => (
        <CtaOverlay key={`cta-${i}`} segment={seg} />
      ))}

      {/* LAYER: Plugin effects (sorted by layer number) */}
      {[...effects]
        .sort((a, b) => (getEffect(a.type)?.layer ?? 50) - (getEffect(b.type)?.layer ?? 50))
        .map((effect, i) => {
          const plugin = getEffect(effect.type);
          if (!plugin) return null;
          const Component = plugin.component;
          return <Component key={`fx-${effect.type}-${i}`} segment={effect as never} />;
        })}

      {/* LAYER: Effect SFX */}
      {effects
        .filter((e) => e.sfx?.url)
        .map((e, i) => (
          <Audio
            key={`sfx-${i}`}
            src={resolveMediaUrl(e.sfx!.url)}
            volume={e.sfx!.volume ?? 0.8}
            startFrom={Math.round(e.startTime * fps)}
          />
        ))}

      {/* LAYER 10: Progress bar */}
      {showProgressBar && <ProgressBar />}
    </AbsoluteFill>
  );
};
