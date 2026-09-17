'use client';

import React, { useCallback, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { BookMarked, GraduationCap, Library, Sparkles } from 'lucide-react';
import { TafsirReaderViewport } from './TafsirReaderViewport';
import { TafsirNavigator } from './TafsirNavigator';
import { GeminiLiveStorytellerBar } from './GeminiLiveStorytellerBar';
import { InteractiveReflectionBlock } from './InteractiveReflectionBlock';
import { useTafsirLesson } from '@/hooks/use-tafsir-lesson';
import { useGeminiLiveTafsir } from '@/hooks/use-gemini-live-tafsir';
import type { LessonVerse } from '@/lib/tafsir/lesson';
import type { TafsirLanguage } from '@/lib/tafsir/types';

interface TafsirLessonShellProps {
  verse: LessonVerse;
  voiceId?: string;
}

const LANGUAGE_STORAGE_KEY = 'tafsir-language';
/** Notifies this tab's own subscribers; the `storage` event only fires in other tabs. */
const LANGUAGE_CHANGE_EVENT = 'tafsir-language-change';

function isTafsirLanguage(value: string | null): value is TafsirLanguage {
  return value === 'en' || value === 'ta';
}

/**
 * Subscribes to the saved language preference.
 *
 * Mirrors `hooks/use-theme`: reading storage through `useSyncExternalStore` gives the server
 * a definite snapshot (English) and swaps to the stored value only after hydration, so the
 * first paint cannot mismatch — and no effect has to call `setState`, which would be a
 * cascading render on every mount.
 */
function subscribeToLanguage(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', callback);
  window.addEventListener(LANGUAGE_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(LANGUAGE_CHANGE_EVENT, callback);
  };
}

function getLanguageSnapshot(): TafsirLanguage {
  if (typeof window === 'undefined') return 'en';
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isTafsirLanguage(stored) ? stored : 'en';
  } catch {
    // Storage can be blocked entirely (private mode, hardened settings); English is a safe
    // default and nothing else depends on persistence.
    return 'en';
  }
}

function getLanguageServerSnapshot(): TafsirLanguage {
  return 'en';
}

/**
 * Client root of a Tafseer lesson.
 *
 * It exists so that exactly one Live session and one lesson load exist per page: both hooks
 * are called here and their results are passed *down* as props. Mounting the storyteller hook
 * inside the audio bar would give the language toggle and the reflection block their own
 * copies of the session, and therefore their own microphones.
 *
 * The Server Component above this one resolves the verified Arabic verse and passes only the
 * serialisable fields; the exegesis itself is loaded here, cache-first, so a second visit to
 * a chapter needs no network at all.
 */
export const TafsirLessonShell: React.FC<TafsirLessonShellProps> = ({ verse, voiceId }) => {
  const language = useSyncExternalStore(
    subscribeToLanguage,
    getLanguageSnapshot,
    getLanguageServerSnapshot
  );

  const changeLanguage = useCallback((next: TafsirLanguage): void => {
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      /* storage unavailable — the choice simply does not persist */
    }
    window.dispatchEvent(new CustomEvent(LANGUAGE_CHANGE_EVENT, { detail: next }));
  }, []);

  const { segment, failedEditions, state, error, reload } = useTafsirLesson(verse);

  const live = useGeminiLiveTafsir({
    segment,
    language,
    voiceId,
  });

  // The session reads the lesson context through a ref, so a context that changes mid-session
  // is picked up without tearing the connection down.
  const lessonReady = segment !== null;
  const isLoading = state === 'loading' || state === 'idle';

  return (
    <div id="tafsir-lesson" className="flex flex-col gap-6">
      <header className="relative overflow-hidden rounded-3xl bg-hero-bg text-hero-fg border border-hero-border p-5 sm:p-7 shadow-lg">
        <div className="absolute inset-0 opacity-10 bg-pattern-dots" aria-hidden="true" />

        <div className="relative z-10 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-hero-pill-bg text-hero-pill-fg text-[11px] font-bold">
              <BookMarked className="w-3 h-3" aria-hidden="true" />
              <span>Tafseer lesson</span>
            </div>

            <Link
              href="/lessons/tafsir"
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-hero-muted hover:text-hero-fg transition-colors"
            >
              <Library className="w-3 h-3" aria-hidden="true" />
              <span>All lessons</span>
            </Link>
          </div>

          <div className="space-y-1.5">
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              {verse.surahNameSimple}
              <span className="text-hero-muted font-semibold ml-2 text-base">
                {verse.surah}:{verse.ayah}
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-hero-muted max-w-2xl leading-relaxed">
              Read the verified Arabic verse, then the English and Tamil commentary. Ask Ustadh
              Ameen to tell you the story behind it, and tell him what you understood.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-hero-muted">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-hero-card-bg border border-hero-border backdrop-blur-xs">
              <GraduationCap className="w-3 h-3" aria-hidden="true" />
              Storyteller mode for young learners
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-hero-card-bg border border-hero-border backdrop-blur-xs">
              <Sparkles className="w-3 h-3" aria-hidden="true" />
              {segment?.asbab ? 'Occasion of revelation available' : 'Theme-based teaching'}
            </span>
          </div>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-destructive-subtle px-4 py-3 text-xs font-medium text-destructive-strong"
        >
          <span>{error.message}</span>
          {error.retryable && (
            <button
              type="button"
              onClick={reload}
              className="px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground font-bold transition-opacity hover:opacity-90"
            >
              Retry commentary
            </button>
          )}
        </div>
      )}

      <TafsirReaderViewport
        segment={segment}
        language={language}
        onLanguageChange={changeLanguage}
        loading={isLoading}
        failedEditions={failedEditions}
      />

      <GeminiLiveStorytellerBar live={live} lessonReady={lessonReady} language={language} />

      <TafsirNavigator
        surah={verse.surah}
        ayah={verse.ayah}
        versesCount={verse.versesCount}
        surahNameSimple={verse.surahNameSimple}
      />

      <InteractiveReflectionBlock
        surah={verse.surah}
        ayah={verse.ayah}
        surahNameSimple={verse.surahNameSimple}
        language={language}
        lessonReady={lessonReady}
      />
    </div>
  );
};
