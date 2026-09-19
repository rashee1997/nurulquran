'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { primaryLanguage } from '@/lib/tafsir/types';
import type { TafsirLanguage, TafsirViewMode } from '@/lib/tafsir/types';

/**
 * The learner's saved Tafseer reading view (English, Tamil, or bilingual).
 *
 * Read through `useSyncExternalStore`, mirroring `hooks/use-theme`: the server gets a definite
 * snapshot and the stored value is swapped in only after hydration, so the first paint cannot
 * mismatch — and no effect has to call `setState`, which would be a cascading render on every
 * mount.
 *
 * It lives in a hook rather than in the lesson shell because two surfaces now need the same
 * preference: the full lesson page and the in-reader dialog. Duplicating the storage key and
 * the change event in both would let them drift apart, and a child who chose Tamil in the
 * reader would silently get English in the lesson.
 */

const VIEW_STORAGE_KEY = 'tafsir-view';
/** The single-language key this replaced; read once so an existing choice is not lost. */
const LEGACY_LANGUAGE_KEY = 'tafsir-language';
/** Notifies this tab's own subscribers; the `storage` event only fires in other tabs. */
const VIEW_CHANGE_EVENT = 'tafsir-view-change';

/** Bilingual: both commentaries are the lesson, and it is the richer default for a new reader. */
const DEFAULT_VIEW: TafsirViewMode = 'bilingual';

function isTafsirView(value: string | null): value is TafsirViewMode {
  return value === 'en' || value === 'ta' || value === 'bilingual';
}

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', callback);
  window.addEventListener(VIEW_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(VIEW_CHANGE_EVENT, callback);
  };
}

function getViewSnapshot(): TafsirViewMode {
  if (typeof window === 'undefined') return DEFAULT_VIEW;
  try {
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (isTafsirView(stored)) return stored;

    const legacy = window.localStorage.getItem(LEGACY_LANGUAGE_KEY);
    if (legacy === 'en' || legacy === 'ta') return legacy;

    return DEFAULT_VIEW;
  } catch {
    // Storage can be blocked entirely (private mode, hardened settings); the default needs no
    // persistence, so this degrades to "the choice does not stick" rather than a crash.
    return DEFAULT_VIEW;
  }
}

function getViewServerSnapshot(): TafsirViewMode {
  return DEFAULT_VIEW;
}

export interface UseTafsirViewResult {
  view: TafsirViewMode;
  setView: (view: TafsirViewMode) => void;
  /** The single language the Live storyteller speaks and a reflection is graded in. */
  language: TafsirLanguage;
}

export function useTafsirView(): UseTafsirViewResult {
  const view = useSyncExternalStore(subscribe, getViewSnapshot, getViewServerSnapshot);

  const setView = useCallback((next: TafsirViewMode): void => {
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      /* storage unavailable — the choice simply does not persist */
    }
    window.dispatchEvent(new CustomEvent(VIEW_CHANGE_EVENT, { detail: next }));
  }, []);

  return { view, setView, language: primaryLanguage(view) };
}
