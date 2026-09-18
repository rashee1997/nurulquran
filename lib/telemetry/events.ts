import { db, type ActivityEvent } from '@/lib/db';
import { localDayKey } from '@/lib/time/day';

/**
 * Local activity ledger.
 *
 * `track` appends one row to the `events` table. Nothing is sent anywhere: the ledger
 * exists so the dashboard, heatmap, goals and streak logic can be derived from what the
 * learner actually did, and so a learner who exports a backup can see every row.
 *
 * Writes are fire-and-forget. A failing write must never break the learning flow that
 * emitted it, so errors are logged and swallowed.
 */

export type EventName =
  | 'reader.position_saved'
  | 'reader.offline_hit'
  | 'reader.offline_miss'
  | 'dashboard.continue_clicked'
  | 'bookmark.created'
  | 'bookmark.removed'
  | 'note.saved'
  | 'review.graded'
  | 'review.empty_state_shown'
  | 'memorize.drill_started'
  | 'memorize.graded'
  | 'lesson.completed'
  | 'game.completed'
  | 'planner.sabaq_allocated'
  | 'planner.marked'
  | 'audio.completed'
  | 'audio.word_repeat'
  | 'search.opened'
  | 'search.query'
  | 'search.no_results'
  | 'pwa.installed'
  | 'download.completed'
  | 'download.removed'
  | 'streak.freeze_used'
  | 'streak.freeze_granted'
  | 'recite.session'
  | 'recite.mistake'
  | 'goal.created'
  | 'goal.pace_bumped'
  | 'goal.deadline_created'
  | 'goal.completed_by_deadline'
  | 'goal.extend_or_archived'
  | 'mistakes.page_viewed'
  | 'mistakes.verse_jump'
  | 'mistakes.priority_review_graded'
  | 'palette.action'
  | 'recite.replay_played'
  | 'recite.replay_compared_qari'
  | 'recite.replay_saved'
  | 'reminder.enabled'
  | 'locale.changed';

export type EventProps = Record<string, string | number | boolean>;

const MAX_EVENTS = 20_000;
let pruneScheduled = false;

/** Appends an event to the local ledger. Never throws. */
export function track(name: EventName, props?: EventProps): void {
  if (typeof window === 'undefined') return;
  const now = new Date();
  const row: ActivityEvent = { name, at: now.toISOString(), day: localDayKey(now), props };
  db.events
    .add(row)
    .then(() => schedulePrune())
    .catch((error: unknown) => {
      console.warn(`Event "${name}" could not be recorded:`, error);
    });
}

/** Keeps the ledger bounded so a years-old install does not grow without limit. */
function schedulePrune(): void {
  if (pruneScheduled) return;
  pruneScheduled = true;
  setTimeout(() => {
    pruneScheduled = false;
    db.events
      .count()
      .then(async (count) => {
        if (count <= MAX_EVENTS) return;
        const excess = count - MAX_EVENTS;
        const oldest = await db.events.orderBy('id').limit(excess).primaryKeys();
        await db.events.bulkDelete(oldest);
      })
      .catch(() => undefined);
  }, 5_000);
}

/** Events for a local day, oldest first. */
export async function eventsForDay(day: string): Promise<ActivityEvent[]> {
  return db.events.where('day').equals(day).toArray();
}

/** Count of events per local day between two keys (inclusive), for heatmaps. */
export async function dailyCounts(fromDay: string, toDay: string): Promise<Record<string, number>> {
  const rows = await db.events.where('day').between(fromDay, toDay, true, true).toArray();
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.day] = (counts[row.day] ?? 0) + 1;
  }
  return counts;
}
