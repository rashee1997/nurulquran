'use client';

import React, { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { Chapter, QuranWord, Verse } from '@/lib/quran/types';
import { AyahItem } from './AyahItem';
import { WordPopover } from './WordPopover';
import { AudioBar, PlaybackIntent } from './AudioBar';
import { MushafPageView } from './MushafPageView';
import { MutashabihatModal } from './MutashabihatModal';
import { MutashabihEntry } from '@/lib/quran/mutashabihat';
import { db, SrsState, VerseProgress } from '@/lib/db';
import { initializeVerseProgress } from '@/lib/learning/srs-engine';
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
  const [fontSize, setFontSize] = useState(30);
  const [showEnglish, setShowEnglish] = useState(true);
  const [showTamil, setShowTamil] = useState(true);
  const [showTajweedColors, setShowTajweedColors] = useState(true);
  const [currentAudioIndex, setCurrentAudioIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playIntent, setPlayIntent] = useState<PlaybackIntent>({ token: 0, playing: false });
  const [savingAyahs, setSavingAyahs] = useState<ReadonlySet<number>>(new Set());
  const [showSettings, setShowSettings] = useState(false);

  const currentVerse = verses[currentAudioIndex] || verses[0];

  /**
   * Memorisation state is read straight from IndexedDB. Previously the reader only
   * rendered the map passed in by the page (which never passed one), so “Add to Hifz”
   * appeared to do nothing until a reload.
   */
  const liveProgress = useLiveQuery(
    () => db.verseProgress.where('surah').equals(chapter.id).toArray(),
    [chapter.id]
  );

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
    <div id="quran-reader-container" className="flex flex-col min-h-screen pb-24">
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

          <h1 className="text-4xl sm:text-5xl font-arabic text-secondary py-1">
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
            <span className="text-muted-foreground">Saved for this session</span>
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
                min={22}
                max={46}
                step={1}
                value={fontSize}
                onChange={(event) => setFontSize(Number(event.target.value))}
                className="w-full accent-primary cursor-pointer"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showEnglish}
                  onChange={(event) => setShowEnglish(event.target.checked)}
                  className="rounded-sm accent-primary"
                />
                <span className="text-foreground">English (Sahih)</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showTamil}
                  onChange={(event) => setShowTamil(event.target.checked)}
                  className="rounded-sm accent-primary"
                />
                <span className="text-foreground font-tamil">தமிழ் (Tamil)</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showTajweedColors}
                  onChange={(event) => setShowTajweedColors(event.target.checked)}
                  className="rounded-sm accent-primary"
                />
                <span className="text-foreground">Tajweed Colors</span>
              </label>
            </div>
          </div>
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
        <div className="max-w-3xl mx-auto w-full space-y-4">
          {verses.map((verse) => {
            const key = `${verse.surah}:${verse.ayah}`;
            const progress = progressMap[key];

            return (
              <AyahItem
                key={key}
                verse={verse}
                fontSize={fontSize}
                showEnglish={showEnglish}
                showTamil={showTamil}
                showTajweedColors={showTajweedColors}
                isCurrentAudio={currentVerse.ayah === verse.ayah}
                isPlaying={isPlaying}
                srsState={progress?.state as SrsState | undefined}
                isSavingProgress={savingAyahs.has(verse.ayah)}
                onPlay={handlePlayVerse}
                onWordClick={handleWordClick}
                onMemorizeToggle={handleMemorizeToggle}
                onAskAi={handleAskAi}
                onOpenMutashabihat={handleOpenMutashabihat}
              />
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

      <AudioBar
        surahNumber={chapter.id}
        totalVerses={chapter.versesCount}
        currentAyahNumber={currentVerse.ayah}
        globalAyahNumber={currentVerse.globalNumber}
        fallbackAudioUrl={currentVerse.audioUrl}
        playIntent={playIntent}
        onPlayingChange={setIsPlaying}
        onNextAyah={() => handleStep(1)}
        onPrevAyah={() => handleStep(-1)}
      />
    </div>
  );
};
