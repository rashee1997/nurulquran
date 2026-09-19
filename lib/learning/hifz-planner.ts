import { db, VerseProgress, HifzTier } from '@/lib/db';
import { determineHifzTier, initializeVerseProgress } from './srs-engine';
import { localDayKey } from '@/lib/time/day';
import { SURAHS } from '@/lib/quran/surahs';
import { track } from '@/lib/telemetry/events';

export const TOTAL_AYAHS = 6236;
export const DEFAULT_PACE = 5;

export interface DailyHifzPlan {
  date: string;
  sabaq: VerseProgress[];
  sabqi: VerseProgress[];
  manzil: VerseProgress[];
  completedCounts: {
    sabaq: number;
    sabqi: number;
    manzil: number;
  };
  totalVersesMemorized: number;
  /** Days to finish the whole Mushaf at the chosen pace. */
  projectedCompletionDays: number;
  /** Ayahs allocated as Sabaq today (learner's pace). */
  pace: number;
  /** Where the next new portion will be drawn from. */
  nextPortion: { surah: number; ayah: number } | null;
  sabaqAddedToday: number;
}

export interface HifzGoalPace {
  ayahsPerDay: number;
  title: string;
  durationLabel: string;
}

export const HIFZ_PACES: HifzGoalPace[] = [
  { ayahsPerDay: 3, title: 'Gentle & Steady', durationLabel: '~5.7 years for the whole Mushaf' },
  { ayahsPerDay: 5, title: 'Standard Seminary', durationLabel: '~3.4 years' },
  { ayahsPerDay: 10, title: 'Intensive Track', durationLabel: '~1.7 years' },
  { ayahsPerDay: 15, title: 'Full 1-Page/Day', durationLabel: '~1.1 years' },
];

/** Days needed to memorise `remaining` ayahs at `pace` per day. */
export function projectDays(remaining: number, pace: number): number {
  return Math.ceil(Math.max(0, remaining) / Math.max(1, pace));
}

/**
 * The next `count` ayahs not yet in the queue, walking the Mushaf from `startSurah`
 * (wrapping after 114). Al-Fatihah is included in the walk like any other surah.
 */
export function nextUntrackedAyahs(
  tracked: ReadonlySet<string>,
  startSurah: number,
  count: number
): Array<{ surah: number; ayah: number }> {
  const result: Array<{ surah: number; ayah: number }> = [];
  for (let step = 0; step < SURAHS.length && result.length < count; step++) {
    const surahId = ((startSurah - 1 + step) % SURAHS.length) + 1;
    const surah = SURAHS.find((s) => s.id === surahId);
    if (!surah) continue;
    for (let ayah = 1; ayah <= surah.versesCount && result.length < count; ayah++) {
      if (!tracked.has(`${surahId}:${ayah}`)) result.push({ surah: surahId, ayah });
    }
  }
  return result;
}

/**
 * Allocates today's Sabaq: adds up to `pace` new ayahs (minus any already added today) to
 * the queue as `learning`, starting from the learner's target surah. Returns what was added.
 */
export async function allocateTodaysSabaq(): Promise<VerseProgress[]> {
  const profile = await db.userProfile.get('default_user');
  const pace = profile?.hifzPace ?? DEFAULT_PACE;
  const startSurah = profile?.hifzTargetSurah ?? 1;
  const all = await db.verseProgress.toArray();
  const today = localDayKey();
  const addedToday = all.filter((item) => item.repetitions === 0 && item.dueDate.startsWith(today)).length;
  const remaining = Math.max(0, pace - addedToday);
  if (remaining === 0) return [];

  const tracked = new Set(all.map((item) => item.verseKey));
  const picks = nextUntrackedAyahs(tracked, startSurah, remaining);
  const rows = picks.map(({ surah, ayah }) => {
    const row = initializeVerseProgress(surah, ayah);
    row.state = 'learning';
    return row;
  });
  if (rows.length > 0) {
    await db.verseProgress.bulkPut(rows);
    // Move the target surah forward once a surah is fully queued.
    const last = rows[rows.length - 1];
    const first = rows[0];
    if (last && first) {
      const lastSurah = SURAHS.find((s) => s.id === last.surah);
      if (lastSurah && last.ayah === lastSurah.versesCount && profile) {
        await db.userProfile.update('default_user', { hifzTargetSurah: (last.surah % SURAHS.length) + 1 });
      }
      track('planner.sabaq_allocated', { count: rows.length, from: `${first.surah}:${first.ayah}` });
    }
  }
  return rows;
}

/**
 * Loads the user's current Hifz status and aggregates verses into the tri-tier schedule.
 */
export async function getDailyHifzPlan(): Promise<DailyHifzPlan> {
  const [allProgress, profile] = await Promise.all([db.verseProgress.toArray(), db.userProfile.get('default_user')]);
  const pace = profile?.hifzPace ?? DEFAULT_PACE;

  const sabaq: VerseProgress[] = [];
  const sabqi: VerseProgress[] = [];
  const manzil: VerseProgress[] = [];

  allProgress.forEach((item) => {
    const tier: HifzTier = item.hifzTier || determineHifzTier(item);
    if (tier === 'sabaq') sabaq.push(item);
    else if (tier === 'sabqi') sabqi.push(item);
    else manzil.push(item);
  });

  const byMushaf = (a: VerseProgress, b: VerseProgress) => a.surah - b.surah || a.ayah - b.ayah;
  sabaq.sort(byMushaf);
  sabqi.sort(byMushaf);
  manzil.sort(byMushaf);

  const totalVersesMemorized = allProgress.filter((p) => p.state === 'memorized' || p.state === 'mastered').length;

  const today = localDayKey();
  const reviewedToday = (items: VerseProgress[]): number =>
    items.filter((p) => p.lastReviewedAt && localDayKey(new Date(p.lastReviewedAt)) === today).length;

  const tracked = new Set(allProgress.map((item) => item.verseKey));
  const [next] = nextUntrackedAyahs(tracked, profile?.hifzTargetSurah ?? 1, 1);
  const sabaqAddedToday = allProgress.filter((item) => item.repetitions === 0 && item.dueDate.startsWith(today)).length;

  return {
    date: today,
    sabaq,
    sabqi,
    manzil,
    completedCounts: {
      sabaq: reviewedToday(sabaq),
      sabqi: reviewedToday(sabqi),
      manzil: reviewedToday(manzil),
    },
    totalVersesMemorized,
    projectedCompletionDays: projectDays(TOTAL_AYAHS - totalVersesMemorized, pace),
    pace,
    nextPortion: next ?? null,
    sabaqAddedToday,
  };
}
