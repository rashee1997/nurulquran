'use client';

import React, { useMemo } from 'react';
import { Play, Pause, Bookmark, Sparkles, ArrowRightLeft, Loader2 } from 'lucide-react';
import { QuranWord, Verse } from '@/lib/quran/types';
import { QuranWordItem } from './QuranWord';
import { SrsState } from '@/lib/db';
import { STATE_LABELS } from '@/lib/learning/srs-engine';
import { getMutashabihatForVerse, MutashabihEntry } from '@/lib/quran/mutashabihat';
import { groupSegmentsByWord } from '@/lib/quran/tajweed';

interface AyahItemProps {
  verse: Verse;
  fontSize: number;
  showEnglish: boolean;
  showTamil: boolean;
  showTajweedColors: boolean;
  isCurrentAudio: boolean;
  isPlaying: boolean;
  srsState?: SrsState;
  /** True while this ayah's memorisation toggle is being written to the database. */
  isSavingProgress?: boolean;
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
  isSavingProgress = false,
  onPlay,
  onWordClick,
  onMemorizeToggle,
  onAskAi,
  onOpenMutashabihat,
}) => {
  const stateMeta = srsState ? STATE_LABELS[srsState] : null;
  const mutashabihEntry = getMutashabihatForVerse(verse.surah, verse.ayah);

  // Words stay individually tappable in both modes; Tajweed colouring is applied
  // per word from the segments that belong to it.
  const tajweedByWord = useMemo(
    () => (verse.tajweed ? groupSegmentsByWord(verse.tajweed.segments) : []),
    [verse.tajweed]
  );

  const isInHifz = Boolean(srsState);

  return (
    <div
      id={`ayah-item-${verse.surah}-${verse.ayah}`}
      className={`p-5 rounded-2xl border transition-colors duration-200 ${
        isCurrentAudio
          ? 'bg-primary-subtle border-primary shadow-md ring-1 ring-primary/40'
          : 'bg-card border-border hover:border-border-strong'
      }`}
    >
      {/* Top action bar for the Ayah */}
      <div className="flex items-center justify-between gap-2 border-b border-border pb-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-full bg-surface-muted text-foreground flex items-center justify-center font-bold text-xs">
            {verse.ayah}
          </span>

          {stateMeta ? (
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${stateMeta.bg} ${stateMeta.color}`}>
              {stateMeta.label}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onMemorizeToggle(verse)}
              disabled={isSavingProgress}
              aria-busy={isSavingProgress}
              className="text-[11px] font-medium text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors px-2 py-0.5 rounded-md hover:bg-primary-subtle disabled:opacity-60"
            >
              {isSavingProgress ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Bookmark className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>{isSavingProgress ? 'Saving…' : 'Add to Hifz'}</span>
            </button>
          )}

          {mutashabihEntry && onOpenMutashabihat && (
            <button
              type="button"
              onClick={() => onOpenMutashabihat(mutashabihEntry)}
              className="text-[10px] font-bold text-secondary-strong bg-secondary-subtle border border-secondary/30 hover:bg-secondary/20 flex items-center gap-1 transition-colors px-2 py-0.5 rounded-md shadow-2xs"
              title="Compare with a similar twin verse (Mutashabihat)"
            >
              <ArrowRightLeft className="w-3 h-3 text-secondary" aria-hidden="true" />
              <span className="hidden sm:inline">Mutashabihat</span>
            </button>
          )}

          {isInHifz && (
            <button
              type="button"
              onClick={() => onMemorizeToggle(verse)}
              disabled={isSavingProgress}
              className="text-[10px] font-medium text-muted-foreground hover:text-danger-strong transition-colors px-2 py-0.5 rounded-md hover:bg-danger-subtle"
              title="Remove this ayah from your memorisation queue"
            >
              Remove from Hifz
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onAskAi(verse)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-surface-hover transition-colors"
            aria-label={`Ask the study assistant about ayah ${verse.surah}:${verse.ayah}`}
            title={`Ask the study assistant about ayah ${verse.surah}:${verse.ayah}`}
          >
            <Sparkles className="w-4 h-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => onPlay(verse)}
            className={`p-1.5 rounded-lg transition-colors ${
              isCurrentAudio && isPlaying
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
            }`}
            aria-label={
              isCurrentAudio && isPlaying
                ? `Pause recitation of ayah ${verse.surah}:${verse.ayah}`
                : `Play recitation of ayah ${verse.surah}:${verse.ayah}`
            }
            title={isCurrentAudio && isPlaying ? 'Pause audio' : 'Play audio'}
          >
            {isCurrentAudio && isPlaying ? (
              <Pause className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Play className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Arabic Text Display */}
      <div className="py-2 text-right dir-rtl leading-loose" dir="rtl" lang="ar">
        <div className="font-arabic select-text leading-loose" style={{ fontSize: `${fontSize}px` }}>
          {verse.words.map((word, index) => (
            <React.Fragment key={word.id}>
              <QuranWordItem
                word={word}
                fontSize={fontSize}
                segments={tajweedByWord[index]}
                showTajweedColors={showTajweedColors}
                onClick={onWordClick}
              />
              {index < verse.words.length - 1 ? ' ' : null}
            </React.Fragment>
          ))}
          <span className="text-primary text-sm font-sans mx-2 align-middle" aria-hidden="true">
            ۝{verse.ayah}
          </span>
          <span className="sr-only">End of ayah {verse.ayah}.</span>
        </div>
      </div>

      {verse.provenance === 'verified-offline' && (
        <p className="mt-3 text-[10px] font-semibold text-secondary-strong bg-secondary-subtle border border-secondary/30 rounded-md px-2 py-1 inline-block">
          Verified offline copy — shown because the network text service was unreachable.
        </p>
      )}

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
