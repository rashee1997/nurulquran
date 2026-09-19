'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

const THEME_STORAGE_KEY = 'theme';
/** Notifies this tab's own subscribers; the `storage` event only fires in other tabs. */
const THEME_CHANGE_EVENT = 'theme-change';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function mediaQueryList(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(DARK_QUERY);
}

/**
 * Reads the stored preference.
 *
 * `localStorage` is not always readable: Safari private mode, hardened privacy settings and some
 * embedded webviews throw a `SecurityError` from the accessor itself. `useTheme` is rendered by
 * `ThemeToggle` in the root `NavigationHeader`, so an unguarded read took down every page in the
 * app rather than degrading to the system default.
 */
function readStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
  } catch {
    return 'system';
  }
}

/**
 * Subscription for the *preference*, not the resolved appearance.
 *
 * The media-query listener deliberately does not live here. This store's snapshot is the stored
 * string, which an OS appearance change does not alter, so `useSyncExternalStore` compares the
 * new snapshot with the old one, finds them equal and bails out — the listener ran, and the app
 * still ignored a live light/dark switch in `'system'` mode. The OS preference therefore gets its
 * own store below, whose snapshot genuinely changes.
 */
function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', callback);
  window.addEventListener(THEME_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(THEME_CHANGE_EVENT, callback);
  };
}

function getSnapshot(): ThemeMode {
  return readStoredTheme();
}

function getServerSnapshot(): ThemeMode {
  return 'system';
}

/** No-op subscription: the mounted flag only ever moves `false` (server) → `true` (client). */
function subscribeToNothing(): () => void {
  return () => {};
}

function getMountedSnapshot(): boolean {
  return true;
}

function getServerMountedSnapshot(): boolean {
  return false;
}

/** Separate store for the OS appearance, whose snapshot genuinely changes on a live switch. */
function subscribeToSystemDark(callback: () => void): () => void {
  const query = mediaQueryList();
  if (!query) return () => {};
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
}

function getSystemDarkSnapshot(): boolean {
  return mediaQueryList()?.matches ?? false;
}

function getSystemDarkServerSnapshot(): boolean {
  return false;
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const mounted = useSyncExternalStore(subscribeToNothing, getMountedSnapshot, getServerMountedSnapshot);
  const systemDark = useSyncExternalStore(
    subscribeToSystemDark,
    getSystemDarkSnapshot,
    getSystemDarkServerSnapshot
  );

  const resolvedTheme: 'light' | 'dark' = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    if (resolvedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [resolvedTheme]);

  const setTheme = useCallback((newTheme: ThemeMode) => {
    if (typeof window === 'undefined') return;

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch {
      /* storage unavailable — the choice applies now but does not persist */
    }

    const isDark = newTheme === 'system' ? (mediaQueryList()?.matches ?? false) : newTheme === 'dark';
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: newTheme }));
  }, []);

  const toggleTheme = useCallback(() => {
    const next = resolvedTheme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  }, [resolvedTheme, setTheme]);

  return {
    theme,
    resolvedTheme,
    setTheme,
    toggleTheme,
    isDark: resolvedTheme === 'dark',
    mounted,
  };
}
