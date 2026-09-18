import { db, HifzGoalCadence, HifzGoalKind, HifzGoalRecord } from '@/lib/db';
import { localDayKey, parseLocalDayKey } from '@/lib/time/day';
import { track } from '@/lib/telemetry/events';
import type { EventName } from '@/lib/telemetry/events';

/** Which ledger event counts toward each goal kind. Each event stands for roughly one ayah. */
const EVENT_FOR_KIND: Record<HifzGoalKind, EventName> = {
  memorize: 'memorize.graded',
  review: 'review.graded',
  read: 'reader.position_saved',
};

export function listActiveGoals(): Promise<HifzGoalRecord[]> {
  return db.hifzGoals.filter((g) => !g.archived).toArray();
}

export async function createGoal(input: {
  kind: HifzGoalKind;
  cadence: HifzGoalCadence;
  weekday?: number;
  surah?: number;
  targetAyahs: number;
}): Promise<HifzGoalRecord> {
  const goal: HifzGoalRecord = {
    id: `goal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: input.kind,
    cadence: input.cadence,
    weekday: input.cadence === 'weekly' ? input.weekday : undefined,
    surah: input.surah,
    targetAyahs: Math.max(1, Math.round(input.targetAyahs)),
    createdAt: new Date().toISOString(),
  };
  await db.hifzGoals.put(goal);
  track('goal.created', { kind: goal.kind, cadence: goal.cadence, target: goal.targetAyahs });
  return goal;
}

export async function archiveGoal(id: string): Promise<void> {
  await db.hifzGoals.update(id, { archived: true });
}

export async function deleteGoal(id: string): Promise<void> {
  await db.hifzGoals.delete(id);
}

/** Start of the current period (today for daily goals, this week's Sunday for weekly ones). */
function periodStart(cadence: HifzGoalCadence, now: Date): string {
  if (cadence === 'daily') return localDayKey(now);
  const sunday = new Date(now);
  sunday.setDate(sunday.getDate() - sunday.getDay());
  return localDayKey(sunday);
}

export interface GoalProgress {
  goal: HifzGoalRecord;
  done: number;
  isComplete: boolean;
}

/**
 * Counts ledger events of the goal's kind within the current period as a proxy for ayahs
 * completed — each `memorize.graded` / `review.graded` / `reader.position_saved` event
 * represents roughly one ayah acted on, so this is an approximation, not an exact count.
 */
export async function computeGoalProgress(goals: HifzGoalRecord[], now: Date = new Date()): Promise<GoalProgress[]> {
  const results: GoalProgress[] = [];
  for (const goal of goals) {
    const from = periodStart(goal.cadence, now);
    const to = localDayKey(now);
    const rows = await db.events.where('day').between(from, to, true, true).toArray();
    const eventName = EVENT_FOR_KIND[goal.kind];
    const done = rows.filter((r) => r.name === eventName).length;
    results.push({ goal, done, isComplete: done >= goal.targetAyahs });
  }
  return results;
}

export function goalLabel(goal: HifzGoalRecord): string {
  const verb = goal.kind === 'memorize' ? 'Memorize' : goal.kind === 'review' ? 'Review' : 'Read';
  const period = goal.cadence === 'daily' ? 'day' : 'week';
  return `${verb} ${goal.targetAyahs} ayahs / ${period}`;
}

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function isDueToday(goal: HifzGoalRecord, now: Date = new Date()): boolean {
  if (goal.cadence === 'daily') return true;
  return goal.weekday === undefined || goal.weekday === now.getDay();
}

export { parseLocalDayKey };
