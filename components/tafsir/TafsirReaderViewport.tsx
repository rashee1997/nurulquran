'use client';

import React, { useRef, useState } from 'react';
import {
  BookOpen,
  CloudOff,
  Database,
  Globe,
  History,
  Languages,
  Loader2,
  Pause,
  Play,
  Quote,
} from 'lucide-react';
import type {
  TafsirEntry,
  TafsirLanguage,
  TafsirLessonSegment,
  TafsirProvenance,
} from '@/lib/tafsir/types';

interface TafsirReaderViewportProps {
  segment: TafsirLessonSegment | null;
  language: TafsirLanguage;
  onLanguageChange: (language: TafsirLanguage) => void;
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

const LANGUAGE_META: Record<TafsirLanguage, { label: string; longLabel: string; htmlLang: string }> = {
  en: { label: 'EN', longLabel: 'English', htmlLang: 'en' },
  ta: { label: 'தமிழ்', longLabel: 'Tamil', htmlLang: 'ta' },
};

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
const TafsirPanel: React.FC<{ entry: TafsirEntry; isPrimary: boolean }> = ({ entry, isPrimary }) => {
  const badge = PROVENANCE_BADGE[entry.provenance];
  const BadgeIcon = badge.icon;
  const isMissing = entry.provenance === 'unavailable' || entry.text.trim().length === 0;

  return (
    <article
      lang={LANGUAGE_META[entry.language].htmlLang}
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
        ) : (
          <div
            className={`text-[0.95rem] text-foreground whitespace-pre-line max-w-[65ch] ${
              entry.language === 'ta' ? 'font-tamil leading-[1.9]' : 'leading-[1.75]'
            }`}
          >
            {entry.text}
          </div>
        )}
      </div>
    </article>
  );
};

/**
 * The lesson reading surface: verified Arabic, both translations, and both commentaries.
 *
 * Layout notes:
 *  - The language toggle switches which panel is *emphasised*, and which one is shown at all
 *    below `lg`. Both panels exist in the DOM in the same slots at every breakpoint, so
 *    toggling changes no element's size class and cannot produce a layout shift.
 *  - While loading, the panel grid keeps its reserved height so the page does not jump when
 *    the exegesis arrives.
 */
export const TafsirReaderViewport: React.FC<TafsirReaderViewportProps> = ({
  segment,
  language,
  onLanguageChange,
  loading,
  failedEditions,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

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
    return (
      <div className="rounded-2xl border border-border bg-card p-8 min-h-[420px] flex flex-col items-center justify-center gap-3 text-center">
        {loading ? (
          <>
            <Loader2 className="w-6 h-6 text-primary animate-spin" aria-hidden="true" />
            <p className="text-sm font-semibold text-foreground">Assembling this lesson…</p>
            <p className="text-xs text-muted-foreground">
              Reading the verified verse and its commentary.
            </p>
          </>
        ) : (
          <>
            <BookOpen className="w-6 h-6 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-semibold text-foreground">No lesson loaded</p>
          </>
        )}
      </div>
    );
  }

  const hasAsbab = Boolean(segment.asbab && segment.asbab.text.trim().length > 0);

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

          <p
            className="font-arabic text-[1.7rem] sm:text-4xl leading-[2.4] text-hero-fg text-center"
            dir="rtl"
            lang="ar"
            style={{ lineHeight: 2.2 }}
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
        <div
          translate="no"
          className="notranslate rounded-xl border border-border bg-card px-4 py-3.5"
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
            English translation
          </p>
          <p className="text-sm text-foreground leading-[1.75]">
            {segment.translationEn || '—'}
          </p>
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
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
            {segment.asbab.text}
          </p>
          <p className="text-[10px] text-muted-foreground mt-2.5">
            Source: {segment.asbab.editionName}
          </p>
        </section>
      )}

      {/* Language emphasis toggle. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Languages className="w-4 h-4 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-bold text-foreground">Tafseer commentary</h2>
        </div>

        <div
          role="group"
          aria-label="Choose the language to read"
          className="inline-flex items-center p-1 rounded-xl bg-surface-muted border border-border"
        >
          {(['en', 'ta'] as const).map((code) => {
            const isActive = language === code;
            return (
              <button
                key={code}
                type="button"
                onClick={() => onLanguageChange(code)}
                aria-pressed={isActive}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                } ${code === 'ta' ? 'font-tamil' : ''}`}
              >
                {LANGUAGE_META[code].label}
                <span className="sr-only"> — {LANGUAGE_META[code].longLabel} commentary</span>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[220px]">
        {(['en', 'ta'] as const).map((code) => {
          const entry = segment.tafsir[code];
          const isEmphasised = language === code;
          return (
            <div
              key={code}
              className={
                // Below lg the non-selected language is hidden, which is a display change on an
                // element of unchanged size — no reflow of the sibling panel.
                isEmphasised ? 'block' : 'hidden lg:block'
              }
            >
              <TafsirPanel entry={entry} isPrimary={isEmphasised} />
            </div>
          );
        })}
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
