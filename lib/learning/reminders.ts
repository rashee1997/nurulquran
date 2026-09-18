import { db } from '@/lib/db';
import { localDayKey } from '@/lib/time/day';
import { track } from '@/lib/telemetry/events';

const LAST_NOTIFIED_KEY = 'nurulquran:reminder:last-notified-day';

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.permission;
}

/** Asks the browser for notification permission and, if granted, saves the reminder hour. */
export async function enableReminder(hour: number): Promise<boolean> {
  if (!notificationsSupported()) return false;
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return false;
  await db.userProfile.update('default_user', { reminderHour: hour });
  track('reminder.enabled', { hour });
  return true;
}

export async function disableReminder(): Promise<void> {
  await db.userProfile.update('default_user', { reminderHour: undefined });
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
  if (localStorage.getItem(LAST_NOTIFIED_KEY) === today) return;

  const todaysEvents = await db.events.where('day').equals(today).count();
  if (todaysEvents > 0) return;

  new Notification('NurulQuran', {
    body: "You haven't practised today yet. A few ayahs keep the streak alive.",
    icon: '/icons/icon-192.png',
    tag: 'daily-practice-reminder',
  });
  localStorage.setItem(LAST_NOTIFIED_KEY, today);
}
