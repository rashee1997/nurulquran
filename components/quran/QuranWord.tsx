'use client';

import React from 'react';
import { QuranWord, TajweedSegment } from '@/lib/quran/types';
import { TajweedSpan } from './TajweedSpan';

interface QuranWordItemProps {
  word: QuranWord;
  fontSize?: number;
  isSelected?: boolean;
  /** Tajweed segments belonging to this word (already filtered by word index). */
  segments?: TajweedSegment[];
  showTajweedColors?: boolean;
  /** The learner has recorded recitation mistakes on this word (weak-spot overlay). */
  hasMistake?: boolean;
  onClick: (word: QuranWord) => void;
}

/**
 * A single tappable Quranic word.
 *
 * The word is a button so the learner can open its morphology, and its Tajweed
 * segments are rendered as plain inline spans inside it. Keeping the segments
 * inline (rather than block-level boxes) is what preserves Arabic letter joining.
 */
export const QuranWordItem: React.FC<QuranWordItemProps> = ({
  word,
  fontSize = 28,
  isSelected = false,
  segments,
  showTajweedColors = false,
  hasMistake = false,
  onClick,
}) => {
  const hasSegments = showTajweedColors && segments !== undefined && segments.length > 0;

  // `lang` is what tells a screen reader to read the word in Arabic. The surrounding document
  // is `lang="en"`, so without it the most important text in the app is announced with an
  // English voice.
  return (
    <button
      type="button"
      id={`word-btn-${word.id}`}
      onClick={(event) => {
        event.stopPropagation();
        onClick(word);
      }}
      lang="ar"
      dir="rtl"
      className={`font-arabic inline-block px-1.5 py-0.5 rounded-lg align-baseline transition-colors duration-150 cursor-pointer ${
        isSelected
          ? 'bg-primary-subtle text-primary-strong ring-2 ring-primary'
          : 'hover:bg-surface-hover text-foreground'
      } ${hasMistake ? 'underline decoration-dotted decoration-danger-strong decoration-2 underline-offset-[6px]' : ''}`}
      style={{ fontSize: `${fontSize}px` }}
      aria-label={`Word ${word.wordIndex} of ayah ${word.surah}:${word.ayah}${
        word.transliteration ? `, ${word.transliteration}` : ''
      }${hasMistake ? '. A recent recitation mistake was recorded on this word.' : ''}. Open word details.`}
      title={word.transliteration ? `${word.transliteration} — tap for meaning and root` : 'Tap for word details'}
    >
      {hasSegments
        ? segments.map((segment, index) => (
            <TajweedSpan key={`${word.id}-seg-${index}`} segment={segment} enabled />
          ))
        : word.arabic}
    </button>
  );
};
