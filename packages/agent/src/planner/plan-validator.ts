/**
 * Production Plan Validator
 *
 * Deterministic validation + auto-fix of LLM-generated plans.
 * Catches issues that the LLM prompt guidelines ask for but don't enforce:
 * - Effect time overlaps
 * - Counter/effect/CTA collisions
 * - B-roll gaps in faceless reels
 * - Caption zone conflicts
 * - Duplicate representations (text-emphasis + counter for same concept)
 *
 * Run AFTER planning, BEFORE asset generation.
 */
import type { ProductionPlan, EffectPlan } from '../types';

export interface ValidationIssue {
  readonly severity: 'error' | 'warning';
  readonly type: string;
  readonly message: string;
  readonly autoFixed: boolean;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
  readonly fixedPlan: ProductionPlan;
}

/** All timed elements from a plan, normalized for overlap checking */
interface TimedElement {
  readonly source: string; // 'effect', 'counter', 'cta', 'lowerThird'
  readonly index: number;
  readonly type: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly position?: string; // 'top', 'center', 'bottom'
}

const MIN_GAP_BETWEEN_EFFECTS = 0.3; // seconds

export function validatePlan(plan: ProductionPlan, audioDuration: number): ValidationResult {
  const issues: ValidationIssue[] = [];
  let fixedPlan = { ...plan };

  // ── 1. Effect overlap detection & fix ──────────────────────────
  const allTimed = collectTimedElements(plan);
  const overlaps = findOverlaps(allTimed);

  if (overlaps.length > 0) {
    const { fixed, fixIssues } = fixOverlaps(plan, overlaps);
    fixedPlan = fixed;
    issues.push(...fixIssues);
  }

  // ── 2. B-roll gap detection (faceless reels) ───────────────────
  if (plan.primarySource.type === 'none') {
    const gapIssues = findBRollGaps(plan.shots, audioDuration);
    issues.push(...gapIssues);
  }

  // ── 3. Bottom-screen collisions ────────────────────────────────
  const bottomCollisions = findBottomScreenCollisions(fixedPlan);
  if (bottomCollisions.length > 0) {
    const { fixed, fixIssues } = fixBottomCollisions(fixedPlan, bottomCollisions);
    fixedPlan = fixed;
    issues.push(...fixIssues);
  }

  // ── 4. Effects out of bounds ───────────────────────────────────
  const outOfBounds = findOutOfBoundsElements(fixedPlan, audioDuration);
  if (outOfBounds.length > 0) {
    const { fixed, fixIssues } = fixOutOfBounds(fixedPlan, outOfBounds, audioDuration);
    fixedPlan = fixed;
    issues.push(...fixIssues);
  }

  const hasErrors = issues.some((i) => i.severity === 'error' && !i.autoFixed);

  return {
    valid: !hasErrors,
    issues,
    fixedPlan,
  };
}

// ── Helpers ──────────────────────────────────────────────────────

function collectTimedElements(plan: ProductionPlan): TimedElement[] {
  const elements: TimedElement[] = [];

  plan.effects.forEach((e, i) => {
    elements.push({
      source: 'effect',
      index: i,
      type: e.type,
      startTime: e.startTime,
      endTime: e.endTime,
      position: (e.config as any)?.position,
    });
  });

  (plan.counters ?? []).forEach((c, i) => {
    elements.push({
      source: 'counter',
      index: i,
      type: 'counter',
      startTime: c.startTime,
      endTime: c.endTime,
      position: (c as any).position ?? 'center',
    });
  });

  (plan.ctaSegments ?? []).forEach((c, i) => {
    elements.push({
      source: 'cta',
      index: i,
      type: 'cta',
      startTime: c.startTime,
      endTime: c.endTime,
      position: (c as any).position ?? 'bottom',
    });
  });

  (plan.lowerThirds ?? []).forEach((lt, i) => {
    elements.push({
      source: 'lowerThird',
      index: i,
      type: 'lowerThird',
      startTime: lt.startTime,
      endTime: lt.endTime,
      position: 'bottom',
    });
  });

  return elements.sort((a, b) => a.startTime - b.startTime);
}

interface Overlap {
  a: TimedElement;
  b: TimedElement;
  overlapStart: number;
  overlapEnd: number;
}

function findOverlaps(elements: TimedElement[]): Overlap[] {
  const overlaps: Overlap[] = [];

  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const a = elements[i];
      const b = elements[j];

      // Check if they overlap in time (with minimum gap)
      const overlapStart = Math.max(a.startTime, b.startTime);
      const overlapEnd = Math.min(a.endTime, b.endTime);

      if (overlapEnd - overlapStart > -MIN_GAP_BETWEEN_EFFECTS) {
        // They overlap or are too close
        overlaps.push({ a, b, overlapStart, overlapEnd });
      }
    }
  }

  return overlaps;
}

function fixOverlaps(plan: ProductionPlan, overlaps: Overlap[]): { fixed: ProductionPlan; fixIssues: ValidationIssue[] } {
  const fixIssues: ValidationIssue[] = [];
  const effectsToRemove = new Set<number>();
  const countersToRemove = new Set<number>();

  for (const { a, b } of overlaps) {
    const desc = `${a.source}[${a.index}] "${a.type}" [${a.startTime.toFixed(1)}s-${a.endTime.toFixed(1)}s] overlaps with ${b.source}[${b.index}] "${b.type}" [${b.startTime.toFixed(1)}s-${b.endTime.toFixed(1)}s]`;

    // Strategy: remove the less important element
    // Priority: counter > text-emphasis > emoji-popup > subscribe-banner > screen-shake > color-flash > glitch-transition > cta > lowerThird
    const priority: Record<string, number> = {
      counter: 10,
      'text-emphasis': 9,
      'emoji-popup': 7,
      'subscribe-banner': 6,
      'screen-shake': 5,
      'color-flash': 4,
      'glitch-transition': 3,
      cta: 2,
      lowerThird: 1,
    };

    const aPriority = priority[a.type] ?? 0;
    const bPriority = priority[b.type] ?? 0;

    // Remove the lower-priority one
    const toRemove = aPriority >= bPriority ? b : a;

    if (toRemove.source === 'effect') {
      effectsToRemove.add(toRemove.index);
    } else if (toRemove.source === 'counter') {
      countersToRemove.add(toRemove.index);
    }
    // CTA and lowerThird: just warn, don't remove

    fixIssues.push({
      severity: 'warning',
      type: 'effect-overlap',
      message: `${desc} → removed ${toRemove.source}[${toRemove.index}] "${toRemove.type}"`,
      autoFixed: true,
    });
  }

  return {
    fixed: {
      ...plan,
      effects: plan.effects.filter((_, i) => !effectsToRemove.has(i)),
      counters: (plan.counters ?? []).filter((_, i) => !countersToRemove.has(i)),
    },
    fixIssues,
  };
}

function findBRollGaps(shots: ProductionPlan['shots'], audioDuration: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (shots.length === 0) {
    issues.push({
      severity: 'error',
      type: 'no-shots',
      message: 'Faceless reel has no shots — will be entirely black screen',
      autoFixed: false,
    });
    return issues;
  }

  // Check first shot starts at 0
  if (shots[0].startTime > 0.5) {
    issues.push({
      severity: 'warning',
      type: 'broll-gap-start',
      message: `First shot starts at ${shots[0].startTime.toFixed(1)}s, not 0s — ${shots[0].startTime.toFixed(1)}s of black screen at start`,
      autoFixed: false,
    });
  }

  // Check gaps between shots
  for (let i = 1; i < shots.length; i++) {
    const prev = shots[i - 1];
    const curr = shots[i];
    const gap = curr.startTime - prev.endTime;

    if (gap > 0.5) {
      issues.push({
        severity: 'warning',
        type: 'broll-gap',
        message: `${gap.toFixed(1)}s gap between shot-${i} (ends ${prev.endTime.toFixed(1)}s) and shot-${i + 1} (starts ${curr.startTime.toFixed(1)}s)`,
        autoFixed: false,
      });
    }
  }

  // Check last shot covers end
  const lastShot = shots[shots.length - 1];
  if (audioDuration - lastShot.endTime > 0.5) {
    issues.push({
      severity: 'warning',
      type: 'broll-gap-end',
      message: `Last shot ends at ${lastShot.endTime.toFixed(1)}s but audio is ${audioDuration.toFixed(1)}s — ${(audioDuration - lastShot.endTime).toFixed(1)}s of black screen at end`,
      autoFixed: false,
    });
  }

  return issues;
}

function findBottomScreenCollisions(plan: ProductionPlan): Overlap[] {
  const bottomElements: TimedElement[] = [];

  plan.effects.forEach((e, i) => {
    if (e.type === 'subscribe-banner') {
      bottomElements.push({ source: 'effect', index: i, type: e.type, startTime: e.startTime, endTime: e.endTime, position: 'bottom' });
    }
  });

  (plan.ctaSegments ?? []).forEach((c, i) => {
    bottomElements.push({ source: 'cta', index: i, type: 'cta', startTime: c.startTime, endTime: c.endTime, position: 'bottom' });
  });

  (plan.lowerThirds ?? []).forEach((lt, i) => {
    bottomElements.push({ source: 'lowerThird', index: i, type: 'lowerThird', startTime: lt.startTime, endTime: lt.endTime, position: 'bottom' });
  });

  return findOverlaps(bottomElements);
}

function fixBottomCollisions(plan: ProductionPlan, collisions: Overlap[]): { fixed: ProductionPlan; fixIssues: ValidationIssue[] } {
  const fixIssues: ValidationIssue[] = [];

  for (const { a, b } of collisions) {
    fixIssues.push({
      severity: 'warning',
      type: 'bottom-collision',
      message: `Bottom-screen collision: ${a.source} "${a.type}" and ${b.source} "${b.type}" overlap at ${a.startTime.toFixed(1)}s-${b.endTime.toFixed(1)}s`,
      autoFixed: false,
    });
  }

  return { fixed: plan, fixIssues };
}

function findOutOfBoundsElements(plan: ProductionPlan, audioDuration: number): TimedElement[] {
  const allTimed = collectTimedElements(plan);
  return allTimed.filter((e) => e.endTime > audioDuration + 0.5 || e.startTime < -0.5);
}

function fixOutOfBounds(plan: ProductionPlan, outOfBounds: TimedElement[], audioDuration: number): { fixed: ProductionPlan; fixIssues: ValidationIssue[] } {
  const fixIssues: ValidationIssue[] = [];
  const effectsToRemove = new Set<number>();

  for (const elem of outOfBounds) {
    fixIssues.push({
      severity: 'warning',
      type: 'out-of-bounds',
      message: `${elem.source}[${elem.index}] "${elem.type}" at ${elem.startTime.toFixed(1)}s-${elem.endTime.toFixed(1)}s is outside audio duration (${audioDuration.toFixed(1)}s) → removed`,
      autoFixed: true,
    });
    if (elem.source === 'effect') {
      effectsToRemove.add(elem.index);
    }
  }

  return {
    fixed: {
      ...plan,
      effects: plan.effects.filter((_, i) => !effectsToRemove.has(i)),
    },
    fixIssues,
  };
}
