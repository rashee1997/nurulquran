'use client';

import React from 'react';
import { Play, Pause, Bookmark, Sparkles, Check } from 'lucide-react';
import { QuranWord, Verse } from '@/lib/quran/types';
import { QuranWordItem } from './QuranWord';
import { TajweedSpan } from './TajweedSpan';
import { SrsState } from '@/lib/db';
import { STATE_LABELS } from '@/lib/learning/srs-engine';

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
}) => {
  const stateMeta = srsState ? STATE_LABELS[srsState] : null;

  return (
    <div
      id={`ayah-item-${verse.surah}-${verse.ayah}`}
      className={`p-5 rounded-2xl border transition-all duration-200 ${
        isCurrentAudio
          ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700/60 shadow-md ring-1 ring-emerald-400'
          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
      }`}
    >
      {/* Top action bar for the Ayah */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
        <div className="flex items-center gap-2">
          {/* Ayah number badge */}
          <span className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold text-xs">
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
              className="text-[11px] font-medium text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-1 transition-colors px-2 py-0.5 rounded-md hover:bg-emerald-50 dark:hover:bg-emerald-950"
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span>Add to Hifz</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Quick AI Explanation */}
          <button
            onClick={() => onAskAi(verse)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Ask AI Tutor about this Ayah"
          >
            <Sparkles className="w-4 h-4" />
          </button>

          {/* Play this Ayah audio */}
          <button
            onClick={() => onPlay(verse)}
            className={`p-1.5 rounded-lg transition-colors ${
              isCurrentAudio && isPlaying
                ? 'bg-emerald-600 text-white'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
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
            <span className="text-emerald-600 dark:text-emerald-400 text-sm font-sans mx-2 inline-block">
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
            <span className="text-emerald-600 dark:text-emerald-400 text-sm font-sans mx-2 inline-block">
              ۝{verse.ayah}
            </span>
          </div>
        )}
      </div>

      {/* Translations */}
      {(showEnglish || showTamil) && (
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-2 text-left">
          {showEnglish && verse.translationEn && (
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-sans">
              <span className="text-[11px] font-bold text-slate-400 mr-2 uppercase tracking-wider">EN</span>
              {verse.translationEn}
            </p>
          )}

          {showTamil && verse.translationTa && (
            <p className="text-sm text-slate-800 dark:text-slate-200 font-tamil leading-relaxed">
              <span className="text-[11px] font-bold text-emerald-600 mr-2">தமிழ்</span>
              {verse.translationTa}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
