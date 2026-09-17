'use client';

import React, { useState } from 'react';
import { Volume2, Check, Bookmark, X } from 'lucide-react';
import { QuranWord } from '@/lib/quran/types';
import { db } from '@/lib/db';

interface WordPopoverProps {
  word: QuranWord;
  onClose: () => void;
  position?: { x: number; y: number };
}

export const WordPopover: React.FC<WordPopoverProps> = ({ word, onClose }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const playAudio = () => {
    // Generate spoken audio via web speech synthesis or word audio URL if available
    if (word.audioUrl) {
      const audio = new Audio(word.audioUrl);
      setIsPlaying(true);
      audio.play().finally(() => setIsPlaying(false));
    } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      setIsPlaying(true);
      const utterance = new SpeechSynthesisUtterance(word.arabic);
      utterance.lang = 'ar-SA';
      utterance.rate = 0.85;
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => setIsPlaying(false);
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleSaveWord = async () => {
    try {
      await db.wordProgress.put({
        wordKey: word.id,
        surah: word.surah,
        ayah: word.ayah,
        wordIndex: word.wordIndex,
        arabic: word.arabic,
        memorized: true,
        mistakesCount: 0,
        lastSeenAt: new Date().toISOString(),
      });
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    } catch (e) {
      console.error('Failed to save word progress:', e);
    }
  };

  return (
    <div
      id={`word-popover-${word.id}`}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 w-full max-w-sm shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400">
            Word {word.wordIndex} • Ayah {word.surah}:{word.ayah}
          </span>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Arabic Display */}
        <div className="text-center py-2 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
          <p className="text-3xl font-arabic text-slate-900 dark:text-slate-100 select-none py-1">
            {word.arabic}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium tracking-wide">
            {word.transliteration}
          </p>
        </div>

        {/* Translation details */}
        <div className="space-y-2.5 text-sm">
          <div className="flex flex-col">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">English Meaning</span>
            <span className="text-slate-800 dark:text-slate-200 font-medium">{word.translationEn || 'Meaning provided in context'}</span>
          </div>

          {word.translationTa && (
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider font-tamil">தமிழ் அர்த்தம் (Tamil)</span>
              <span className="text-emerald-700 dark:text-emerald-300 font-tamil font-medium">{word.translationTa}</span>
            </div>
          )}

          {word.root && word.root !== '—' && (
            <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400">Linguistic Root (الجذر):</span>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400">
                {word.root}
              </span>
            </div>
          )}

          {word.morphology && (
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Grammar:</span>
              <span className="font-medium text-slate-700 dark:text-slate-300">{word.morphology}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={playAudio}
            disabled={isPlaying}
            className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold transition-colors"
          >
            <Volume2 className={`w-4 h-4 text-emerald-600 ${isPlaying ? 'animate-bounce' : ''}`} />
            <span>{isPlaying ? 'Playing...' : 'Pronounce'}</span>
          </button>

          <button
            onClick={handleSaveWord}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
              isSaved
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50'
            }`}
          >
            {isSaved ? (
              <>
                <Check className="w-4 h-4" />
                <span>Saved!</span>
              </>
            ) : (
              <>
                <Bookmark className="w-4 h-4" />
                <span>Save to Deck</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
