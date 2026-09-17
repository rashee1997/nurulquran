'use client';

import React from 'react';
import { Play, Pause, Bookmark, Sparkles, Check, ArrowRightLeft } from 'lucide-react';
import { QuranWord, Verse } from '@/lib/quran/types';
import { QuranWordItem } from './QuranWord';
import { TajweedSpan } from './TajweedSpan';
import { SrsState } from '@/lib/db';
import { STATE_LABELS } from '@/lib/learning/srs-engine';
import { getMutashabihatForVerse, MutashabihEntry } from '@/lib/quran/mutashabihat';

interface AyahItemProps {
  verse: Verse;
  fontSize: number;
  showEnglish: boolean;
  showTamil: boolean;
  showTajweedColors: boolean;
  isCurrentAudio: boolean;
  isPlaying: boolean;
  srsState?: SrsState;
  onPlay: (verse: Verse) => void;
  onWordClick: (word: QuranWord) => void;
  onMemorizeToggle: (verse: Verse) => void;
  onAskAi: (verse: Verse) => void;
  onOpenMutashabihat?: (entry: MutashabihEntry) => void;
}

export const AyahItem: React.FC<AyahItemProps> = ({
  verse,
  fontSize,
  showEnglish,
  showTamil,
  showTajweedColors,
  isCurrentAudio,
  isPlaying,
  srsState,
  onPlay,
  onWordClick,
  onMemorizeToggle,
  onAskAi,
  onOpenMutashabihat,
}) => {
  const stateMeta = srsState ? STATE_LABELS[srsState] : null;
  const mutashabihEntry = getMutashabihatForVerse(verse.surah, verse.ayah);

  return (
    <div
      id={`ayah-item-${verse.surah}-${verse.ayah}`}
      className={`p-5 rounded-2xl border transition-all duration-200 ${
        isCurrentAudio
          ? 'bg-primary-subtle border-primary shadow-md ring-1 ring-primary/40'
          : 'bg-card border-border hover:border-border-strong'
      }`}
    >
      {/* Top action bar for the Ayah */}
      <div className="flex items-center justify-between gap-2 border-b border-border pb-3 mb-4">
        <div className="flex items-center gap-2">
          {/* Ayah number badge */}
          <span className="w-8 h-8 rounded-full bg-surface-muted text-foreground flex items-center justify-center font-bold text-xs">
            {verse.ayah}
          </span>

          {/* SRS Memorization state badge */}
          {stateMeta ? (
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${stateMeta.bg} ${stateMeta.color}`}>
              {stateMeta.label}
            </span>
          ) : (
            <button
              onClick={() => onMemorizeToggle(verse)}
              className="text-[11px] font-medium text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors px-2 py-0.5 rounded-md hover:bg-primary-subtle"
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span>Add to Hifz</span>
            </button>
          )}

          {/* Mutashabihat Similar Verses Indicator */}
          {mutashabihEntry && onOpenMutashabihat && (
            <button
              onClick={() => onOpenMutashabihat(mutashabihEntry)}
              className="text-[10px] font-bold text-secondary-strong bg-secondary-subtle border border-secondary/30 hover:bg-secondary/20 flex items-center gap-1 transition-all px-2 py-0.5 rounded-md shadow-2xs"
              title="Compare with similar twin verse (Mutashabihat)"
            >
              <ArrowRightLeft className="w-3 h-3 text-secondary" />
              <span className="hidden sm:inline">Mutashabihat</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Quick AI Explanation */}
          <button
            onClick={() => onAskAi(verse)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-surface-hover transition-colors"
            title="Ask AI Tutor about this Ayah"
          >
            <Sparkles className="w-4 h-4" />
          </button>

          {/* Play this Ayah audio */}
          <button
            onClick={() => onPlay(verse)}
            className={`p-1.5 rounded-lg transition-colors ${
              isCurrentAudio && isPlaying
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
            }`}
            title="Play Audio"
          >
            {isCurrentAudio && isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Arabic Text Display */}
      <div className="py-2 text-right dir-rtl leading-loose" dir="rtl">
        {showTajweedColors && verse.tajweed ? (
          <div
            className="font-arabic inline-block select-text"
            style={{ fontSize: `${fontSize}px` }}
          >
            {verse.tajweed.segments.map((seg, sIdx) => (
              <TajweedSpan key={sIdx} segment={seg} enabled={showTajweedColors} />
            ))}
            <span className="text-primary text-sm font-sans mx-2 inline-block">
              ۝{verse.ayah}
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-start flex-row-reverse gap-y-2">
            {verse.words.map((word) => (
              <QuranWordItem
                key={word.id}
                word={word}
                fontSize={fontSize}
                onClick={onWordClick}
              />
            ))}
            <span className="text-primary text-sm font-sans mx-2 inline-block">
              ۝{verse.ayah}
            </span>
          </div>
        )}
      </div>

      {/* Translations */}
      {(showEnglish || showTamil) && (
        <div className="mt-4 pt-3 border-t border-border space-y-2 text-left">
          {showEnglish && verse.translationEn && (
            <p className="text-sm text-foreground leading-relaxed font-sans">
              <span className="text-[11px] font-bold text-muted-foreground mr-2 uppercase tracking-wider">EN</span>
              {verse.translationEn}
            </p>
          )}

          {showTamil && verse.translationTa && (
            <p className="text-sm text-foreground font-tamil leading-relaxed">
              <span className="text-[11px] font-bold text-primary-strong mr-2">தமிழ்</span>
              {verse.translationTa}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
