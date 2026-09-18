import { db, UserProfile } from '../db';
import { GameSessionResult } from '../db/schemas/streak-schema';
import { recordActivity } from '../learning/activity';
import { recordGameSessionAction } from '@/app/actions/game-actions';

/**
 * Handles end-of-game persistence across Dexie IndexedDB and Next.js Server Actions.
 */
export async function persistGameCompletion(session: GameSessionResult): Promise<UserProfile | null> {
  if (typeof window === 'undefined') return null;

  try {
    // 1. Save session in Dexie
    await db.gameSessions.put(session);

    // 2. XP and streak go through the single activity writer shared by every screen.
    const outcome = await recordActivity({
      xp: session.xpEarned,
      event: 'game.completed',
      props: { gameId: session.gameId, surah: session.surahNumber, accuracy: session.accuracy },
    });
    const updatedProfile = outcome.profile;
    if (updatedProfile) {
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
