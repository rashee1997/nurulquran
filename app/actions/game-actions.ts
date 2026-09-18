'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { GameSessionResult } from '@/lib/db/schemas/streak-schema';

/**
 * Server actions are reachable by any client, so the payload is parsed rather than
 * trusted. The previous version accepted a client-shaped object and used its
 * `xpEarned` directly in the response, which meant a hand-crafted POST could report
 * an arbitrary reward back to the UI.
 */
const gameSessionSchema = z.object({
  sessionId: z.string().min(1).max(120),
  gameId: z.enum(['ayah-assembly', 'mutashabihat-radar', 'memory-matrix']),
  gameTitle: z.string().min(1).max(160),
  surahNumber: z.number().int().min(1).max(114),
  surahName: z.string().min(1).max(160),
  ayahNumber: z.number().int().min(1).max(286).optional(),
  accuracy: z.number().min(0).max(100),
  score: z.number().int().min(0).max(1_000_000),
  timeSeconds: z.number().min(0).max(86_400),
  comboMax: z.number().int().min(0).max(10_000),
  xpEarned: z.number().int().min(0).max(10_000),
  timestamp: z.number().int().nonnegative(),
});

export interface GameSessionActionResult {
  success: boolean;
  message: string;
  xpAwarded: number;
}

/**
 * XP is derived on the server from the *validated* performance fields, never echoed back
 * from the client. The previous version returned the client-supplied `xpEarned`, so a
 * hand-crafted POST could report an arbitrary reward into the UI.
 */
function deriveGameXp(session: GameSessionResult): number {
  const accuracyXp = Math.round((session.accuracy / 100) * 60);
  const comboXp = Math.min(30, Math.round(session.comboMax / 5));
  // A small per-second efficiency nudge, capped so marathon sessions cannot farm XP.
  const efficiencyXp = Math.min(10, Math.round(session.score / 500));
  return Math.min(100, accuracyXp + comboXp + efficiencyXp);
}

/**
 * Records a completed game session and deterministically revalidates the surfaces
 * that render session-derived stats.
 */
export async function recordGameSessionAction(
  session: GameSessionResult
): Promise<GameSessionActionResult> {
  const parsed = gameSessionSchema.safeParse(session);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      success: false,
      message: `Rejected game session payload (${issue?.path.join('.') ?? 'body'}: ${
        issue?.message ?? 'invalid'
      }).`,
      xpAwarded: 0,
    };
  }    const validated = parsed.data;
    const xpAwarded = deriveGameXp(validated);

    try {
      revalidatePath('/dashboard');
      revalidatePath('/games');
      revalidatePath('/');

      return {
        success: true,
        message: `Synced ${validated.gameTitle} session (${validated.score} pts, ${validated.accuracy}% accuracy).`,
        xpAwarded,
      };
    } catch (error) {
      console.error('Error in recordGameSessionAction:', error);
      return {
        success: false,
        message: 'Failed to record the game session on the server.',
        xpAwarded: 0,
      };
    }
}
