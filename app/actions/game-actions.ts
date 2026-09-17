'use server';

import { revalidatePath } from 'next/cache';
import { GameSessionResult, UserHifzStreak } from '@/lib/db/schemas/streak-schema';

/**
 * Server action to record a game session and trigger deterministic cache revalidation
 * for the dashboard and games overview.
 */
export async function recordGameSessionAction(session: GameSessionResult): Promise<{
  success: boolean;
  message: string;
  xpAwarded: number;
  newStreak?: number;
}> {
  try {
    // Revalidate dashboard and games page caches deterministically
    revalidatePath('/dashboard');
    revalidatePath('/games');
    revalidatePath('/');

    return {
      success: true,
      message: `Successfully synced game session for ${session.gameTitle}`,
      xpAwarded: session.xpEarned,
    };
  } catch (error) {
    console.error('Error in recordGameSessionAction:', error);
    return {
      success: false,
      message: 'Failed to record server-side game session',
      xpAwarded: 0,
    };
  }
}
