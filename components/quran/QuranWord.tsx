'use client';

import React from 'react';
import { QuranWord } from '@/lib/quran/types';

interface QuranWordItemProps {
  word: QuranWord;
  fontSize?: number;
  isSelected?: boolean;
  onClick: (word: QuranWord) => void;
}

export const QuranWordItem: React.FC<QuranWordItemProps> = ({
  word,
  fontSize = 28,
  isSelected = false,
  onClick,
}) => {
  return (
    <button
      id={`word-btn-${word.id}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick(word);
      }}
      className={`font-arabic inline-block px-1.5 py-0.5 rounded-lg transition-all duration-150 cursor-pointer ${
        isSelected
          ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-200 ring-2 ring-emerald-500'
          : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-900 dark:text-slate-100'
      }`}
      style={{ fontSize: `${fontSize}px` }}
      title={`${word.transliteration} - Click for English/Tamil meaning & root`}
    >
      {word.arabic}
    </button>
  );
};
