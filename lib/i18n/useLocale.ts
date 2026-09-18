'use client';

import { useCallback, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { track } from '@/lib/telemetry/events';
import { Locale, translate } from './messages';

/**
 * The app's UI locale (chrome only — nav, dashboard, settings). Reads and writes
 * `profile.uiLocale`, defaulting to English so an unset profile renders exactly as
 * before this feature existed.
 */
export function useLocale(): { locale: Locale; setLocale: (locale: Locale) => Promise<void>; t: (key: string, fallback?: string) => string } {
  const profile = useLiveQuery(() => db.userProfile.get('default_user'));
  const locale: Locale = profile?.uiLocale ?? 'en';

  const setLocale = useCallback(async (next: Locale) => {
    await db.userProfile.update('default_user', { uiLocale: next });
    track('locale.changed', { locale: next });
  }, []);

  const t = useCallback((key: string, fallback?: string) => translate(locale, key, fallback), [locale]);

  return useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
}
