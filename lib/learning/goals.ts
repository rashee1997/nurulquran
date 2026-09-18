import { db, HifzGoalCadence, HifzGoalKind, HifzGoalRecord } from '@/lib/db';
import { localDayKey, parseLocalDayKey } from '@/lib/time/day';
import { track } from '@/lib/telemetry/events';
import type { EventName } from '@/lib/telemetry/events';
import { SURAHS } from '@/lib/quran/surahs';

/** Which ledger event counts toward each goal kind. Each event stands for roughly one ayah. */
const EVENT_FOR_KIND: Record<HifzGoalKind, EventName> = {
  memorize: 'memorize.graded',
  review: 'review.graded',
  read: 'reader.position_saved',
};

export function listActiveGoals(): Promise<HifzGoalRecord[]> {
  return db.hifzGoals.filter((g) => !g.archived).toArray();
}

/**
 * Creates a goal. When a deadline is supplied the target count is derived from the
 * remaining verses of the goal's scope, so a dated goal like "Juz' 'Amma by 2027-03-01"
 * always carries the exact ayah count it needs — the learner never hand-counts it.
 */
export async function createDeadlineGoal(input: {
  kind: HifzGoalKind;
  /** First surah of the range to complete; defaults to Al-Fatihah. */
  fromSurah: number;
  /** Last surah of the range, inclusive. */
  toSurah: number;
  /** Local day key (YYYY-MM-DD) the goal must be complete by. */
  deadline: string;
}): Promise<HifzGoalRecord> {
  const first = SURAHS.find((s) => s.id === Math.max(1, Math.min(114, input.fromSurah)));
  const last = SURAHS.find((s) => s.id === Math.max(1, Math.min(114, input.toSurah)));
  const from = first?.id ?? 1;
  const to = last?.id ?? from;

  let targetAyahs = 0;
  for (let surah = Math.min(from, to); surah <= Math.max(from, to); surah++) {
    targetAyahs += SURAHS.find((s) => s.id === surah)?.versesCount ?? 0;
  }

  const goal: HifzGoalRecord = {
    id: `goal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: input.kind,
    cadence: 'daily',
    targetAyahs: Math.max(1, targetAyahs),
    deadline: input.deadline,
    createdAt: new Date().toISOString(),
  };
  await db.hifzGoals.put(goal);
  track('goal.created', { kind: goal.kind, cadence: goal.cadence, target: goal.targetAyahs });
  track('goal.deadline_created', { deadline: goal.deadline ?? '', target: goal.targetAyahs });
  return goal;
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
  /** Present only for deadline goals: days remaining, negative when the date has passed. */
  daysRemaining?: number;
  /** Ayahs behind the linear pace needed to hit the deadline (0 or negative when ahead). */
  behindBy?: number;
  /** Ayahs/day required to still make the deadline. */
  requiredPerDay?: number;
}

/**
 * Enriches each goal with its deadline math.
 *
 * For a dated goal the linear expectation is `doneExpected = target × elapsed/total` days,
 * so "behind by N" is exactly the shortfall a learner can act on: bumping the pace by that
 * spread over the remaining days closes the gap. A passed deadline never disappears — the
 * card flips to an extend-or-archive state instead.
 */
export async function computeGoalProgress(goals: HifzGoalRecord[], now: Date = new Date()): Promise<GoalProgress[]> {
  const results: GoalProgress[] = [];
  for (const goal of goals) {
    const from = periodStart(goal.cadence, now);
    const to = localDayKey(now);
    const rows = await db.events.where('day').between(from, to, true, true).toArray();
    const eventName = EVENT_FOR_KIND[goal.kind];
    const done = rows.filter((r) => r.name === eventName).length;
    const isComplete = done >= goal.targetAyahs;

    if (!goal.deadline) {
      results.push({ goal, done, isComplete });
      continue;
    }

    const deadlineDay = parseLocalDayKey(goal.deadline);
    const daysRemaining = Math.ceil((deadlineDay.getTime() - now.getTime()) / 86_400_000);
    const createdDay = parseLocalDayKey(goal.createdAt.slice(0, 10));
    const totalDays = Math.max(1, Math.round((deadlineDay.getTime() - createdDay.getTime()) / 86_400_000));
    const elapsedDays = Math.max(0, totalDays - daysRemaining);
    const doneExpected = Math.ceil((goal.targetAyahs * elapsedDays) / totalDays);
    results.push({
      goal,
      done,
      isComplete,
      daysRemaining,
      behindBy: Math.max(0, doneExpected - done),
      requiredPerDay: daysRemaining > 0 ? Math.max(1, Math.ceil((goal.targetAyahs - done) / daysRemaining)) : undefined,
    });
  }
  return results;
}

/** Bumps the planner pace to close a deadline gap, logging that the prompt converted. */
export async function bumpPlannerPace(ayahsPerDay: number): Promise<void> {
  const pace = Math.max(1, Math.min(100, Math.round(ayahsPerDay)));
  await db.userProfile.update('default_user', { hifzPace: pace });
  track('goal.pace_bumped', { pace });
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
