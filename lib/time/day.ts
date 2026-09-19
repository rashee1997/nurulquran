/**
 * Calendar-day helpers.
 *
 * Streak and "daily activity" logic must use the learner's LOCAL calendar day.
 * Deriving it from `new Date().toISOString().split('T')[0]` yields the UTC date,
 * which rolls over mid-morning for UTC+05:30 / UTC+06:00 learners and mid-evening
 * for learners west of UTC, so two sessions on different local days can be counted
 * as one day (and vice versa).
 */

/** Returns the local calendar day as `YYYY-MM-DD`. */
export function localDayKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Parses a `YYYY-MM-DD` key into a Date at local midnight. */
export function parseLocalDayKey(key: string): Date {
  const [year, month, day] = key.split('-').map((part) => Number.parseInt(part, 10));
  if (year === undefined || month === undefined || day === undefined ||
      !Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return new Date();
  }
  return new Date(year, month - 1, day);
}

/** Shifts a day key by whole calendar days (DST-safe). */
export function shiftLocalDayKey(key: string, days: number): string {
  const date = parseLocalDayKey(key);
  date.setDate(date.getDate() + days);
  return localDayKey(date);
}

/** Whole calendar-day difference between two day keys (b - a). */
export function localDayDelta(fromKey: string, toKey: string): number {
  const from = parseLocalDayKey(fromKey);
  const to = parseLocalDayKey(toKey);
  const msPerDay = 24 * 60 * 60 * 1000;
  // Normalize through UTC midnight of each local day to avoid DST-hour drift.
  const fromUtc = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const toUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((toUtc - fromUtc) / msPerDay);
}
