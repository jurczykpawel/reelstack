import { AbsoluteFill, Audio, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { loadFont as loadOutfit } from '@remotion/google-fonts/Outfit';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import type { ReelProps } from '../schemas/reel-props';
import { resolveMediaUrl } from '../utils/resolve-media-url';
import { SplitScreenLayout } from '../layouts/SplitScreenLayout';
import { FullscreenLayout } from '../layouts/FullscreenLayout';
import { CaptionOverlay } from '../components/CaptionOverlay';
import { ProgressBar } from '../components/ProgressBar';
import { BRollCutaway } from '../components/BRollCutaway';

// Load brand fonts with Polish character support
loadOutfit('normal', { weights: ['500', '600', '700'], subsets: ['latin', 'latin-ext'] });
loadInter('normal', { weights: ['400', '500', '600'], subsets: ['latin', 'latin-ext'] });

const DEFAULT_TRANSITION_MS = 300;

/**
 * Entrance-only transition: computes how far the overlay has entered.
 * No exit animation - overlays stay at opacity 1 until replaced or hard-cut.
 */
function computeEntrance(
  currentTime: number,
  segment: ReelProps['bRollSegments'][number],
): { opacity: number; transform: string; clipPath?: string } {
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
    case 'wipe':
      return { opacity: 1, transform: 'none', clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)` };
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
  if (segment.media.type === 'split-screen') {
    return (
      <SplitScreenLayout
        primaryVideoUrl={primaryVideoUrl}
        secondaryVideoUrl={secondaryVideoUrl}
      />
    );
  }
  return <BRollCutaway segment={segment} />;
}

export const ReelComposition: React.FC<ReelProps> = ({
  layout,
  primaryVideoUrl,
  secondaryVideoUrl,
  bRollSegments,
  voiceoverUrl,
  musicUrl,
  musicVolume = 0.3,
  cues,
  captionStyle,
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

  return (
    <AbsoluteFill style={{ backgroundColor }}>
      {/* LAYER 0: Base - always fullscreen when B-roll used, otherwise layout prop */}
      <AbsoluteFill>
        {hasBRoll ? (
          <FullscreenLayout primaryVideoUrl={primaryVideoUrl} />
        ) : layout === 'split-screen' ? (
          <SplitScreenLayout
            primaryVideoUrl={primaryVideoUrl}
            secondaryVideoUrl={secondaryVideoUrl}
          />
        ) : (
          <FullscreenLayout primaryVideoUrl={primaryVideoUrl} />
        )}
      </AbsoluteFill>

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
          }}
        >
          <OverlayContent
            segment={activeOverlay}
            primaryVideoUrl={primaryVideoUrl}
            secondaryVideoUrl={secondaryVideoUrl}
          />
        </AbsoluteFill>
      )}

      {/* LAYER 3: Audio tracks */}
      {voiceoverUrl && <Audio src={resolveMediaUrl(voiceoverUrl)} volume={1} />}
      {musicUrl && <Audio src={resolveMediaUrl(musicUrl)} volume={musicVolume} />}

      {/* LAYER 4: Animated captions */}
      {cues.length > 0 && (
        <CaptionOverlay cues={cues} style={captionStyle} />
      )}

      {/* LAYER 5: Progress bar */}
      {showProgressBar && <ProgressBar />}
    </AbsoluteFill>
  );
};
