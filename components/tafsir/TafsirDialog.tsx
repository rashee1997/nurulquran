'use client';

import React, { useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, CloudOff, Loader2, X } from 'lucide-react';
import { Modal } from '@/components/system/Modal';
import { TafsirReaderViewport } from './TafsirReaderViewport';
import { GeminiLiveStorytellerBar } from './GeminiLiveStorytellerBar';
import { InteractiveReflectionBlock } from './InteractiveReflectionBlock';
import { useTafsirLesson } from '@/hooks/use-tafsir-lesson';
import { useTafsirView } from '@/hooks/use-tafsir-view';
import { useGeminiLiveTafsir } from '@/hooks/use-gemini-live-tafsir';
import type { LessonVerse } from '@/lib/tafsir/lesson';
import type { Chapter, Verse } from '@/lib/quran/types';

/**
 * In-reader Tafseer storytelling dialog.
 *
 * This is the surface the reader was missing. Every ayah action row previously linked to
 * `/lessons/tafsir/{surah}/{ayah}` — a full route navigation, which unmounted the reader and
 * took the learner's scroll position, the reading-position tracker and the active-ayah
 * highlight with it. Because the commentary now opens *over* the reader instead of instead of
 * it, the reader stays mounted and all of that survives for free; the dialog only has to keep
 * the URL honest.
 *
 * State ownership follows the same rule as `TafsirLessonShell`: the lesson load and the Live
 * session are created once, here, and passed down as props. Mounting `useGeminiLiveTafsir`
 * inside the audio bar would give the reflection field and the viewport their own sessions and
 * therefore their own microphones.
 *
 * The stored view mode is shared with the full lesson page (`hooks/use-tafsir-view`), so the
 * learner's English/Tamil/bilingual choice follows them between the two surfaces.
 */

export interface TafsirDialogProps {
  open: boolean;
  chapter: Chapter;
  /** The reader's already-verified chapter verses; the dialog never re-fetches scripture. */
  verses: Verse[];
  /** Ayah currently shown in the dialog, or null when it is closed. */
  ayah: number | null;
  /** Step to a neighbouring ayah in place, without leaving the reader. */
  onNavigate: (ayah: number) => void;
  onClose: () => void;
  /** Explicit voice override; the learner's saved voice is used when absent. */
  voiceId?: string;
}

/** A swipe of at least this many pixels on the handle dismisses the sheet. */
const SWIPE_DISMISS_PX = 72;

export const TafsirDialog: React.FC<TafsirDialogProps> = ({
  open,
  chapter,
  verses,
  ayah,
  onNavigate,
  onClose,
  voiceId,
}) => {
  const verse = useMemo(
    () => (ayah === null ? null : (verses.find((candidate) => candidate.ayah === ayah) ?? null)),
    [ayah, verses]
  );

  /*
   * Only the serialisable fields the lesson module declares cross into it. Building the
   * payload from the reader's own verified verses means opening commentary for an ayah costs
   * no scripture request at all — the text on screen is the text that gets explained.
   */
  const lessonVerse = useMemo<LessonVerse | null>(() => {
    if (!verse) return null;
    return {
      surah: verse.surah,
      ayah: verse.ayah,
      versesCount: chapter.versesCount,
      surahNameSimple: chapter.nameSimple,
      surahNameArabic: chapter.nameArabic,
      surahNameEnglish: chapter.nameEnglish,
      textUthmani: verse.textUthmani,
      textSimple: verse.textSimple,
      translationEn: verse.translationEn,
      translationTa: verse.translationTa,
      audioUrl: verse.audioUrl,
      provenance: verse.provenance ?? 'network',
    };
  }, [verse, chapter]);

  if (!open || !lessonVerse) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="sheet-bottom"
      hideHeader
      label={`Tafseer for ${chapter.nameSimple} ${lessonVerse.surah}:${lessonVerse.ayah}`}
      contentClassName="scroll-smooth"
    >
      <TafsirDialogBody
        lessonVerse={lessonVerse}
        versesCount={chapter.versesCount}
        onNavigate={onNavigate}
        onClose={onClose}
        voiceId={voiceId}
      />
    </Modal>
  );
};

interface TafsirDialogBodyProps {
  lessonVerse: LessonVerse;
  versesCount: number;
  onNavigate: (ayah: number) => void;
  onClose: () => void;
  voiceId?: string;
}

/**
 * The dialog's contents.
 *
 * Split into its own component so the lesson and session hooks are called unconditionally: the
 * outer component has no ayah to work with until the dialog is open, and a hook behind an
 * early return would violate the rules of hooks.
 */
const TafsirDialogBody: React.FC<TafsirDialogBodyProps> = ({
  lessonVerse,
  versesCount,
  onNavigate,
  onClose,
  voiceId,
}) => {
  const { view, setView, language } = useTafsirView();
  const { segment, failedEditions, state, error, reload } = useTafsirLesson(lessonVerse);

  /**
   * The loaded commentary only counts when it describes the verse on screen.
   *
   * `useTafsirLesson` deliberately keeps the previous segment while the next one resolves, so
   * stepping through ayahs does not flicker through an empty state. In a dialog that is a
   * liability rather than a feature: the header and the Arabic verse would already show ayah N
   * while the panels below still showed N−1's commentary, which reads as a contradiction.
   * Gating on identity keeps the anti-flicker behaviour for the *network* while never letting
   * one verse's exegesis appear under another verse's text.
   */
  const describesThisAyah = segment !== null && segment.surah === lessonVerse.surah && segment.ayah === lessonVerse.ayah;
  const displaySegment = describesThisAyah ? segment : null;
  const isLoading = !describesThisAyah && state !== 'error';
  /** The Live session may only start once a segment for the displayed ayah actually exists. */
  const lessonReady = displaySegment !== null;

  /*
   * The session is primed with `displaySegment`, not the raw one. The hook re-injects context
   * whenever the segment identity changes, so handing it the previous verse's exegesis during
   * a transition would let Ameen narrate ayah N−1 while ayah N is on screen. A null segment is
   * explicitly safe — the hook simply does not inject — and `lessonReady` already keeps "start
   * the voice lesson" disabled until the matching segment exists.
   */
  const live = useGeminiLiveTafsir({
    segment: displaySegment,
    language,
    voiceId: voiceId || undefined,
  });

  const dragStartYRef = useRef<number | null>(null);

  const { surah, ayah } = lessonVerse;
  const hasPrevious = ayah > 1;
  const hasNext = ayah < versesCount;

  /**
   * Arrow-key ayah traversal.
   *
   * Ignored while the learner is typing (the reflection field and the "ask Ameen" input are
   * both inside this dialog) or while a modifier is held, so it can never steal a keystroke
   * that belongs to a text control.
   */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    // A control that consumed the key owns it — the commentary view radiogroup uses the arrow
    // keys to move between English, Tamil and Both, and that must not also change the ayah.
    if (event.defaultPrevented) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;

    if (event.key === 'ArrowRight' && hasNext) {
      event.preventDefault();
      onNavigate(ayah + 1);
    } else if (event.key === 'ArrowLeft' && hasPrevious) {
      event.preventDefault();
      onNavigate(ayah - 1);
    }
  };

  return (
    <div onKeyDown={handleKeyDown} className="flex flex-col">
      {/* Sheet header: drag handle (mobile), title, close. */}
      <div className="sticky top-0 z-10 bg-card border-b border-border">
        <div
          className="sm:hidden flex justify-center pt-2.5 pb-1 touch-none"
          onTouchStart={(event) => {
            dragStartYRef.current = event.touches[0]?.clientY ?? null;
          }}
          onTouchEnd={(event) => {
            const start = dragStartYRef.current;
            dragStartYRef.current = null;
            const end = event.changedTouches[0]?.clientY;
            if (start !== null && typeof end === 'number' && end - start > SWIPE_DISMISS_PX) onClose();
          }}
          aria-hidden="true"
        >
          <span className="w-10 h-1.5 rounded-full bg-border-strong" />
        </div>

        <div className="flex items-center gap-3 px-4 pb-3 pt-2 sm:pt-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-foreground truncate">
              Tafseer — {lessonVerse.surahNameSimple}{' '}
              <span className="text-muted-foreground font-semibold">
                {surah}:{ayah}
              </span>
            </h2>
            <p className="text-[11px] text-muted-foreground truncate">
              Storyteller, commentary and reflection for this ayah
            </p>
          </div>

          <div className="flex items-center gap-1.5 ml-auto shrink-0">
            <button
              type="button"
              onClick={() => onNavigate(ayah - 1)}
              disabled={!hasPrevious}
              aria-label={`Previous ayah (${surah}:${ayah - 1})`}
              title="Previous ayah"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <span className="text-[11px] font-semibold text-muted-foreground tabular-nums">
              {ayah}/{versesCount}
            </span>
            <button
              type="button"
              onClick={() => onNavigate(ayah + 1)}
              disabled={!hasNext}
              aria-label={`Next ayah (${surah}:${ayah + 1})`}
              title="Next ayah"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              data-modal-close
              onClick={onClose}
              aria-label="Close the Tafseer dialog"
              className="p-1.5 ml-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* The Live storyteller session sits in the header, as specified: the voice control is
            reachable before the learner scrolls into the commentary. */}
        <div className="px-4 pb-3">
          <GeminiLiveStorytellerBar live={live} lessonReady={lessonReady} language={language} />
        </div>
      </div>

      <div className="p-4 space-y-5">
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

        {!displaySegment && !isLoading && (
          <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <CloudOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>
              The commentary could not be shown for this ayah. The verse itself is unaffected and
              the reader behind this dialog still holds your place.
            </span>
          </p>
        )}

        {isLoading && displaySegment === null && (
          <p className="flex items-center gap-2 text-[11px] text-muted-foreground" aria-live="polite">
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden="true" />
            <span>Loading {lessonVerse.surahNameSimple} {surah}:{ayah}…</span>
          </p>
        )}

        <InteractiveReflectionBlock
          surah={surah}
          ayah={ayah}
          surahNameSimple={lessonVerse.surahNameSimple}
          language={language}
          lessonReady={lessonReady}
        />

        <div className="flex items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={() => onNavigate(ayah - 1)}
            disabled={!hasPrevious}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface border border-border hover:bg-surface-hover text-foreground text-xs font-bold transition-colors disabled:opacity-35 disabled:pointer-events-none"
          >
            <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Previous ayah</span>
          </button>

          <span className="hidden sm:inline text-[11px] text-muted-foreground">
            Use ← and → to move between ayahs
          </span>

          <button
            type="button"
            onClick={() => onNavigate(ayah + 1)}
            disabled={!hasNext}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold transition-opacity hover:opacity-90 disabled:opacity-35 disabled:pointer-events-none"
          >
            <span>Next ayah</span>
            <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};
