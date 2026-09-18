import { HifzTier, SrsState, VerseProgress } from '../db';
import { fsrsReview, gradeFromQuality, memoryFromLegacy, retrievability } from './fsrs';
import { db } from '../db';

/**
 * Verse scheduler: FSRS underneath, the classical tri-tier Hifz vocabulary on top.
 *
 * Grades arrive on the app's 0–5 quality scale (kept so every caller and every stored
 * review stays valid) and are mapped to FSRS Again/Hard/Good/Easy. The seven display
 * states ('new' → 'learning' → 'familiar' → 'memorized' → 'review' → 'weak' → 'mastered')
 * and the three tiers are derived from the resulting stability, so:
 *
 * 1. Sabaq (السبق): stability up to 3 days — today's or yesterday's lesson.
 * 2. Sabqi (السبقي): stability 3–14 days — the recent consolidation buffer.
 * 3. Manzil (المنزل): stability over 14 days — long-term rotation.
 *
 * `interval`, `easeFactor`, `repetitions` and `lapses` are still written for backward
 * compatibility with older backups; `stability` and `difficulty` are the source of truth.
 */

export interface ReviewSubmission {
  verseKey: string;
  surah: number;
  ayah: number;
  quality: number; // 0 to 5
}

export function determineHifzTier(progress: VerseProgress): HifzTier {
  const stability = progress.stability ?? progress.interval;
  if (progress.repetitions <= 1 || stability <= 3) {
    return 'sabaq';
  }
  if (stability <= 14) {
    return 'sabqi';
  }
  return 'manzil';
}

/** Current recall probability (0–1) for an item, given the time since its last review. */
export function currentRetrievability(progress: VerseProgress, now: Date = new Date()): number {
  const stability = progress.stability ?? (progress.interval > 0 ? progress.interval : 0);
  if (stability <= 0 || !progress.lastReviewedAt) return progress.repetitions > 0 ? 0.5 : 0;
  const elapsedDays = (now.getTime() - new Date(progress.lastReviewedAt).getTime()) / 86_400_000;
  return retrievability(elapsedDays, stability);
}

export function initializeVerseProgress(surah: number, ayah: number): VerseProgress {
  const init: VerseProgress = {
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
  init.hifzTier = determineHifzTier(init);
  return init;
}

/**
 * Applies one review and returns the rescheduled item.
 *
 * `quality` is 0–5 (0 blackout … 5 perfect) and is mapped to an FSRS grade. The returned
 * record is a new object; the caller persists it.
 */
export function calculateNextReview(
  current: VerseProgress,
  quality: number,
  now: Date = new Date()
): VerseProgress {
  const q = Math.max(0, Math.min(5, Math.round(quality)));
  const grade = gradeFromQuality(q);

  const previousMemory =
    current.stability !== undefined && current.difficulty !== undefined
      ? { stability: current.stability, difficulty: current.difficulty }
      : memoryFromLegacy(current.interval, current.easeFactor, current.repetitions);

  const elapsedDays = current.lastReviewedAt
    ? Math.max(0, (now.getTime() - new Date(current.lastReviewedAt).getTime()) / 86_400_000)
    : 0;

  const result = fsrsReview(previousMemory, grade, elapsedDays);

  let { repetitions, lapses } = current;
  let nextState: SrsState;

  if (grade === 1) {
    repetitions = 0;
    lapses += 1;
    nextState = lapses > 2 ? 'weak' : 'learning';
  } else {
    repetitions += 1;
    if (repetitions === 1) nextState = 'learning';
    else if (result.stability < 3) nextState = 'familiar';
    else if (result.stability < 14) nextState = 'memorized';
    else if (result.stability >= 30 && repetitions >= 5) nextState = 'mastered';
    else nextState = 'review';
  }

  // Legacy ease factor kept in step so a backup restored on an older build still grades.
  let easeFactor = current.easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3;

  const nextDate = new Date(now.getTime() + result.intervalDays * 24 * 60 * 60 * 1000);

  const updated: VerseProgress = {
    ...current,
    interval: result.intervalDays,
    easeFactor: Number(easeFactor.toFixed(2)),
    repetitions,
    lapses,
    state: nextState,
    dueDate: nextDate.toISOString(),
    lastReviewedAt: now.toISOString(),
    stability: Number(result.stability.toFixed(3)),
    difficulty: Number(result.difficulty.toFixed(3)),
  };

  updated.hifzTier = determineHifzTier(updated);
  return updated;
}

/** Earliest due date among the items, or null when there are none. */
export function nextDueAt(items: readonly VerseProgress[]): Date | null {
  let earliest: number | null = null;
  for (const item of items) {
    const time = new Date(item.dueDate).getTime();
    if (!Number.isFinite(time)) continue;
    if (earliest === null || time < earliest) earliest = time;
  }
  return earliest === null ? null : new Date(earliest);
}

export function isItemDue(dueDateIso: string): boolean {
  return new Date(dueDateIso).getTime() <= Date.now();
}

/**
 * The interval each grade would produce, without touching storage — the "Good → 9d"
 * preview on the grade buttons. Same FSRS path as `calculateNextReview`, so the preview
 * can never disagree with what grading actually does.
 */
export function previewGrades(current: VerseProgress): Record<'again' | 'hard' | 'good' | 'easy', number> {
  const preview = (grade: 1 | 2 | 3 | 4): number =>
    calculateNextReview(current, grade === 1 ? 1 : grade === 2 ? 3 : grade === 3 ? 4 : 5, new Date()).interval;
  return { again: preview(1), hard: preview(2), good: preview(3), easy: preview(4) };
}

/** Verses with at least one recitation mistake in the last `days` days. */
export async function recentMistakeVerseKeys(days = 14): Promise<Set<string>> {
  const cutoff = Date.now() - days * 86_400_000;
  const rows = await db.recitationMistakes.toArray();
  const keys = new Set<string>();
  for (const row of rows) {
    if (new Date(row.at).getTime() >= cutoff) keys.add(row.verseKey);
  }
  return keys;
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

export const HIFZ_TIER_META: Record<
  HifzTier,
  {
    titleEn: string;
    titleAr: string;
    titleTa: string;
    descriptionEn: string;
    descriptionTa: string;
    badgeBg: string;
    badgeText: string;
  }
> = {
  sabaq: {
    titleEn: 'Sabaq (Daily Lesson)',
    titleAr: 'السبق',
    titleTa: 'சபக் (புதிய பாடம்)',
    descriptionEn: "New verses memorized within the last 1-3 days.",
    descriptionTa: 'கடந்த 1-3 நாட்களில் புதிதாக மனனம் செய்யப்பட்ட வசனங்கள்.',
    badgeBg: 'bg-primary-subtle border border-primary/40',
    badgeText: 'text-primary-strong',
  },
  sabqi: {
    titleEn: 'Sabqi (Recent Buffer)',
    titleAr: 'السبقي',
    titleTa: 'சப்கி (சமீபத்திய மீளாய்வு)',
    descriptionEn: 'The previous 5-10 pages under continuous consolidation.',
    descriptionTa: 'சமீபத்தில் மனனம் செய்யப்பட்டு உறுதியாக்கப்படும் முந்தைய 5-10 பக்கங்கள்.',
    badgeBg: 'bg-secondary-subtle border border-secondary/40',
    badgeText: 'text-secondary-strong',
  },
  manzil: {
    titleEn: 'Manzil (Revision Cycle)',
    titleAr: 'المنزل',
    titleTa: 'மன்ஸில் (நிரந்தர திருப்புதல்)',
    descriptionEn: 'Older mastered sections rotated on a weekly/monthly cycle.',
    descriptionTa: 'ஏற்கனவே மனனம் செய்யப்பட்ட பகுதிகளை வார/மாத சுழற்சியில் ஓதிப்பார்த்தல்.',
    badgeBg: 'bg-surface-muted border border-border',
    badgeText: 'text-foreground',
  },
};

