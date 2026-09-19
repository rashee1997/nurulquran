'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { Chapter, QuranWord, Verse } from '@/lib/quran/types';
import { AyahItem } from './AyahItem';
import { WordPopover } from './WordPopover';
import { AudioBar, PlaybackIntent, RECITERS } from './AudioBar';
import { DownloadSurahControl } from './DownloadSurahControl';
import { MushafPageView } from './MushafPageView';
import { MutashabihatModal } from './MutashabihatModal';
import { MutashabihEntry, primeComputedMutashabihatIndex } from '@/lib/quran/mutashabihat';
import { TajweedColorKey } from './TajweedColorKey';
import { db, SrsState, VerseProgress } from '@/lib/db';
import {
  MAX_ARABIC_FONT_SIZE,
  MIN_ARABIC_FONT_SIZE,
  useReaderPreferences,
} from '@/hooks/use-reader-preferences';
import { initializeVerseProgress } from '@/lib/learning/srs-engine';
import { saveNote, saveReadingPosition, toggleBookmark } from '@/lib/quran/library';
import { track } from '@/lib/telemetry/events';
import {
  Settings2,
  Volume2,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Layers,
  AlertCircle,
} from 'lucide-react';

interface QuranReaderProps {
  chapter: Chapter;
  verses: Verse[];
  verseProgressMap?: Record<string, VerseProgress>;
  onOpenAiTutor?: (contextPrompt?: string) => void;
}

export const QuranReader: React.FC<QuranReaderProps> = ({
  chapter,
  verses,
  verseProgressMap,
  onOpenAiTutor,
}) => {
  const [viewMode, setViewMode] = useState<'continuous' | 'mushaf'>('continuous');
  const [selectedWord, setSelectedWord] = useState<QuranWord | null>(null);
  const [activeMutashabih, setActiveMutashabih] = useState<MutashabihEntry | null>(null);
  /**
   * Display preferences are read from and written back to the learner's profile, so a font
   * size chosen to read the diacritics survives navigation. They were session-only state here
   * while the profile fields for the same settings sat unread.
   */
  const {
    fontSize,
    setFontSize,
    showEnglish,
    setShowEnglish,
    showTamil,
    setShowTamil,
    showTajweedColors,
    setShowTajweedColors,
    showMistakeHighlights,
    setShowMistakeHighlights,
  } = useReaderPreferences();
  const [currentAudioIndex, setCurrentAudioIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playIntent, setPlayIntent] = useState<PlaybackIntent>({ token: 0, playing: false });
  const [savingAyahs, setSavingAyahs] = useState<ReadonlySet<number>>(new Set());
  const [showSettings, setShowSettings] = useState(false);

  const currentVerse = verses[currentAudioIndex] ?? verses[0] ?? null;

  /**
   * Memorisation state is read straight from IndexedDB. Previously the reader only
   * rendered the map passed in by the page (which never passed one), so “Add to Hifz”
   * appeared to do nothing until a reload.
   */
  const liveProgress = useLiveQuery(
    () => db.verseProgress.where('surah').equals(chapter.id).toArray(),
    [chapter.id]
  );

  const readerProfile = useLiveQuery(() => db.userProfile.get('default_user'), [], undefined);
  const activeReciterId = readerProfile?.reciterId || RECITERS[0]?.id || 'ar.alafasy';

  const bookmarkRows = useLiveQuery(
    () => db.bookmarks.where('surah').equals(chapter.id).toArray(),
    [chapter.id]
  );
  const noteRows = useLiveQuery(() => db.notes.where('surah').equals(chapter.id).toArray(), [chapter.id]);

  /**
   * Weak-spot overlay data: word indexes with recitation mistakes in this surah from the last
   * 60 days, keyed by ayah. The `surah` index answers it without a table scan; entries older
   * than the window are filtered in memory (a small set per surah).
   */
  const mistakeRows = useLiveQuery(
    () =>
      db.recitationMistakes
        .where('surah')
        .equals(chapter.id)
        // The 60-day window is applied in the query, not in a render-time memo: `Date.now()`
        // during render is an impure read, while the Dexie subscription re-runs whenever the
        // table changes, which is exactly when a fresh cutoff is meaningful.
        .and((row) => new Date(row.at).getTime() >= Date.now() - 60 * 86_400_000)
        .toArray(),
    [chapter.id]
  );
  const mistakeWordsByAyah = useMemo(() => {
    const map = new Map<number, Set<number>>();
    if (!mistakeRows) return map;
    for (const row of mistakeRows) {
      const set = map.get(row.ayah) ?? new Set<number>();
      set.add(row.wordIndex);
      map.set(row.ayah, set);
    }
    return map;
  }, [mistakeRows]);

  const bookmarkedAyahs = useMemo(() => {
    const set = new Set<number>();
    for (const row of bookmarkRows ?? []) set.add(row.ayah);
    return set;
  }, [bookmarkRows]);

  const notesByAyah = useMemo(() => {
    const map: Record<number, string> = {};
    for (const row of noteRows ?? []) map[row.ayah] = row.text;
    return map;
  }, [noteRows]);

  /** Word being recited right now, reported by the audio bar for word-synced highlighting. */
  const [activeWordIndex, setActiveWordIndex] = useState<number | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);

  /**
   * Reading position: the ayah nearest the top of the viewport is recorded as the learner
   * scrolls, so the dashboard can offer "Continue reading". Observed on the continuous list
   * only; the Mushaf view is a page, not a scroll position.
   */
  useEffect(() => {
    const root = listRef.current;
    if (!root || viewMode !== 'continuous' || typeof IntersectionObserver === 'undefined') return;

    const visible = new Map<number, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const ayah = Number((entry.target as HTMLElement).dataset.ayah);
          if (!Number.isFinite(ayah)) continue;
          if (entry.isIntersecting) visible.set(ayah, entry.boundingClientRect.top);
          else visible.delete(ayah);
        }
        if (visible.size === 0) return;
        let best: number | null = null;
        let bestTop = Number.POSITIVE_INFINITY;
        for (const [ayah, top] of visible) {
          const distance = Math.abs(top);
          if (distance < bestTop) {
            bestTop = distance;
            best = ayah;
          }
        }
        if (best !== null) saveReadingPosition(chapter.id, best);
      },
      { rootMargin: '-10% 0px -60% 0px', threshold: [0, 0.5] }
    );

    for (const element of root.querySelectorAll<HTMLElement>('[data-ayah]')) observer.observe(element);
    return () => observer.disconnect();
  }, [chapter.id, viewMode, verses.length]);

  // Loads the computed Mutashabihat index (built once from the Radar game) into memory so
  // discovered pairs, not just the curated five, surface the "Mutashabihat" button here too.
  const [, setMutashabihIndexLoaded] = useState(0);
  useEffect(() => {
    let active = true;
    primeComputedMutashabihatIndex().then((entries) => {
      if (active && entries.length > 0) setMutashabihIndexLoaded((n) => n + 1);
    });
    return () => {
      active = false;
    };
  }, []);

  // Deep link: /quran/2#ayah-255 scrolls to that ayah once the list is on screen.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const match = /^#ayah-(\d+)$/.exec(window.location.hash);
    if (!match) return;
    const target = document.getElementById(`ayah-item-${chapter.id}-${match[1]}`);
    if (!target) return;
    const frame = requestAnimationFrame(() => target.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    return () => cancelAnimationFrame(frame);
  }, [chapter.id, verses.length]);

  const handleToggleBookmark = useCallback(async (verse: Verse): Promise<void> => {
    try {
      await toggleBookmark(verse.surah, verse.ayah);
    } catch (error) {
      console.error(`Bookmark for ${verse.surah}:${verse.ayah} could not be saved:`, error);
    }
  }, []);

  const handleSaveNote = useCallback(async (verse: Verse, text: string): Promise<void> => {
    try {
      await saveNote(verse.surah, verse.ayah, text);
    } catch (error) {
      console.error(`Note for ${verse.surah}:${verse.ayah} could not be saved:`, error);
    }
  }, []);

  const progressMap = useMemo(() => {
    const map: Record<string, VerseProgress> = { ...(verseProgressMap ?? {}) };
    for (const record of liveProgress ?? []) {
      map[record.verseKey] = record;
    }
    return map;
  }, [liveProgress, verseProgressMap]);

  const requestPlaybackFor = useCallback((index: number): void => {
    setCurrentAudioIndex(index);
    setPlayIntent((previous) => ({ token: previous.token + 1, playing: true }));
  }, []);

  const requestPause = useCallback((): void => {
    setPlayIntent((previous) => ({ token: previous.token + 1, playing: false }));
  }, []);

  const handlePlayVerse = useCallback(
    (verse: Verse): void => {
      const index = verses.findIndex((item) => item.ayah === verse.ayah);
      if (index === -1) return;

      if (index === currentAudioIndex && isPlaying) {
        requestPause();
        return;
      }
      requestPlaybackFor(index);
    },
    [currentAudioIndex, isPlaying, requestPause, requestPlaybackFor, verses]
  );

  const handleStep = useCallback(
    (direction: 1 | -1): void => {
      const next = currentAudioIndex + direction;
      if (next < 0 || next >= verses.length) return;
      requestPlaybackFor(next);
    },
    [currentAudioIndex, requestPlaybackFor, verses.length]
  );

  const handleMemorizeToggle = useCallback(async (verse: Verse): Promise<void> => {
    // A per-ayah lock: two fast taps used to both read “not memorised” and write
    // conflicting rows, and the button gave no feedback while the write was pending.
    let alreadySaving = false;
    setSavingAyahs((previous) => {
      if (previous.has(verse.ayah)) {
        alreadySaving = true;
        return previous;
      }
      const next = new Set(previous);
      next.add(verse.ayah);
      return next;
    });

    const key = `${verse.surah}:${verse.ayah}`;
    try {
      const existing = await db.verseProgress.get(key);
      if (existing) {
        await db.verseProgress.delete(key);
      } else {
        const initial = initializeVerseProgress(verse.surah, verse.ayah);
        initial.state = 'learning';
        await db.verseProgress.put(initial);
      }
    } catch (error) {
      console.error(`Could not update memorisation state for ${key}:`, error);
    } finally {
      setSavingAyahs((previous) => {
        const next = new Set(previous);
        next.delete(verse.ayah);
        return next;
      });
    }
  }, []);

  const handleAskAi = useCallback(
    (verse: Verse): void => {
      if (!onOpenAiTutor) return;
      onOpenAiTutor(`Please explain Surah ${chapter.nameSimple} (${verse.surah}:${verse.ayah}) in detail:
Arabic: "${verse.textUthmani}"
English: "${verse.translationEn}"
Tamil: "${verse.translationTa}"
Explain the root words, linguistic context, and practical spiritual reflections.`);
    },
    [chapter.nameSimple, onOpenAiTutor]
  );

  const handleAskAiAboutSurah = useCallback((): void => {
    onOpenAiTutor?.(
      `Let's study Surah ${chapter.nameSimple} (${chapter.id}). Can you give me an overview of its themes, historical context, and key vocabulary?`
    );
  }, [chapter.id, chapter.nameSimple, onOpenAiTutor]);

  const handleOpenMutashabihat = useCallback((entry: MutashabihEntry): void => {
    setActiveMutashabih(entry);
  }, []);

  const handleWordClick = useCallback((word: QuranWord): void => {
    setSelectedWord(word);
  }, []);

  if (verses.length === 0) {
    return (
      <div className="max-w-2xl mx-auto w-full my-16 p-8 rounded-3xl bg-card border border-border text-center space-y-3">
        <AlertCircle className="w-8 h-8 mx-auto text-warning" aria-hidden="true" />
        <h2 className="text-lg font-bold text-foreground">
          Surah {chapter.id} could not be loaded
        </h2>
        <p className="text-sm text-muted-foreground">
          The verified text service did not return this surah. No partial text is shown, because
          displaying anything other than the authenticated verse would misrepresent the Quran.
        </p>
      </div>
    );
  }

  return (
    /*
      The recitation player is fixed to the bottom of the viewport (see `AudioBar`), so the
      reader reserves room beneath its last ayah for it — otherwise the bar covers the final
      verses at the end of the scroll.
    */
    <div id="quran-reader-container" className="flex flex-col min-h-screen pb-36 sm:pb-24">
      {/* Chapter Banner */}
      <div className="w-full bg-hero-bg text-hero-fg border border-hero-border py-10 px-4 sm:px-6 rounded-3xl mb-8 shadow-xl relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-pattern-dots" aria-hidden="true" />

        <div className="max-w-3xl mx-auto text-center relative z-10 space-y-3">
          <div className="flex items-center justify-between text-xs text-hero-muted font-medium pb-2">
            <Link
              href={`/quran/${Math.max(1, chapter.id - 1)}`}
              className={`flex items-center gap-1 hover:text-hero-fg transition-colors ${chapter.id === 1 ? 'opacity-40 pointer-events-none' : ''}`}
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              <span>Previous Surah</span>
            </Link>

            <span className="px-3 py-1 rounded-full bg-hero-pill-bg text-hero-pill-fg uppercase tracking-widest text-[10px] font-bold">
              Surah {chapter.id} • {chapter.revelationPlace === 'makkah' ? 'Makki' : 'Madani'}
            </span>

            <Link
              href={`/quran/${Math.min(114, chapter.id + 1)}`}
              className={`flex items-center gap-1 hover:text-hero-fg transition-colors ${chapter.id === 114 ? 'opacity-40 pointer-events-none' : ''}`}
            >
              <span>Next Surah</span>
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>

          <h1 lang="ar" dir="rtl" className="text-4xl sm:text-5xl font-arabic text-secondary py-1">
            {chapter.nameArabic}
          </h1>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            {chapter.nameSimple}
            <span className="text-sm font-normal text-hero-muted ml-2">({chapter.nameEnglish})</span>
          </h2>
          <p className="text-xs text-hero-muted font-medium">
            {chapter.versesCount} Verses • Complete with English & Tamil Translations
          </p>

          {/* Quick Reader Action Bar */}
          <div className="flex items-center justify-center gap-2.5 pt-3 flex-wrap">
            <div className="inline-flex items-center p-1 rounded-full bg-hero-card-bg border border-hero-border backdrop-blur-xs">
              <button
                type="button"
                onClick={() => setViewMode('continuous')}
                aria-pressed={viewMode === 'continuous'}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  viewMode === 'continuous'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-hero-muted hover:text-hero-fg'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Continuous</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('mushaf')}
                aria-pressed={viewMode === 'mushaf'}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  viewMode === 'mushaf'
                    ? 'bg-secondary text-secondary-foreground shadow-xs'
                    : 'text-hero-muted hover:text-hero-fg'
                }`}
              >
                <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                <span>15-Line Mushaf</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => requestPlaybackFor(0)}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-secondary hover:bg-secondary-hover text-secondary-foreground text-xs font-bold transition-all shadow-md active:scale-95"
            >
              <Volume2 className="w-4 h-4" aria-hidden="true" />
              <span>Listen from Start</span>
            </button>

            {onOpenAiTutor && (
              <button
                type="button"
                onClick={handleAskAiAboutSurah}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-hero-card-bg hover:bg-hero-pill-bg text-hero-fg text-xs font-semibold backdrop-blur-xs transition-all border border-hero-border"
              >
                <Sparkles className="w-4 h-4 text-secondary" aria-hidden="true" />
                <span>AI Tutor Insights</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowSettings((open) => !open)}
              aria-expanded={showSettings}
              aria-controls="reader-settings"
              className="p-2 rounded-full bg-hero-card-bg hover:bg-hero-pill-bg text-hero-fg text-xs backdrop-blur-xs transition-colors border border-hero-border"
              title="Display settings"
            >
              <Settings2 className="w-4 h-4" aria-hidden="true" />
              <span className="sr-only">Display settings</span>
            </button>

            <DownloadSurahControl surahId={chapter.id} reciterId={activeReciterId} versesCount={chapter.versesCount} />
          </div>
        </div>
      </div>

      {/* Reader Settings */}
      {showSettings && (
        <div
          id="reader-settings"
          className="max-w-3xl mx-auto w-full p-4 mb-6 rounded-2xl bg-card border border-border shadow-md space-y-4"
        >
          <div className="flex items-center justify-between text-xs font-bold text-foreground border-b border-border pb-2">
            <span>Reader Preferences</span>
            {/*
              No "saved" claim here: a label that says so before anything has been written is
              indistinguishable from a save that quietly failed. These controls apply live and
              report each write as a toast, so the header only states the behaviour.
            */}
            <span className="text-muted-foreground">Applies and saves as you change it</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5">
              <label htmlFor="arabic-font-size" className="flex justify-between text-muted-foreground">
                <span>Arabic Font Size</span>
                <span className="font-bold text-foreground">{fontSize}px</span>
              </label>
              <input
                id="arabic-font-size"
                type="range"
                min={MIN_ARABIC_FONT_SIZE}
                max={MAX_ARABIC_FONT_SIZE}
                step={1}
                value={fontSize}
                onChange={(event) => setFontSize(Number(event.target.value))}
                className="w-full accent-primary cursor-pointer"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* At least one translation stays on, so the pair below never reaches
                  "neither" — a state the stored preference has no way to represent. */}
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showEnglish}
                  disabled={showEnglish && !showTamil}
                  onChange={(event) => setShowEnglish(event.target.checked)}
                  className="rounded-sm accent-primary disabled:opacity-50"
                />
                <span className="text-foreground">English (Sahih)</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showTamil}
                  disabled={showTamil && !showEnglish}
                  onChange={(event) => setShowTamil(event.target.checked)}
                  className="rounded-sm accent-primary disabled:opacity-50"
                />
                <span className="text-foreground font-tamil" lang="ta">
                  தமிழ் (Tamil)
                </span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showTajweedColors}
                  onChange={(event) => setShowTajweedColors(event.target.checked)}
                  className="rounded-sm accent-primary"
                />
                <span className="text-foreground">Tajweed Colours</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showMistakeHighlights}
                  onChange={(event) => setShowMistakeHighlights(event.target.checked)}
                  className="rounded-sm accent-primary"
                />
                <span className="text-foreground">Weak-spot highlights</span>
              </label>
            </div>
          </div>

          {/*
            The colour key, with the instruction for each rule.

            Tajweed rules are conveyed by colour, and colour alone is not an accessible channel:
            a learner with a colour-vision deficiency, or reading on a washed-out screen, needs
            the rule named. It is the same component the lessons and the live coach render, so a
            colour learned in a lesson is the colour seen here.
          */}
          {showTajweedColors && (
            <div className="pt-3 border-t border-border space-y-2">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                Tajweed colour key
              </span>
              <TajweedColorKey showInstructions />
            </div>
          )}

          {showMistakeHighlights && (
            <div className="pt-3 border-t border-border space-y-1">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                Weak-spot key
              </span>
              <p className="text-[11px] text-muted-foreground">
                <span className="underline decoration-dotted decoration-danger-strong" aria-hidden="true">Underlined</span> words are
                ones you skipped, substituted or fumbled in recent recitations (last 60 days). Tap a word for details.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Bismillah is part of the scripture of every surah except At-Tawbah (9). */}
      {chapter.bismillahPre && (
        <div className="text-center py-6 mb-4">
          <p className="text-3xl font-arabic text-primary-strong" dir="rtl" lang="ar">
            بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ
          </p>
          <p className="text-xs text-muted-foreground mt-2 font-medium">
            In the name of Allah, the Entirely Merciful, the Especially Merciful.
          </p>
        </div>
      )}

      {viewMode === 'mushaf' ? (
        <MushafPageView
          chapter={chapter}
          verses={verses}
          fontSize={fontSize}
          showTajweedColors={showTajweedColors}
          onSelectVerse={handlePlayVerse}
          onOpenAiTutor={onOpenAiTutor}
        />
      ) : (
        <div ref={listRef} className="max-w-3xl mx-auto w-full space-y-4">
          {verses.map((verse) => {
            const key = `${verse.surah}:${verse.ayah}`;
            const progress = progressMap[key];
            const isCurrentAyah = currentVerse?.ayah === verse.ayah;

            return (
              <div key={key} data-ayah={verse.ayah}>
              <AyahItem
                verse={verse}
                fontSize={fontSize}
                showEnglish={showEnglish}
                showTamil={showTamil}
                showTajweedColors={showTajweedColors}
                mistakeWordIndexes={showMistakeHighlights ? mistakeWordsByAyah.get(verse.ayah) : undefined}
                isCurrentAudio={isCurrentAyah}
                isPlaying={isPlaying}
                srsState={progress?.state as SrsState | undefined}
                isSavingProgress={savingAyahs.has(verse.ayah)}
                onPlay={handlePlayVerse}
                onWordClick={handleWordClick}
                onMemorizeToggle={handleMemorizeToggle}
                onAskAi={handleAskAi}
                onOpenMutashabihat={handleOpenMutashabihat}
                isBookmarked={bookmarkedAyahs.has(verse.ayah)}
                onToggleBookmark={handleToggleBookmark}
                noteText={notesByAyah[verse.ayah]}
                onSaveNote={handleSaveNote}
                // Only the ayah being recited receives a word index. The highlight moves
                // several times a second, and handing it to every row would re-render all of
                // them (a long surah is 286 cards) on every word — exactly the kind of
                // main-thread work that makes a highlight arrive late.
                activeWordIndex={isCurrentAyah ? activeWordIndex : null}
              />
              </div>
            );
          })}
        </div>
      )}

      {activeMutashabih && (
        <MutashabihatModal entry={activeMutashabih} onClose={() => setActiveMutashabih(null)} />
      )}

      {/* Keyed by word so opening a second word starts from a clean sheet: a playback
          failure or a "Saved!" badge from the previous word must not carry over. */}
      {selectedWord && (
        <WordPopover
          key={selectedWord.id}
          word={selectedWord}
          onClose={() => setSelectedWord(null)}
        />
      )}

      {currentVerse && (
        <AudioBar
          surahNumber={chapter.id}
          totalVerses={chapter.versesCount}
          currentAyahNumber={currentVerse.ayah}
          globalAyahNumber={currentVerse.globalNumber}
          fallbackAudioUrl={currentVerse.audioUrl}
          wordCount={currentVerse.words.length}
          words={currentVerse.words}
          onActiveWordChange={setActiveWordIndex}
          onAyahCompleted={() => track('audio.completed', { surah: chapter.id, ayah: currentVerse.ayah })}
          playIntent={playIntent}
          onPlayingChange={setIsPlaying}
          onNextAyah={() => handleStep(1)}
          onPrevAyah={() => handleStep(-1)}
        />
      )}
    </div>
  );
};
