import { db, VerseProgress, HifzTier } from '@/lib/db';
import { determineHifzTier } from './srs-engine';

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
  projectedCompletionDays: number;
}

export interface HifzGoalPace {
  ayahsPerDay: number;
  title: string;
  durationLabel: string;
}

export const HIFZ_PACES: HifzGoalPace[] = [
  { ayahsPerDay: 3, title: 'Gentle & Steady', durationLabel: '~5.5 Years (6,236 Ayahs)' },
  { ayahsPerDay: 5, title: 'Standard Seminary', durationLabel: '~3.4 Years' },
  { ayahsPerDay: 10, title: 'Intensive Track', durationLabel: '~1.7 Years' },
  { ayahsPerDay: 15, title: 'Full 1-Page/Day', durationLabel: '~1.1 Years' },
];

/**
 * Loads the user's current Hifz status and aggregates verses into the tri-tier schedule.
 */
export async function getDailyHifzPlan(): Promise<DailyHifzPlan> {
  const allProgress = await db.verseProgress.toArray();

  const sabaq: VerseProgress[] = [];
  const sabqi: VerseProgress[] = [];
  const manzil: VerseProgress[] = [];

  allProgress.forEach((item) => {
    const tier = item.hifzTier || determineHifzTier(item);
    if (tier === 'sabaq') {
      sabaq.push(item);
    } else if (tier === 'sabqi') {
      sabqi.push(item);
    } else {
      manzil.push(item);
    }
  });

  const totalVersesMemorized = allProgress.filter(
    (p) => p.state === 'memorized' || p.state === 'mastered'
  ).length;

  const remaining = Math.max(0, 6236 - totalVersesMemorized);
  const projectedDays = Math.ceil(remaining / 5);

  return {
    date: new Date().toISOString().split('T')[0],
    sabaq,
    sabqi,
    manzil,
    completedCounts: {
      sabaq: sabaq.filter((p) => p.lastReviewedAt?.startsWith(new Date().toISOString().split('T')[0])).length,
      sabqi: sabqi.filter((p) => p.lastReviewedAt?.startsWith(new Date().toISOString().split('T')[0])).length,
      manzil: manzil.filter((p) => p.lastReviewedAt?.startsWith(new Date().toISOString().split('T')[0])).length,
    },
    totalVersesMemorized,
    projectedCompletionDays: projectedDays,
  };
}
