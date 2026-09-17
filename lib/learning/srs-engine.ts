import { SrsState, VerseProgress } from '../db';

/**
 * Enhanced SM-2 / FSRS-inspired algorithm for Quranic memorization.
 * Evaluates ease factor, consecutive successes, and lapse counts across 7 discrete states:
 * 'new' -> 'learning' -> 'familiar' -> 'memorized' -> 'review' -> 'weak' -> 'mastered'
 */

export interface ReviewSubmission {
  verseKey: string;
  surah: number;
  ayah: number;
  quality: number; // 0 to 5
}

export function initializeVerseProgress(surah: number, ayah: number): VerseProgress {
  return {
    verseKey: `${surah}:${ayah}`,
    surah,
    ayah,
    state: 'new',
    interval: 0,
    easeFactor: 2.5,
    dueDate: new Date().toISOString(),
    lapses: 0,
    repetitions: 0,
  };
}

/**
 * Calculates next review date, interval, ease factor, and state transition deterministically.
 */
export function calculateNextReview(
  current: VerseProgress,
  quality: number // 0: Blackout, 1: Incorrect, 2: Hard, 3: Good, 4: Great, 5: Perfect
): VerseProgress {
  let { interval, easeFactor, repetitions, lapses } = current;

  // Bound quality between 0 and 5
  const q = Math.max(0, Math.min(5, quality));

  // Update Ease Factor: EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  // Minimum EF is 1.3
  easeFactor = easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3;

  let nextState: SrsState = current.state;

  if (q < 3) {
    // Failure (Again / Hard reset)
    repetitions = 0;
    interval = 1; // repeat tomorrow or today
    lapses += 1;
    nextState = lapses > 2 ? 'weak' : 'learning';
  } else {
    // Success
    repetitions += 1;
    if (repetitions === 1) {
      interval = 1;
      nextState = 'learning';
    } else if (repetitions === 2) {
      interval = 3;
      nextState = 'familiar';
    } else if (repetitions === 3) {
      interval = 7;
      nextState = 'memorized';
    } else {
      interval = Math.round(interval * easeFactor);
      if (repetitions >= 7 && interval >= 30) {
        nextState = 'mastered';
      } else {
        nextState = 'review';
      }
    }
  }

  // Calculate due date
  const now = new Date();
  const nextDate = new Date(now.getTime() + interval * 24 * 60 * 60 * 1000);

  return {
    ...current,
    interval,
    easeFactor: Number(easeFactor.toFixed(2)),
    repetitions,
    lapses,
    state: nextState,
    dueDate: nextDate.toISOString(),
    lastReviewedAt: now.toISOString(),
  };
}

export function isItemDue(dueDateIso: string): boolean {
  return new Date(dueDateIso).getTime() <= Date.now();
}

export const STATE_LABELS: Record<SrsState, { label: string; color: string; bg: string }> = {
  new: { label: 'New', color: 'text-muted-foreground', bg: 'bg-surface border border-border' },
  learning: { label: 'Learning', color: 'text-primary-strong', bg: 'bg-primary-subtle border border-primary/30' },
  familiar: { label: 'Familiar', color: 'text-secondary-strong', bg: 'bg-secondary-subtle border border-secondary/30' },
  memorized: { label: 'Memorized', color: 'text-primary-strong', bg: 'bg-primary-subtle border border-primary/30' },
  review: { label: 'In Review', color: 'text-primary-strong', bg: 'bg-primary-subtle border border-primary/30' },
  weak: { label: 'Needs Focus', color: 'text-danger-strong', bg: 'bg-danger-subtle border border-danger/30' },
  mastered: { label: 'Mastered', color: 'text-secondary-strong', bg: 'bg-secondary-subtle border border-secondary/30' },
};
