import type { ProductionPlan, ShotPlan, EffectPlan } from '../types';

/**
 * Adjusts a production plan's timestamps to match the actual TTS audio duration.
 * The planner works with estimated durations; after TTS we know the real length.
 */
export function adjustTimeline(
  plan: ProductionPlan,
  actualDurationSeconds: number,
): ProductionPlan {
  if (plan.shots.length === 0) return plan;

  const planEnd = Math.max(
    ...plan.shots.map((s) => s.endTime),
    ...plan.effects.map((e) => e.endTime),
  );

  // If the plan duration is very close to actual, no adjustment needed
  if (Math.abs(planEnd - actualDurationSeconds) < 0.5) return plan;

  const ratio = actualDurationSeconds / (planEnd || 1);

  const shots: ShotPlan[] = plan.shots.map((shot) => ({
    ...shot,
    startTime: shot.startTime * ratio,
    endTime: Math.min(shot.endTime * ratio, actualDurationSeconds),
  }));

  const effects: EffectPlan[] = plan.effects
    .map((effect) => ({
      ...effect,
      startTime: effect.startTime * ratio,
      endTime: Math.min(effect.endTime * ratio, actualDurationSeconds),
    }))
    .filter((e) => e.startTime < actualDurationSeconds);

  return { ...plan, shots, effects };
}
