import type { CalculateMetadataFunction } from 'remotion';
import type { ReelProps } from '../schemas/reel-props';

const FPS = 30;
const MIN_DURATION_SECONDS = 1;
const DEFAULT_DURATION_SECONDS = 15;

/**
 * Gets video duration using dynamic import to avoid bundling @remotion/renderer
 * (server-side module) into the browser bundle.
 */
async function getMediaDuration(url: string): Promise<number | null> {
  try {
    const { getVideoMetadata } = await import('@remotion/renderer');
    const meta = await getVideoMetadata(url);
    return meta.durationInSeconds;
  } catch {
    return null;
  }
}

/**
 * Calculates the reel duration dynamically from props:
 * - Primary video duration (if provided)
 * - Last cue endTime
 * - Last B-roll segment endTime
 * - Voiceover duration (if provided)
 *
 * Takes the maximum of all sources. Falls back to DEFAULT_DURATION_SECONDS.
 */
export const calculateReelMetadata: CalculateMetadataFunction<ReelProps> = async ({
  props,
}) => {
  const durations: number[] = [];

  // Get video durations (dynamic import avoids webpack bundling server code)
  if (props.primaryVideoUrl) {
    const d = await getMediaDuration(props.primaryVideoUrl);
    if (d !== null) durations.push(d);
  }

  if (props.voiceoverUrl) {
    const d = await getMediaDuration(props.voiceoverUrl);
    if (d !== null) durations.push(d);
  }

  // Get duration from cues
  if (props.cues.length > 0) {
    const lastCueEnd = Math.max(...props.cues.map((c) => c.endTime));
    durations.push(lastCueEnd);
  }

  // Get duration from B-roll segments
  if (props.bRollSegments.length > 0) {
    const lastBRollEnd = Math.max(...props.bRollSegments.map((br) => br.endTime));
    durations.push(lastBRollEnd);
  }

  const maxDuration =
    durations.length > 0
      ? Math.max(MIN_DURATION_SECONDS, ...durations)
      : DEFAULT_DURATION_SECONDS;

  return {
    fps: FPS,
    durationInFrames: Math.ceil(maxDuration * FPS),
  };
};
