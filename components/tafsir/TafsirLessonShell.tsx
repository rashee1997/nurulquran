'use client';

import React from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { BookMarked, GraduationCap, Library, Sparkles } from 'lucide-react';
import { TafsirReaderViewport } from './TafsirReaderViewport';
import { TafsirNavigator } from './TafsirNavigator';
import { GeminiLiveStorytellerBar } from './GeminiLiveStorytellerBar';
import { InteractiveReflectionBlock } from './InteractiveReflectionBlock';
import { useTafsirLesson } from '@/hooks/use-tafsir-lesson';
import { useTafsirView } from '@/hooks/use-tafsir-view';
import { useGeminiLiveTafsir } from '@/hooks/use-gemini-live-tafsir';
import type { LessonVerse } from '@/lib/tafsir/lesson';

interface TafsirLessonShellProps {
  verse: LessonVerse;
  voiceId?: string;
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
  /**
   * The saved reading view is shared with the in-reader dialog (`hooks/use-tafsir-view`), so a
   * child who chose Tamil while tapping an ayah in the reader gets Tamil in the full lesson
   * too. `language` is the single register the Live storyteller speaks and a reflection is
   * graded in; `view` may additionally be bilingual.
   */
  const { view, setView, language } = useTafsirView();

  const { segment, failedEditions, state, error, reload } = useTafsirLesson(verse);

  /**
   * Reuse the learner's saved Tajweed teacher voice so the tafsir storyteller sounds like the
   * rest of the app. Read live from IndexedDB; an explicit `voiceId` prop still wins.
   */
  const savedVoiceId = useLiveQuery(
    async () => (await db.userProfile.get('default_user'))?.aiVoiceId ?? null,
    []
  );

  /*
   * The loaded commentary only counts when it describes the verse on screen — the same identity
   * gate the in-reader dialog applies.
   *
   * `useTafsirLesson` deliberately keeps the previous segment while the next one resolves, so
   * stepping to a neighbouring ayah of a warm chapter swaps in a single commit instead of
   * flickering. On this page that also covered a full chapter change, where `state` is not reset
   * to 'loading' either: the page rendered the previous lesson's Arabic, translations and
   * commentary under the new verse's header, with "Tell me the story" and the reflection box
   * enabled against a verse whose commentary was not on screen. Neighbouring ayahs still swap
   * without a skeleton (their segment matches immediately); a mismatched segment now shows it.
   */
  const describesThisAyah =
    segment !== null && segment.surah === verse.surah && segment.ayah === verse.ayah;
  const displaySegment = describesThisAyah ? segment : null;
  const isLoading = !describesThisAyah && state !== 'error';

  // The session reads the lesson context through a ref, so a context that changes mid-session
  // is picked up without tearing the connection down. It is primed with the *displayed* segment,
  // never the raw one, so Ameen cannot narrate the previous verse during a transition.
  const lessonReady = displaySegment !== null;

  const live = useGeminiLiveTafsir({
    segment: displaySegment,
    language,
    // `||` rather than `??`: an empty saved voice would otherwise be sent as an empty voice
    // name, which the server quietly replaces with a default.
    voiceId: voiceId || savedVoiceId || undefined,
  });

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
              {displaySegment?.asbab ? 'Occasion of revelation available' : 'Theme-based teaching'}
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
        segment={displaySegment}
        view={view}
        onViewChange={setView}
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
