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

    void checkAndFireReminder();
    const reminderInterval = setInterval(() => void checkAndFireReminder(), 30 * 60 * 1000);

    return () => {
      window.removeEventListener('appinstalled', onInstalled);
      clearInterval(reminderInterval);
    };
  }, []);

  return null;
}
