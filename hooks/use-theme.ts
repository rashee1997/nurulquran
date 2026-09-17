'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

function subscribe(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  window.addEventListener('storage', callback);
  window.addEventListener('theme-change', callback);
  mediaQuery.addEventListener('change', callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener('theme-change', callback);
    mediaQuery.removeEventListener('change', callback);
  };
}

function getSnapshot(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  return (localStorage.getItem('theme') as ThemeMode) || 'system';
}

function getServerSnapshot(): ThemeMode {
  return 'system';
}

function getMountedSnapshot(): boolean {
  return true;
}

function getServerMountedSnapshot(): boolean {
  return false;
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const mounted = useSyncExternalStore(subscribe, getMountedSnapshot, getServerMountedSnapshot);

  const isDarkSystem = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;

  const resolvedTheme: 'light' | 'dark' =
    theme === 'system' ? (isDarkSystem ? 'dark' : 'light') : theme;

  useEffect(() => {
    if (resolvedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [resolvedTheme]);

  const setTheme = useCallback((newTheme: ThemeMode) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme', newTheme);
      const isDark =
        newTheme === 'system'
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
          : newTheme === 'dark';

      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }

      window.dispatchEvent(new CustomEvent('theme-change', { detail: newTheme }));
    }
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

