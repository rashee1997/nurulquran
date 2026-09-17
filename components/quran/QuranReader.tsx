'use client';

import React, { useState } from 'react';
import { Chapter, QuranWord, Verse } from '@/lib/quran/types';
import { AyahItem } from './AyahItem';
import { WordPopover } from './WordPopover';
import { AudioBar } from './AudioBar';
import { db, SrsState, VerseProgress } from '@/lib/db';
import { initializeVerseProgress } from '@/lib/learning/srs-engine';
import { Settings2, Volume2, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface QuranReaderProps {
  chapter: Chapter;
  verses: Verse[];
  verseProgressMap?: Record<string, VerseProgress>;
  onOpenAiTutor?: (contextPrompt?: string) => void;
}

export const QuranReader: React.FC<QuranReaderProps> = ({
  chapter,
  verses,
  verseProgressMap = {},
  onOpenAiTutor,
}) => {
  const [selectedWord, setSelectedWord] = useState<QuranWord | null>(null);
  const [fontSize, setFontSize] = useState(30);
  const [showEnglish, setShowEnglish] = useState(true);
  const [showTamil, setShowTamil] = useState(true);
  const [showTajweedColors, setShowTajweedColors] = useState(true);
  const [currentAudioIndex, setCurrentAudioIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const currentVerse = verses[currentAudioIndex] || verses[0];

  const handlePlayVerse = (v: Verse) => {
    const idx = verses.findIndex(item => item.ayah === v.ayah);
    if (idx !== -1) {
      if (currentAudioIndex === idx && isPlaying) {
        setIsPlaying(false);
      } else {
        setCurrentAudioIndex(idx);
        setIsPlaying(true);
      }
    }
  };

  const handleMemorizeToggle = async (v: Verse) => {
    const key = `${v.surah}:${v.ayah}`;
    const existing = await db.verseProgress.get(key);
    if (!existing) {
      const init = initializeVerseProgress(v.surah, v.ayah);
      init.state = 'learning';
      await db.verseProgress.put(init);
    } else {
      await db.verseProgress.delete(key);
    }
  };

  const handleAskAi = (v: Verse) => {
    if (onOpenAiTutor) {
      onOpenAiTutor(`Please explain Surah ${chapter.nameSimple} (${v.surah}:${v.ayah}) in detail:
Arabic: "${v.textUthmani}"
English: "${v.translationEn}"
Tamil: "${v.translationTa}"
Explain the root words, linguistic context, and practical spiritual reflections.`);
    }
  };

  return (
    <div id="quran-reader-container" className="flex flex-col min-h-screen pb-24">
      {/* Chapter Banner */}
      <div className="w-full bg-linear-to-b from-emerald-900 via-emerald-800 to-emerald-950 text-white py-10 px-4 sm:px-6 rounded-3xl mb-8 shadow-xl relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]" />
        
        <div className="max-w-3xl mx-auto text-center relative z-10 space-y-3">
          <div className="flex items-center justify-between text-xs text-emerald-200 font-medium pb-2">
            <Link
              href={`/quran/${Math.max(1, chapter.id - 1)}`}
              className={`flex items-center gap-1 hover:text-white transition-colors ${chapter.id === 1 ? 'opacity-40 pointer-events-none' : ''}`}
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous Surah</span>
            </Link>

            <span className="px-3 py-1 rounded-full bg-emerald-700/60 uppercase tracking-widest text-[10px] font-bold">
              Surah {chapter.id} • {chapter.revelationPlace === 'makkah' ? 'Makki' : 'Madani'}
            </span>

            <Link
              href={`/quran/${Math.min(114, chapter.id + 1)}`}
              className={`flex items-center gap-1 hover:text-white transition-colors ${chapter.id === 114 ? 'opacity-40 pointer-events-none' : ''}`}
            >
              <span>Next Surah</span>
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          <h1 className="text-4xl sm:text-5xl font-arabic text-amber-200 py-1">
            {chapter.nameArabic}
          </h1>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            {chapter.nameSimple}
            <span className="text-sm font-normal text-emerald-200 ml-2">({chapter.nameEnglish})</span>
          </h2>
          <p className="text-xs text-emerald-200/90 font-medium">
            {chapter.versesCount} Verses • Complete with English & Tamil Translations
          </p>

          {/* Quick Reader Action Bar */}
          <div className="flex items-center justify-center gap-3 pt-3 flex-wrap">
            <button
              onClick={() => handlePlayVerse(verses[0])}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-amber-400 hover:bg-amber-300 text-emerald-950 text-xs font-bold transition-all shadow-md active:scale-95"
            >
              <Volume2 className="w-4 h-4" />
              <span>Listen from Start</span>
            </button>

            {onOpenAiTutor && (
              <button
                onClick={() => onOpenAiTutor(`Let's study Surah ${chapter.nameSimple} (${chapter.id}). Can you give me an overview of its themes, historical context, and key vocabulary?`)}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold backdrop-blur-xs transition-all border border-white/20"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>AI Tutor Insights</span>
              </button>
            )}

            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs backdrop-blur-xs transition-colors border border-white/20"
              title="Display Settings"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Reader Settings Drawer/Bar */}
      {showSettings && (
        <div className="max-w-3xl mx-auto w-full p-4 mb-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-md space-y-4 animate-in slide-in-from-top-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800 pb-2">
            <span>Reader Preferences</span>
            <span className="text-slate-400">Customized locally</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            {/* Font size */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Arabic Font Size:</span>
                <span className="font-bold">{fontSize}px</span>
              </div>
              <input
                type="range"
                min={22}
                max={46}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-full accent-emerald-600 cursor-pointer"
              />
            </div>

            {/* Translation & Tajweed Toggles */}
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showEnglish}
                  onChange={(e) => setShowEnglish(e.target.checked)}
                  className="rounded-sm accent-emerald-600"
                />
                <span className="text-slate-700 dark:text-slate-300">English (Sahih)</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showTamil}
                  onChange={(e) => setShowTamil(e.target.checked)}
                  className="rounded-sm accent-emerald-600"
                />
                <span className="text-slate-700 dark:text-slate-300">தமிழ் (Tamil)</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showTajweedColors}
                  onChange={(e) => setShowTajweedColors(e.target.checked)}
                  className="rounded-sm accent-emerald-600"
                />
                <span className="text-slate-700 dark:text-slate-300">Tajweed Colors</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Bismillah Header (for all Surahs except 9 and 1) */}
      {chapter.bismillahPre && (
        <div className="text-center py-6 mb-4">
          <p className="text-3xl font-arabic text-slate-800 dark:text-slate-200">
            بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium">
            In the name of Allah, the Entirely Merciful, the Especially Merciful.
          </p>
        </div>
      )}

      {/* Verses List */}
      <div className="max-w-3xl mx-auto w-full space-y-4">
        {verses.map((v) => {
          const key = `${v.surah}:${v.ayah}`;
          const progress = verseProgressMap[key];

          return (
            <AyahItem
              key={key}
              verse={v}
              fontSize={fontSize}
              showEnglish={showEnglish}
              showTamil={showTamil}
              showTajweedColors={showTajweedColors}
              isCurrentAudio={currentVerse.ayah === v.ayah}
              isPlaying={isPlaying}
              srsState={progress?.state}
              onPlay={handlePlayVerse}
              onWordClick={(word) => setSelectedWord(word)}
              onMemorizeToggle={handleMemorizeToggle}
              onAskAi={handleAskAi}
            />
          );
        })}
      </div>

      {/* Word Popover modal */}
      {selectedWord && (
        <WordPopover
          word={selectedWord}
          onClose={() => setSelectedWord(null)}
        />
      )}

      {/* Persistent Audio Player Bar */}
      {verses.length > 0 && (
        <AudioBar
          currentAyahNumber={currentVerse.ayah}
          surahNumber={chapter.id}
          totalVerses={chapter.versesCount}
          audioUrl={currentVerse.audioUrl}
          onNextAyah={() => {
            if (currentAudioIndex < verses.length - 1) {
              setCurrentAudioIndex(prev => prev + 1);
            }
          }}
          onPrevAyah={() => {
            if (currentAudioIndex > 0) {
              setCurrentAudioIndex(prev => prev - 1);
            }
          }}
        />
      )}
    </div>
  );
};
