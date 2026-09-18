'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Play, Pause, Bookmark, BookmarkCheck, Sparkles, ArrowRightLeft, Loader2, StickyNote, Brain } from 'lucide-react';
import { QuranWord, Verse } from '@/lib/quran/types';
import { QuranWordItem } from './QuranWord';
import { SrsState } from '@/lib/db';
import { STATE_LABELS } from '@/lib/learning/srs-engine';
import { getMutashabihatForVerse, MutashabihEntry } from '@/lib/quran/mutashabihat';
import { countSegmentWords, groupSegmentsByWord } from '@/lib/quran/tajweed';

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
  /** Bookmark state and handler; omitted when the surrounding view has no library. */
  isBookmarked?: boolean;
  onToggleBookmark?: (verse: Verse) => void;
  /** Existing note text, and the save handler (empty text deletes the note). */
  noteText?: string;
  onSaveNote?: (verse: Verse, text: string) => Promise<void> | void;
  /** Index of the word currently being recited, for word-synced playback. */
  activeWordIndex?: number | null;
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
  isBookmarked = false,
  onToggleBookmark,
  noteText,
  onSaveNote,
  activeWordIndex = null,
}) => {
  const stateMeta = srsState ? STATE_LABELS[srsState] : null;
  const [noteOpen, setNoteOpen] = useState(false);
  const [draft, setDraft] = useState(noteText ?? '');
  const [savingNote, setSavingNote] = useState(false);

  // A note edited elsewhere (the Library page) replaces the draft when the editor is closed.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs the closed editor's draft to an external note edited elsewhere (e.g. the Library page)
    if (!noteOpen) setDraft(noteText ?? '');
  }, [noteText, noteOpen]);

  const submitNote = async (): Promise<void> => {
    if (!onSaveNote) return;
    setSavingNote(true);
    try {
      await onSaveNote(verse, draft);
      setNoteOpen(false);
    } finally {
      setSavingNote(false);
    }
  };
  const mutashabihEntry = getMutashabihatForVerse(verse.surah, verse.ayah);

  // Words stay individually tappable in both modes; Tajweed colouring is applied
  // per word from the segments that belong to it.
  const tajweedByWord = useMemo(
    () => (verse.tajweed ? groupSegmentsByWord(verse.tajweed.segments) : []),
    [verse.tajweed]
  );

  /**
   * Colour is only applied when the segment indices describe the same word list that is
   * rendered.
   *
   * The segment list and `verse.words` are produced by two different tokenizers over the same
   * verse, and the reader pairs them by position. If they ever disagree, every colour after
   * the divergence would be attached to the wrong word and would teach the wrong rule. An
   * uncoloured verse is honest; a mis-coloured one is not, so the mismatch disables colouring
   * and is reported rather than rendered.
   */
  const tajweedAligned = useMemo(() => {
    if (!verse.tajweed) return false;
    return countSegmentWords(verse.tajweed.segments) === verse.words.length;
  }, [verse.tajweed, verse.words.length]);

  useEffect(() => {
    if (!verse.tajweed || tajweedAligned) return;
    console.warn(
      `Tajweed segments for ${verse.surah}:${verse.ayah} describe a different word count than the rendered verse; colouring is disabled for it.`
    );
  }, [verse.tajweed, verse.surah, verse.ayah, tajweedAligned]);

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
                <Brain className="w-3.5 h-3.5" aria-hidden="true" />
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
          {onToggleBookmark && (
            <button
              type="button"
              onClick={() => onToggleBookmark(verse)}
              aria-pressed={isBookmarked}
              className={`p-1.5 rounded-lg transition-colors ${
                isBookmarked
                  ? 'text-secondary-strong bg-secondary-subtle'
                  : 'text-muted-foreground hover:text-secondary-strong hover:bg-surface-hover'
              }`}
              aria-label={isBookmarked ? `Remove bookmark from ayah ${verse.surah}:${verse.ayah}` : `Bookmark ayah ${verse.surah}:${verse.ayah}`}
              title={isBookmarked ? 'Remove bookmark' : 'Bookmark this ayah'}
            >
              {isBookmarked ? (
                <BookmarkCheck className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Bookmark className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          )}

          {onSaveNote && (
            <button
              type="button"
              onClick={() => setNoteOpen((open) => !open)}
              aria-expanded={noteOpen}
              className={`p-1.5 rounded-lg transition-colors ${
                noteText
                  ? 'text-info-strong bg-info-subtle'
                  : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
              }`}
              aria-label={noteText ? `Edit your note on ayah ${verse.surah}:${verse.ayah}` : `Add a note to ayah ${verse.surah}:${verse.ayah}`}
              title={noteText ? 'Edit note' : 'Add a note'}
            >
              <StickyNote className="w-4 h-4" aria-hidden="true" />
            </button>
          )}

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
                showTajweedColors={showTajweedColors && tajweedAligned}
                isSelected={activeWordIndex !== null && isCurrentAudio && activeWordIndex === word.wordIndex}
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

      {/* Note: shown when present, editable inline. */}
      {onSaveNote && (noteOpen || noteText) && (
        <div className="mt-4 pt-3 border-t border-border space-y-2 text-left">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-info-strong uppercase tracking-wider flex items-center gap-1">
              <StickyNote className="w-3 h-3" aria-hidden="true" />
              Your note
            </span>
            {!noteOpen && (
              <button
                type="button"
                onClick={() => setNoteOpen(true)}
                className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
              >
                Edit
              </button>
            )}
          </div>
          {noteOpen ? (
            <div className="space-y-2">
              <label htmlFor={`note-${verse.surah}-${verse.ayah}`} className="sr-only">
                Note for ayah {verse.surah}:{verse.ayah}
              </label>
              <textarea
                id={`note-${verse.surah}-${verse.ayah}`}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={3}
                maxLength={20_000}
                placeholder="What did you understand from this ayah?"
                className="w-full text-sm p-3 rounded-xl bg-surface border border-border text-foreground placeholder:text-muted-foreground outline-hidden focus:ring-2 focus:ring-primary/40"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void submitNote()}
                  disabled={savingNote}
                  className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-60"
                >
                  {savingNote ? 'Saving…' : draft.trim().length === 0 && noteText ? 'Delete note' : 'Save note'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(noteText ?? '');
                    setNoteOpen(false);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-surface border border-border text-foreground text-xs font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{noteText}</p>
          )}
        </div>
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
