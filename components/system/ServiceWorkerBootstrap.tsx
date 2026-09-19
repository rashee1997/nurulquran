'use client';

import { useEffect } from 'react';
import { registerServiceWorker } from '@/lib/pwa/register';
import { track } from '@/lib/telemetry/events';
import { checkAndFireReminder } from '@/lib/learning/reminders';

/**
 * Registers the service worker once, after the page has settled. Rendered once from the
 * root layout; it renders nothing.
 */
export function ServiceWorkerBootstrap(): null {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const register = () => void registerServiceWorker();
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    const onInstalled = () => track('pwa.installed');
    window.addEventListener('appinstalled', onInstalled);

    // The reminder check is best-effort and must never surface as an unhandled rejection on the
    // app's very first effect, which is what an unguarded floating promise would do.
    const checkReminder = () => void checkAndFireReminder().catch(() => undefined);

    checkReminder();
    const reminderInterval = setInterval(checkReminder, 30 * 60 * 1000);

    return () => {
      // `{ once: true }` only detaches the listener *after* it fires. If this component unmounts
      // before `load` — a client-side remount, or the development double-mount — the pending
      // listener stayed registered for the rest of the session, and every later `load` event
      // re-registered the service worker.
      window.removeEventListener('load', register);
      window.removeEventListener('appinstalled', onInstalled);
      clearInterval(reminderInterval);
    };
  }, []);

  return null;
}
