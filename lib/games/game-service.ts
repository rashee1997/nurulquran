import { db, UserProfile } from '../db';
import { GameSessionResult } from '../db/schemas/streak-schema';
import { evaluateStreak } from '../learning/xp-engine';
import { localDayKey, localDayDelta } from '../time/day';
import { recordGameSessionAction } from '@/app/actions/game-actions';

/**
 * Handles end-of-game persistence across Dexie IndexedDB and Next.js Server Actions.
 */
export async function persistGameCompletion(session: GameSessionResult): Promise<UserProfile | null> {
  if (typeof window === 'undefined') return null;

  try {
    // 1. Save session in Dexie
    await db.gameSessions.put(session);

    // 2. Fetch user profile and update XP and streak
    const profile = await db.userProfile.get('default_user');
    if (profile) {
      // One streak implementation for the whole app. This used to re-derive the
      // day difference with UTC-parsed dates, so a game finished late in the
      // evening (UTC+ offsets) could be counted as a missed day and reset the
      // learner's streak even though they had already practised that day.
      const today = localDayKey();
      const lastActive = profile.lastActiveDate;
      const streakEval = lastActive
        ? evaluateStreak(lastActive, profile.streakCount || 1)
        : { newStreak: profile.streakCount || 1 };

      // A session replayed on the same local day must not inflate the streak.
      const isSameDay = Boolean(lastActive) && localDayDelta(lastActive, today) === 0;

      const updatedProfile: UserProfile = {
        ...profile,
        totalXp: (profile.totalXp || 0) + Math.max(0, session.xpEarned),
        streakCount: isSameDay ? profile.streakCount || 1 : streakEval.newStreak,
        lastActiveDate: today,
      };

      await db.userProfile.put(updatedProfile);

      // 3. Trigger Server Action for cache revalidation
      recordGameSessionAction(session).catch((err) => {
        console.warn('Server action sync warning:', err);
      });

      // 4. Dispatch client event for immediate reactive state update
      window.dispatchEvent(new CustomEvent('quran-game-completed', { detail: session }));

      return updatedProfile;
    }
  } catch (err) {
    console.error('Failed to persist game session:', err);
  }

  return null;
}

export async function getGameSessions(): Promise<GameSessionResult[]> {
  if (typeof window === 'undefined') return [];
  try {
    return await db.gameSessions.orderBy('timestamp').reverse().toArray();
  } catch {
    return [];
  }
}
