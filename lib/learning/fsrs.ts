/**
 * FSRS (Free Spaced Repetition Scheduler), the algorithm Anki made its default in 23.10.
 *
 * This is a compact, dependency-free implementation of the FSRS-4.5/5 update rules with
 * the published default parameters. It is used by `srs-engine.ts` in place of SM-2, which
 * the benchmark literature shows needs 20–30% more reviews for the same retention.
 *
 * Model: each item has a *stability* S (days until recall probability falls to 90%) and
 * a *difficulty* D (1–10). Retrievability after t days is R(t) = (1 + F·t/S)^C with the
 * FSRS-4.5 forgetting curve (F = 19/81, C = -0.5). A review with grade g ∈ {1 Again,
 * 2 Hard, 3 Good, 4 Easy} updates D and S; the next interval is the t at which R(t)
 * equals the requested retention.
 */

export type FsrsGrade = 1 | 2 | 3 | 4;

/** Default FSRS-5 weights (w0..w18), fit on ~727M Anki reviews. */
export const FSRS_DEFAULT_WEIGHTS: readonly number[] = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192,
  1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
];

export const DEFAULT_REQUEST_RETENTION = 0.9;
export const MAX_INTERVAL_DAYS = 365;

const DECAY = -0.5;
const FACTOR = 19 / 81;

export interface FsrsMemory {
  stability: number;
  difficulty: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Probability of recall after `elapsedDays` for an item with stability `stability`. */
export function retrievability(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0;
  return Math.pow(1 + (FACTOR * Math.max(0, elapsedDays)) / stability, DECAY);
}

/** Interval (whole days, ≥ 1) at which recall probability drops to `retention`. */
export function intervalForRetention(stability: number, retention = DEFAULT_REQUEST_RETENTION): number {
  const raw = (stability / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
  return clamp(Math.round(raw), 1, MAX_INTERVAL_DAYS);
}

const w0 = (w: readonly number[], index: number): number => w[index] ?? 0;

function initialStability(w: readonly number[], grade: FsrsGrade): number {
  return Math.max(0.1, w0(w, grade - 1));
}

function initialDifficulty(w: readonly number[], grade: FsrsGrade): number {
  return clamp(w0(w, 4) - Math.exp(w0(w, 5) * (grade - 1)) + 1, 1, 10);
}

function nextDifficulty(w: readonly number[], difficulty: number, grade: FsrsGrade): number {
  const delta = -w0(w, 6) * (grade - 3);
  // Linear damping keeps difficulty from saturating at the extremes.
  const damped = difficulty + delta * ((10 - difficulty) / 9);
  // Mean reversion toward the difficulty of a "Good" first review.
  const target = initialDifficulty(w, 4);
  return clamp(w0(w, 7) * target + (1 - w0(w, 7)) * damped, 1, 10);
}

function stabilityAfterRecall(
  w: readonly number[],
  difficulty: number,
  stability: number,
  r: number,
  grade: FsrsGrade
): number {
  const hardPenalty = grade === 2 ? w0(w, 15) : 1;
  const easyBonus = grade === 4 ? w0(w, 16) : 1;
  const growth =
    Math.exp(w0(w, 8)) *
    (11 - difficulty) *
    Math.pow(stability, -w0(w, 9)) *
    (Math.exp(w0(w, 10) * (1 - r)) - 1) *
    hardPenalty *
    easyBonus;
  return Math.max(0.1, stability * (1 + growth));
}

function stabilityAfterForgetting(
  w: readonly number[],
  difficulty: number,
  stability: number,
  r: number
): number {
  const next =
    w0(w, 11) *
    Math.pow(difficulty, -w0(w, 12)) *
    (Math.pow(stability + 1, w0(w, 13)) - 1) *
    Math.exp(w0(w, 14) * (1 - r));
  // A lapse can never leave the item *more* stable than it was.
  return Math.max(0.1, Math.min(next, stability));
}

export interface FsrsReviewResult extends FsrsMemory {
  /** Recall probability at the moment of this review. */
  retrievabilityAtReview: number;
  /** Interval to the next review, in whole days. */
  intervalDays: number;
}

/**
 * Applies one review.
 *
 * `memory` is null for the very first review of an item. `elapsedDays` is the time since
 * the previous review (ignored on the first one).
 */
export function fsrsReview(
  memory: FsrsMemory | null,
  grade: FsrsGrade,
  elapsedDays: number,
  options: { weights?: readonly number[]; retention?: number } = {}
): FsrsReviewResult {
  const w = options.weights ?? FSRS_DEFAULT_WEIGHTS;
  const retention = options.retention ?? DEFAULT_REQUEST_RETENTION;

  if (!memory) {
    const stability = initialStability(w, grade);
    const difficulty = initialDifficulty(w, grade);
    return {
      stability,
      difficulty,
      retrievabilityAtReview: 1,
      intervalDays: grade === 1 ? 1 : intervalForRetention(stability, retention),
    };
  }

  const r = retrievability(elapsedDays, memory.stability);
  const difficulty = nextDifficulty(w, memory.difficulty, grade);
  const stability =
    grade === 1
      ? stabilityAfterForgetting(w, memory.difficulty, memory.stability, r)
      : stabilityAfterRecall(w, memory.difficulty, memory.stability, r, grade);

  return {
    stability,
    difficulty,
    retrievabilityAtReview: r,
    intervalDays: grade === 1 ? 1 : intervalForRetention(stability, retention),
  };
}

/**
 * Derives an FSRS memory state from legacy SM-2 fields, so items reviewed under the old
 * scheduler carry their history forward instead of restarting as new.
 *
 * Stability is approximated by the last SM-2 interval (which SM-2 also treats as the
 * period the item survives), and difficulty is mapped inversely from the ease factor
 * (EF 1.3 ≈ hardest, EF 2.5+ ≈ average).
 */
export function memoryFromLegacy(interval: number, easeFactor: number, repetitions: number): FsrsMemory | null {
  if (repetitions <= 0 && interval <= 0) return null;
  const stability = Math.max(0.5, interval || 1);
  const difficulty = clamp(10 - ((easeFactor - 1.3) / 1.7) * 6, 1, 10);
  return { stability, difficulty };
}

/** Maps the app's historic 0–5 quality scale to an FSRS grade. */
export function gradeFromQuality(quality: number): FsrsGrade {
  if (quality <= 1) return 1;
  if (quality === 2 || quality === 3) return 2;
  if (quality === 4) return 3;
  return 4;
}
