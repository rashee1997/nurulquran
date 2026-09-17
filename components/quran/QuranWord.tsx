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
          ? 'bg-primary-subtle text-primary-strong ring-2 ring-primary'
          : 'hover:bg-surface-hover text-foreground'
      }`}
      style={{ fontSize: `${fontSize}px` }}
      title={`${word.transliteration} - Click for English/Tamil meaning & root`}
    >
      {word.arabic}
    </button>
  );
};
