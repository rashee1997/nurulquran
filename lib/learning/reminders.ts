import { db } from '@/lib/db';
import { localDayKey } from '@/lib/time/day';
import { track } from '@/lib/telemetry/events';

const LAST_NOTIFIED_KEY = 'nurulquran:reminder:last-notified-day';

/**
 * `localStorage` is not always reachable.
 *
 * Safari private mode, hardened privacy settings and some embedded webviews make the accessor
 * itself throw a `SecurityError`. This module runs on every app load from
 * `ServiceWorkerBootstrap`, so an unguarded read here rejected the whole call and surfaced as an
 * unhandled rejection before the learner had done anything. The stored day is only an
 * at-most-once optimisation, so losing it degrades to "the reminder may fire again today"
 * rather than to a broken page. `lib/tafsir`-style guards are used for the same reason.
 */
function lastNotifiedDay(): string | null {
  try {
    return window.localStorage.getItem(LAST_NOTIFIED_KEY);
  } catch {
    return null;
  }
}

function rememberNotifiedDay(day: string): void {
  try {
    window.localStorage.setItem(LAST_NOTIFIED_KEY, day);
  } catch {
    /* storage unavailable — the reminder may fire once more today */
  }
}

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * Asks the browser for notification permission and, if granted, saves the reminder hour.
 *
 * Returns `false` when the hour could not be persisted. `db.userProfile.update` matches zero
 * rows when the profile has not been seeded yet and reports no error, so the previous version
 * returned `true` — telling the learner their reminder was set — while nothing had been
 * written. The row is checked explicitly for that reason.
 */
export async function enableReminder(hour: number): Promise<boolean> {
  if (!notificationsSupported()) return false;
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return false;

  try {
    const profile = await db.userProfile.get('default_user');
    if (!profile) return false;
    await db.userProfile.update('default_user', { reminderHour: hour });
  } catch (error: unknown) {
    console.warn('Reminder hour could not be saved:', error);
    return false;
  }

  track('reminder.enabled', { hour });
  return true;
}

export async function disableReminder(): Promise<void> {
  try {
    await db.userProfile.update('default_user', { reminderHour: undefined });
  } catch (error: unknown) {
    console.warn('Reminder could not be disabled:', error);
  }
}

/**
 * Best-effort local reminder: no push server exists, so this only fires while the app is
 * open (or briefly backgrounded) in a tab — checked once per app load, and again on an
 * interval — never as a true background notification. It fires at most once a day, only
 * once the reminder hour has passed and the ledger shows nothing logged yet today.
 */
export async function checkAndFireReminder(): Promise<void> {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;

  const profile = await db.userProfile.get('default_user');
  const hour = profile?.reminderHour;
  if (hour === undefined) return;

  const now = new Date();
  if (now.getHours() < hour) return;

  const today = localDayKey(now);
  if (lastNotifiedDay() === today) return;

  const todaysEvents = await db.events.where('day').equals(today).count();
  if (todaysEvents > 0) return;

  /*
   * `new Notification(...)` is not universally constructible. Android Chrome throws
   * `TypeError: Illegal constructor` — there, notifications are only available through a service
   * worker registration — and the throw would have propagated out of this function and surfaced
   * as an unhandled rejection on every app load. It is also not enough for the constructor to
   * not throw: the day is only marked as notified once a notification was actually shown, so a
   * platform that cannot show one does not silently consume the learner's reminder for the day.
   */
  try {
    new Notification('NurulQuran', {
      body: "You haven't practised today yet. A few ayahs keep the streak alive.",
      icon: '/icons/icon-192.png',
      tag: 'daily-practice-reminder',
    });
  } catch (error: unknown) {
    console.warn('A local reminder could not be displayed on this platform:', error);
    return;
  }

  rememberNotifiedDay(today);
}
