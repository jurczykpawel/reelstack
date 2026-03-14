import type { CalculateMetadataFunction } from 'remotion';
import type { ScreenExplainerProps } from './schema';

const FPS = 30;
const MIN_DURATION_SECONDS = 1;
const DEFAULT_DURATION_SECONDS = 15;

/**
 * Calculates ScreenExplainer duration from props:
 * - durationSeconds (explicit)
 * - Last section endTime
 * - Last cue endTime
 */
export const calculateScreenExplainerMetadata: CalculateMetadataFunction<ScreenExplainerProps> = async ({
  props,
}) => {
  const durations: number[] = [];

  if (props.durationSeconds) {
    durations.push(props.durationSeconds);
  }

  if (props.sections.length > 0) {
    const lastEnd = Math.max(...props.sections.map((s) => s.endTime));
    durations.push(lastEnd);
  }

  if (props.cues.length > 0) {
    const lastCueEnd = Math.max(...props.cues.map((c) => c.endTime));
    durations.push(lastCueEnd);
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
