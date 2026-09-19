'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  CloudOff,
  Columns2,
  Database,
  Globe,
  History,
  Languages,
  Loader2,
  Pause,
  Play,
  Quote,
} from 'lucide-react';
import { TafsirProse } from './TafsirProse';
import type {
  TafsirEntry,
  TafsirLessonSegment,
  TafsirProvenance,
  TafsirViewMode,
} from '@/lib/tafsir/types';

interface TafsirReaderViewportProps {
  segment: TafsirLessonSegment | null;
  view: TafsirViewMode;
  onViewChange: (view: TafsirViewMode) => void;
  loading: boolean;
  failedEditions: readonly string[];
}

const PROVENANCE_BADGE: Record<
  TafsirProvenance,
  { label: string; icon: React.ElementType; className: string }
> = {
  network: {
    label: 'Just fetched',
    icon: Globe,
    className: 'bg-info-subtle text-info-strong border-info/30',
  },
  cache: {
    label: 'Saved offline',
    icon: Database,
    className: 'bg-success-subtle text-success-strong border-success/30',
  },
  unavailable: {
    label: 'Not available',
    icon: CloudOff,
    className: 'bg-destructive-subtle text-destructive-strong border-destructive/30',
  },
};

const VIEW_OPTIONS: Record<
  TafsirViewMode,
  { label: string; longLabel: string; icon: React.ElementType; scriptClass: string }
> = {
  en: { label: 'EN', longLabel: 'English', icon: Languages, scriptClass: '' },
  ta: { label: 'தமிழ்', longLabel: 'Tamil', icon: Languages, scriptClass: 'font-tamil' },
  bilingual: { label: 'Both', longLabel: 'Bilingual', icon: Columns2, scriptClass: '' },
};

/** Commentaries longer than this open collapsed, so the abridged lesson stays the default read. */
const LONG_TEXT_CHARS = 4_000;

/** The three view options, in display order. Also the arrow-key traversal order. */
const VIEW_OPTION_CODES = ['en', 'ta', 'bilingual'] as const;

/**
 * One language's commentary panel.
 *
 * Two properties are deliberate and load-bearing:
 *
 *  - `translate="no"` **and** `className="notranslate"` are applied together. The attribute
 *    is honoured by translation APIs and the class by browser translation toolbars; either
 *    one alone leaves a route by which a browser engine can rewrite Tamil exegesis or strip
 *    the diacritics from an Arabic term and silently corrupt a theological statement.
 *  - `lang` is set so the browser picks correct fonts, line breaking and hyphenation for
 *    Tamil rather than guessing from the surrounding Latin text.
 */
const TafsirPanel: React.FC<{ entry: TafsirEntry; verseKey: string; isPrimary: boolean }> = ({
  entry,
  verseKey,
  isPrimary,
}) => {
  const badge = PROVENANCE_BADGE[entry.provenance];
  const BadgeIcon = badge.icon;
  const isMissing = entry.provenance === 'unavailable' || entry.text.trim().length === 0;
  const isLong = entry.text.length > LONG_TEXT_CHARS;

  /*
   * Collapse state is keyed to the verse it was chosen for.
   *
   * The panel sits at a stable position in the tree, so React keeps the instance across an
   * ayah change and a plain `useState(!isLong)` would be frozen at whatever the *first*
   * ayah needed: opening a short ayah first left a 51 KB Ibn Kathir passage fully expanded,
   * and opening a long one first hid a short abridged commentary behind a "show the full
   * commentary" teaser that mislabelled it. Storing the key beside the value and comparing
   * during render is React's documented way to adjust state when a prop changes — no effect,
   * so no extra commit and no cascading render.
   */
  const [collapseChoice, setCollapseChoice] = useState<{ verseKey: string; expanded: boolean } | null>(
    null
  );
  const expanded = collapseChoice?.verseKey === verseKey ? collapseChoice.expanded : !isLong;
  const setExpanded = (value: boolean): void => setCollapseChoice({ verseKey, expanded: value });

  return (
    <article
      lang={entry.language === 'ta' ? 'ta' : 'en'}
      translate="no"
      className={`notranslate flex flex-col rounded-2xl border bg-card overflow-hidden ${
        isPrimary ? 'border-primary/40 shadow-xs' : 'border-border'
      }`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-border bg-surface-muted">
        <div className="flex items-center gap-2 min-w-0">
          <BookOpen className="w-3.5 h-3.5 text-primary shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs font-bold text-foreground truncate">{entry.editionName}</p>
            <p className="text-[10px] text-muted-foreground truncate">{entry.editionAuthor}</p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-semibold shrink-0 ${badge.className}`}
        >
          <BadgeIcon className="w-2.5 h-2.5" aria-hidden="true" />
          {badge.label}
        </span>
      </header>

      <div className="p-4 sm:p-5">
        {isMissing ? (
          <p className="text-xs text-muted-foreground italic">
            This edition has no entry for this ayah. The Arabic verse and its translation are
            still shown above, and the other language may still carry commentary.
          </p>
        ) : expanded ? (
          <TafsirProse text={entry.text} language={entry.language === 'ta' ? 'ta' : 'en'} />
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {/* Named, not described: the panel can be the abridged lesson's own edition, and
                  calling that "the full classical commentary" misstates what is on screen. */}
              {entry.editionName} runs to about {Math.ceil(entry.text.length / 1000)}k characters
              for this ayah — longer than the rest of this lesson. It opens expanded only on
              request so the lesson stays readable at a glance.
            </p>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-subtle text-primary-strong text-[11px] font-bold hover:bg-primary/15 transition-colors"
            >
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              Show the full commentary
            </button>
          </div>
        )}

        {expanded && isLong && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronUp className="w-3 h-3" aria-hidden="true" />
            Collapse the deep-dive
          </button>
        )}
      </div>
    </article>
  );
};

/**
 * The lesson reading surface: verified Arabic, both translations, and the commentary panels.
 *
 * Layout notes:
 *  - The verse header uses one declared line-height (`leading-[2.4]`). It previously carried
 *    both a class and an inline `style={{ lineHeight: 2.2 }}`; the inline value won, the class
 *    was dead, and 2.2 is below what stacked Uthmani diacritics in Amiri Quran need — which is
 *    how the marks on a tall letterform get clipped.
 *  - The skeleton reserves the same section heights the loaded lesson occupies, so the swap
 *    from loading to ready does not move the page. It cannot predict the *commentary's*
 *    height (2 KB and 51 KB are both valid for the same ayah), so the panel grid also carries
 *    a floor height and the reading column keeps a fixed measure.
 *  - Switching view mode is a user action, so the resulting height change is expected; it is
 *    kept to the panels themselves rather than being allowed to collapse the whole page.
 */
export const TafsirReaderViewport: React.FC<TafsirReaderViewportProps> = ({
  segment,
  view,
  onViewChange,
  loading,
  failedEditions,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  /** One DOM reference per view option, for the radiogroup's arrow-key focus movement. */
  const viewOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  /**
   * Stops the previous ayah's recitation when the displayed verse changes.
   *
   * `isPlaying` is component state and the segment change does not reset it, so the control
   * could keep offering "Pause recitation" for an ayah that is no longer sounding; whether the
   * element's own `pause` event corrected it depended on the browser's behaviour when `src` is
   * replaced. Pausing explicitly makes it deterministic. The element is also keyed by verse, so
   * a new ayah never inherits a stale media position.
   */
  const segmentKey = segment ? `${segment.surah}:${segment.ayah}` : null;
  const lastSegmentKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (segmentKey === lastSegmentKeyRef.current) return;
    lastSegmentKeyRef.current = segmentKey;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setIsPlaying(false);
  }, [segmentKey]);

  const toggleRecitation = (): void => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }
    void audio
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => setIsPlaying(false));
  };

  if (!segment) {
    if (!loading) {
      return (
        <div className="rounded-2xl border border-border bg-card p-8 min-h-[420px] flex flex-col items-center justify-center gap-3 text-center">
          <BookOpen className="w-6 h-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-semibold text-foreground">No lesson loaded</p>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-5" aria-busy="true" aria-live="polite">
        <span className="sr-only">Assembling this lesson…</span>

        {/* Verse panel. */}
        <div className="rounded-2xl border border-hero-border bg-hero-bg p-5 sm:p-7 min-h-[232px] flex flex-col items-center justify-center gap-4">
          <div className="h-8 w-3/4 rounded-lg bg-hero-card-bg animate-pulse" />
          <div className="h-12 w-full max-w-md rounded-lg bg-hero-card-bg animate-pulse" />
          <div className="h-9 w-44 rounded-full bg-hero-card-bg animate-pulse" />
        </div>

        {/* Translations. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 min-h-[96px]">
          <div className="rounded-xl border border-border bg-card px-4 py-3.5 space-y-2">
            <div className="h-3 w-24 rounded bg-surface-muted animate-pulse" />
            <div className="h-4 w-full rounded bg-surface-muted animate-pulse" />
            <div className="h-4 w-4/5 rounded bg-surface-muted animate-pulse" />
          </div>
          <div className="rounded-xl border border-border bg-card px-4 py-3.5 space-y-2">
            <div className="h-3 w-28 rounded bg-surface-muted animate-pulse" />
            <div className="h-4 w-full rounded bg-surface-muted animate-pulse" />
            <div className="h-4 w-4/5 rounded bg-surface-muted animate-pulse" />
          </div>
        </div>

        {/* Commentary grid — same floor height as the real one. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[220px]">
          {[0, 1].map((column) => (
            <div key={column} className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <div className="h-3 w-40 rounded bg-surface-muted animate-pulse" />
              <div className="h-4 w-full rounded bg-surface-muted animate-pulse" />
              <div className="h-4 w-11/12 rounded bg-surface-muted animate-pulse" />
              <div className="h-4 w-4/5 rounded bg-surface-muted animate-pulse" />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground min-h-[20px]">
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          <span>Reading the verified verse and its commentary…</span>
        </div>
      </div>
    );
  }

  /**
   * Arrow-key traversal of the view options, as the radiogroup pattern requires.
   *
   * `defaultPrevented` is honoured by the surrounding dialog's global arrow-key handler, so
   * consuming the key here cannot also step to another ayah.
   */
  const selectViewWithArrowKeys = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number
  ): void => {
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    if (!forward && !backward) return;
    event.preventDefault();
    const nextIndex =
      (index + (forward ? 1 : -1) + VIEW_OPTION_CODES.length) % VIEW_OPTION_CODES.length;
    const nextView = VIEW_OPTION_CODES[nextIndex];
    if (!nextView) return;
    onViewChange(nextView);
    viewOptionRefs.current[nextIndex]?.focus();
  };

  const hasAsbab = Boolean(segment.asbab && segment.asbab.text.trim().length > 0);
  const panels: readonly ('en' | 'ta')[] = view === 'bilingual' ? ['en', 'ta'] : [view];
  const verseKey = `${segment.surah}:${segment.ayah}`;

  return (
    <div className="flex flex-col gap-5">
      {/* Verified Arabic ayah. */}
      <section
        lang="ar"
        dir="rtl"
        translate="no"
        className="notranslate rounded-2xl border border-hero-border bg-hero-bg text-hero-fg p-5 sm:p-7 relative overflow-hidden"
      >
        <div className="absolute inset-0 opacity-10 bg-pattern-dots" aria-hidden="true" />

        <div className="relative z-10 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <span className="px-2.5 py-1 rounded-full bg-hero-pill-bg text-hero-pill-fg font-bold tracking-wide">
              {segment.surahNameSimple} {segment.surah}:{segment.ayah}
            </span>
            <div className="flex items-center gap-3">
              {segment.verseProvenance === 'verified-offline' && (
                <span className="inline-flex items-center gap-1 text-hero-muted font-semibold">
                  <CloudOff className="w-3 h-3" aria-hidden="true" />
                  Verified offline copy
                </span>
              )}
              <span className="font-arabic text-hero-muted" dir="rtl" lang="ar">
                {segment.surahNameArabic}
              </span>
            </div>
          </div>

          {/*
            One line-height, declared once. Amiri Quran stacks diacritics above and below the
            baseline, so the mark needs the full 2.4 line box to avoid clipping on a tall
            letterform; the value is never overridden inline.
          */}
          <p
            className="font-arabic text-[1.7rem] sm:text-4xl leading-[2.4] text-hero-fg text-center"
            dir="rtl"
            lang="ar"
          >
            {segment.textUthmani}
          </p>

          <div className="flex items-center justify-center pt-1">
            <button
              type="button"
              onClick={toggleRecitation}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-hero-card-bg hover:bg-hero-pill-bg border border-hero-border text-hero-fg text-xs font-bold backdrop-blur-xs transition-colors"
            >
              {isPlaying ? (
                <Pause className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>{isPlaying ? 'Pause recitation' : 'Listen to the ayah'}</span>
            </button>
          </div>

          {segment.audioUrl && (
            // The recitation has no spoken-word caption track to attach; the verse text is
            // rendered directly above it as the transcript.
            <audio
              key={verseKey}
              ref={audioRef}
              src={segment.audioUrl}
              preload="none"
              onEnded={() => setIsPlaying(false)}
              onPause={() => setIsPlaying(false)}
              className="sr-only"
            />
          )}
        </div>
      </section>

      {/* Both translations, always visible: they are short by design. */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div translate="no" className="notranslate rounded-xl border border-border bg-card px-4 py-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
            English translation
          </p>
          <p className="text-sm text-foreground leading-[1.75]">{segment.translationEn || '—'}</p>
        </div>
        <div
          lang="ta"
          translate="no"
          className="notranslate rounded-xl border border-border bg-card px-4 py-3.5"
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
            தமிழ் மொழிபெயர்ப்பு
          </p>
          <p className="text-sm text-foreground leading-[1.9] font-tamil">
            {segment.translationTa || '—'}
          </p>
        </div>
      </section>

      {/* Occasion of revelation — only rendered when the edition actually has one. */}
      {hasAsbab && segment.asbab && (
        <section
          translate="no"
          className="notranslate rounded-2xl border border-secondary/40 bg-secondary-subtle p-4 sm:p-5"
        >
          <div className="flex items-center gap-2 mb-2">
            <History className="w-4 h-4 text-secondary-strong" aria-hidden="true" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-secondary-strong">
              Occasion of revelation (Asbab al-Nuzul)
            </h2>
          </div>
          <TafsirProse text={segment.asbab.text} language="en" />
          <p className="text-[10px] text-muted-foreground mt-2.5">
            Source: {segment.asbab.editionName}
          </p>
        </section>
      )}

      {/* View mode selector. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Languages className="w-4 h-4 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-bold text-foreground">Tafseer commentary</h2>
        </div>

        <div
          role="radiogroup"
          aria-label="Choose which commentary to read"
          className="inline-flex items-center p-1 rounded-xl bg-surface-muted border border-border"
        >
          {VIEW_OPTION_CODES.map((code, index) => {
            const option = VIEW_OPTIONS[code];
            const OptionIcon = option.icon;
            const isActive = view === code;
            return (
              <button
                key={code}
                type="button"
                role="radio"
                aria-checked={isActive}
                /* Roving tab stop: a radiogroup is one Tab stop and the arrow keys move within
                   it. All three buttons being tab stops was the defect. */
                tabIndex={isActive ? 0 : -1}
                ref={(element) => {
                  viewOptionRefs.current[index] = element;
                }}
                onKeyDown={(event) => selectViewWithArrowKeys(event, index)}
                onClick={() => onViewChange(code)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                } ${option.scriptClass}`}
              >
                <OptionIcon className="w-3 h-3" aria-hidden="true" />
                {option.label}
                <span className="sr-only"> — {option.longLabel} commentary</span>
              </button>
            );
          })}
        </div>
      </div>

      {failedEditions.length > 0 && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-subtle px-4 py-2.5 text-[11px] font-medium text-warning-strong"
        >
          <CloudOff className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            {failedEditions.length === 1 ? 'One commentary edition' : 'Some commentary editions'} could
            not be reached, so those panels are marked “Not available” rather than left blank. The
            verse itself is unaffected.
          </span>
        </div>
      )}

      <div
        className={`grid gap-4 min-h-[220px] ${
          view === 'bilingual' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
        }`}
      >
        {panels.map((code) => (
          <TafsirPanel
            key={code}
            entry={segment.tafsir[code]}
            verseKey={verseKey}
            isPrimary={view === 'bilingual' ? code === 'en' : true}
          />
        ))}
      </div>

      <p className="flex items-start gap-2 text-[11px] text-muted-foreground leading-relaxed">
        <Quote className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" aria-hidden="true" />
        <span>
          The Arabic verse and its translations come from the app&rsquo;s verified Quran corpus.
          The commentary panels are human explanation, not revelation, and are shown exactly as
          their publishers wrote them.
        </span>
      </p>
    </div>
  );
};
