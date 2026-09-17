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
        className="bg-card border border-border rounded-2xl p-5 w-full max-w-sm shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-primary-subtle text-primary-strong">
            Word {word.wordIndex} • Ayah {word.surah}:{word.ayah}
          </span>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Arabic Display */}
        <div className="text-center py-2 bg-surface rounded-xl border border-border">
          <p className="text-3xl font-arabic text-foreground select-none py-1">
            {word.arabic}
          </p>
          <p className="text-xs text-muted-foreground font-medium tracking-wide">
            {word.transliteration}
          </p>
        </div>

        {/* Translation details */}
        <div className="space-y-2.5 text-sm">
          <div className="flex flex-col">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">English Meaning</span>
            <span className="text-foreground font-medium">{word.translationEn || 'Meaning provided in context'}</span>
          </div>

          {word.translationTa && (
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider font-tamil">தமிழ் அர்த்தம் (Tamil)</span>
              <span className="text-primary-strong font-tamil font-medium">{word.translationTa}</span>
            </div>
          )}

          {word.root && word.root !== '—' && (
            <div className="flex items-center justify-between pt-1 border-t border-border">
              <span className="text-xs text-muted-foreground">Linguistic Root (الجذر):</span>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-secondary-subtle text-secondary-strong">
                {word.root}
              </span>
            </div>
          )}

          {word.morphology && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Grammar:</span>
              <span className="font-medium text-foreground">{word.morphology}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t border-border">
          <button
            onClick={playAudio}
            disabled={isPlaying}
            className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-surface hover:bg-surface-hover border border-border text-foreground text-xs font-semibold transition-colors"
          >
            <Volume2 className={`w-4 h-4 text-primary ${isPlaying ? 'animate-bounce' : ''}`} />
            <span>{isPlaying ? 'Playing...' : 'Pronounce'}</span>
          </button>

          <button
            onClick={handleSaveWord}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
              isSaved
                ? 'bg-primary text-primary-foreground'
                : 'bg-primary-subtle hover:bg-primary/20 text-primary-strong border border-primary/30'
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
