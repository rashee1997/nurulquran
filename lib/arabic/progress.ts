/**
 * Arabic Lab persistence (Dexie v3).
 *
 * Completion and XP flow through the same records the Tajweed ladder uses
 * (`lessonHistory` + `userProfile.totalXp`), so the Arabic Lab adds to the
 * learner's existing streak/level instead of fragmenting progress into a
 * parallel economy. Stroke scores and mastered vocabulary live in the
 * dedicated `arabicLabProgress` record.
 */

import { db } from '@/lib/db';
import { evaluateStreak } from '@/lib/learning/xp-engine';
import { localDayKey } from '@/lib/time/day';
import type { FeedbackLanguage } from '@/lib/i18n/language';
import type { ArabicLabLesson, ArabicLabProgress, LetterForm } from './types';

export const ARABIC_LAB_PROGRESS_ID = 'default_user';

/** `${letterId}:${form}` — the key used for best-score tracking. */
export function strokeScoreKey(letterId: string, form: LetterForm): string {
  return `${letterId}:${form}`;
}

export function emptyArabicLabProgress(): ArabicLabProgress {
  return {
    id: ARABIC_LAB_PROGRESS_ID,
    completedLessonIds: [],
    masteredEntryIds: [],
    strokeScores: {},
    updatedAt: new Date(0).toISOString(),
  };
}

export async function loadArabicLabProgress(): Promise<ArabicLabProgress> {
  try {
    const record = await db.arabicLabProgress.get(ARABIC_LAB_PROGRESS_ID);
    return record ?? emptyArabicLabProgress();
  } catch (error) {
    console.warn('Arabic Lab progress is unavailable:', error);
    return emptyArabicLabProgress();
  }
}

async function persist(
  patch: (current: ArabicLabProgress) => ArabicLabProgress
): Promise<ArabicLabProgress> {
  const current = await loadArabicLabProgress();
  const next: ArabicLabProgress = {
    ...patch(current),
    id: ARABIC_LAB_PROGRESS_ID,
    updatedAt: new Date().toISOString(),
  };
  try {
    await db.arabicLabProgress.put(next);
  } catch (error) {
    console.warn('Could not persist Arabic Lab progress:', error);
  }
  return next;
}

export interface ArabicLabLessonResult {
  progress: ArabicLabProgress;
  xpEarned: number;
  totalXp: number;
  streakCount: number;
}

/**
 * Records a finished lesson: history row, XP scaled by accuracy, streak roll-over.
 */
export async function recordLessonCompletion(
  lesson: ArabicLabLesson,
  score: number
): Promise<ArabicLabLessonResult> {
  const accuracy = Math.max(0, Math.min(100, Math.round(score)));
  const xpEarned = Math.round((lesson.xpReward * accuracy) / 100);

  const progress = await persist((current) => ({
    ...current,
    completedLessonIds: current.completedLessonIds.includes(lesson.id)
      ? current.completedLessonIds
      : [...current.completedLessonIds, lesson.id],
  }));

  let totalXp = 0;
  let streakCount = 1;

  try {
    await db.lessonHistory.put({
      lessonId: lesson.id,
      score: accuracy,
      xpEarned,
      completedAt: new Date().toISOString(),
    });

    const profile = await db.userProfile.get(ARABIC_LAB_PROGRESS_ID);
    if (profile) {
      const streakEval = evaluateStreak(profile.lastActiveDate, profile.streakCount);
      totalXp = profile.totalXp + xpEarned;
      streakCount = streakEval.newStreak;
      await db.userProfile.update(ARABIC_LAB_PROGRESS_ID, {
        totalXp,
        streakCount,
        lastActiveDate: localDayKey(),
      });
    }
  } catch (error) {
    console.warn('Could not record the Arabic Lab lesson:', error);
  }

  return { progress, xpEarned, totalXp, streakCount };
}

/** Stores the best tracing score for a letter form. */
export async function recordStrokeScore(
  letterId: string,
  form: LetterForm,
  score: number
): Promise<ArabicLabProgress> {
  const key = strokeScoreKey(letterId, form);
  const rounded = Math.max(0, Math.min(100, Math.round(score)));
  return persist((current) => {
    const previous = current.strokeScores[key] ?? 0;
    if (previous >= rounded) return current;
    return { ...current, strokeScores: { ...current.strokeScores, [key]: rounded } };
  });
}

/** Marks vocabulary as owned once an activity featuring it is answered correctly. */
export async function recordMasteredEntries(entryIds: readonly string[]): Promise<ArabicLabProgress> {
  if (entryIds.length === 0) return loadArabicLabProgress();
  return persist((current) => {
    const missing = entryIds.filter((id) => !current.masteredEntryIds.includes(id));
    if (missing.length === 0) return current;
    return { ...current, masteredEntryIds: [...current.masteredEntryIds, ...missing] };
  });
}

/** Writes the shared bilingual feedback preference (same field Settings edits). */
export async function saveFeedbackLanguage(language: FeedbackLanguage): Promise<void> {
  try {
    await db.userProfile.update(ARABIC_LAB_PROGRESS_ID, { aiFeedbackLanguage: language });
  } catch (error) {
    console.warn('Could not save the feedback language preference:', error);
  }
}
