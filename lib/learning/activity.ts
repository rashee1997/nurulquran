import { db, type UserProfile } from '@/lib/db';
import { localDayDelta, localDayKey } from '@/lib/time/day';
import { track, type EventName, type EventProps } from '@/lib/telemetry/events';

/**
 * The one place that awards XP and advances the streak.
 *
 * Four screens (memorisation modes, the review queue, lesson completion and the games)
 * each carried their own copy of this logic and they had drifted: one of them treated a
 * missing streak as 1, another reset it, and none of them agreed on what a "same day"
 * replay should do. Every activity now goes through `recordActivity`, so the rules below
 * hold everywhere:
 *
 *  - XP is additive and never negative.
 *  - The streak advances at most once per local calendar day.
 *  - A single missed day is forgiven when the learner holds a freeze token; the token is
 *    spent and the streak continues. Two or more missed days reset it.
 *  - One freeze token is granted per seven-day streak milestone, capped at `MAX_FREEZES`.
 */

export const MAX_FREEZES = 3;
export const FREEZE_GRANT_EVERY_DAYS = 7;

export interface ActivityInput {
  /** XP to add; 0 is allowed for activities that only count toward the streak. */
  xp: number;
  /** Ledger event to write alongside the profile update. */
  event: EventName;
  props?: EventProps;
}

export interface ActivityOutcome {
  profile: UserProfile | null;
  streakStatus: 'maintained' | 'incremented' | 'reset' | 'frozen';
  freezeGranted: boolean;
}

/**
 * Pure streak transition, exported for the dashboard and for tests.
 * `freezes` is the number of tokens available before this evaluation.
 */
export function advanceStreak(
  lastActiveDate: string | undefined,
  currentStreak: number,
  freezes: number,
  today: string = localDayKey()
): { streak: number; freezes: number; status: ActivityOutcome['streakStatus'] } {
  const safeStreak = Math.max(0, currentStreak);
  if (!lastActiveDate) {
    return { streak: Math.max(1, safeStreak), freezes, status: 'incremented' };
  }
  const elapsed = localDayDelta(lastActiveDate, today);
  if (elapsed <= 0) {
    return { streak: Math.max(1, safeStreak), freezes, status: 'maintained' };
  }
  if (elapsed === 1) {
    return { streak: safeStreak + 1, freezes, status: 'incremented' };
  }
  if (elapsed === 2 && freezes > 0) {
    // Exactly one day was missed and a token covers it.
    return { streak: safeStreak + 1, freezes: freezes - 1, status: 'frozen' };
  }
  return { streak: 1, freezes, status: 'reset' };
}

/** Records an activity: XP, streak, freeze tokens and the ledger row. */
export async function recordActivity(input: ActivityInput): Promise<ActivityOutcome> {
  const xp = Math.max(0, Math.round(input.xp));
  track(input.event, { ...(input.props ?? {}), xp });

  if (typeof window === 'undefined') {
    return { profile: null, streakStatus: 'maintained', freezeGranted: false };
  }

  try {
    return await db.transaction('rw', db.userProfile, async () => {
      const profile = await db.userProfile.get('default_user');
      if (!profile) {
        return { profile: null, streakStatus: 'maintained' as const, freezeGranted: false };
      }

      const today = localDayKey();
      const transition = advanceStreak(
        profile.lastActiveDate,
        profile.streakCount,
        profile.streakFreezes ?? 0,
        today
      );

      let freezes = transition.freezes;
      let freezeGranted = false;
      if (
        transition.status === 'incremented' &&
        transition.streak > 0 &&
        transition.streak % FREEZE_GRANT_EVERY_DAYS === 0 &&
        freezes < MAX_FREEZES &&
        profile.lastFreezeGrantedAt !== today
      ) {
        freezes += 1;
        freezeGranted = true;
      }

      const patch: Partial<UserProfile> = {
        totalXp: profile.totalXp + xp,
        streakCount: transition.streak,
        lastActiveDate: today,
        streakFreezes: freezes,
        ...(freezeGranted ? { lastFreezeGrantedAt: today } : {}),
      };
      await db.userProfile.update('default_user', patch);

      if (transition.status === 'frozen') track('streak.freeze_used', { streak: transition.streak });
      if (freezeGranted) track('streak.freeze_granted', { streak: transition.streak, freezes });

      return {
        profile: { ...profile, ...patch },
        streakStatus: transition.status,
        freezeGranted,
      };
    });
  } catch (error: unknown) {
    console.error('Activity could not be recorded:', error);
    return { profile: null, streakStatus: 'maintained', freezeGranted: false };
  }
}

/**
 * Whether the streak is at risk today: the learner has not practised yet and it is
 * past their reminder hour. Used by the in-app reminder banner.
 */
export function isStreakAtRisk(profile: UserProfile | null | undefined, now: Date = new Date()): boolean {
  if (!profile) return false;
  const today = localDayKey(now);
  if (profile.lastActiveDate === today) return false;
  if (profile.reminderHour === undefined) return false;
  return now.getHours() >= profile.reminderHour;
}
