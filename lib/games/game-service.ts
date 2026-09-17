import { db, UserProfile } from '../db';
import { GameSessionResult } from '../db/schemas/streak-schema';
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
      const today = new Date().toISOString().split('T')[0];
      const lastActive = profile.lastActiveDate;
      let newStreak = profile.streakCount || 1;

      if (lastActive) {
        const lastDate = new Date(lastActive);
        const currentDate = new Date(today);
        const diffDays = Math.floor((currentDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
          newStreak += 1;
        } else if (diffDays > 1) {
          // Streak broken unless frozen
          newStreak = 1;
        }
      }

      const updatedProfile: UserProfile = {
        ...profile,
        totalXp: (profile.totalXp || 0) + session.xpEarned,
        streakCount: newStreak,
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
