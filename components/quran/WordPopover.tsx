'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, Check, Bookmark, X } from 'lucide-react';
import { QuranWord } from '@/lib/quran/types';
import { wordAudioCandidates } from '@/lib/quran/word-audio';
import { db } from '@/lib/db';
import { usePreviewAudio } from '@/hooks/use-preview-audio';
import { hasMorphologySource, lookupWordMorphology, type WordMorphology } from '@/lib/quran/morphology';

interface WordPopoverProps {
  word: QuranWord;
  onClose: () => void;
  position?: { x: number; y: number };
}

export const WordPopover: React.FC<WordPopoverProps> = ({ word, onClose, position }) => {
  const [isSaved, setIsSaved] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [pronounceFailed, setPronounceFailed] = useState(false);
  /** Morphology from the corpus, merged over whatever the word record already carries. */
  const [corpus, setCorpus] = useState<WordMorphology | null | 'loading'>(
    hasMorphologySource() ? 'loading' : null
  );

  useEffect(() => {
    if (!hasMorphologySource()) return;
    let active = true;
    lookupWordMorphology(word.surah, word.ayah, word.wordIndex)
      .then((result) => {
        if (active) setCorpus(result);
      })
      .catch(() => {
        if (active) setCorpus(null);
      });
    return () => {
      active = false;
    };
  }, [word.surah, word.ayah, word.wordIndex]);

  const morph = corpus !== 'loading' && corpus ? corpus : null;
  const root = word.root || morph?.root;
  const grammar = word.morphology || morph?.morphology;
  const transliteration = word.transliteration || morph?.transliteration || '';
  const meaningEn = word.translationEn || morph?.en || '';
  const meaningTa = word.translationTa || morph?.ta || '';
  const lemma = morph?.lemma;
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { playingKey, playUrl, speak } = usePreviewAudio();
  const playbackKey = `word:${word.id}`;
  // Read from the shared player rather than mirroring it in local state, so the
  // button cannot claim to be playing something that has already finished.
  const isPlaying = playingKey === playbackKey;

  // Escape closes the sheet, and focus starts on the dismiss control so keyboard and
  // switch users are not left behind the modal.
  useEffect(() => {
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, [onClose]);

  /**
   * Plays the word: the recorded recitation of that exact word when it can be reached,
   * otherwise the Arabic synthesizer. Both go through the shared player, so a previous
   * word never keeps sounding underneath the new one.
   *
   * This used to attempt the record's single `audioUrl` and then hand over to the
   * synthesizer, and it discarded the result of both — so a learner on a machine with no
   * Arabic voice tapped "Pronounce" and heard nothing, with nothing to explain it. Every
   * outcome now either plays audio or reports that it could not.
   */
  const playAudio = useCallback(async (): Promise<void> => {
    setIsPreparing(true);
    setPronounceFailed(false);
    try {
      // Candidates first, keeping any explicit URL the record itself carries at the front.
      const candidates = wordAudioCandidates(word.surah, word.ayah, word.wordIndex);
      if (word.audioUrl && !candidates.includes(word.audioUrl)) {
        candidates.unshift(word.audioUrl);
      }
      if (await playUrl(playbackKey, candidates)) return;

      // Offline, or the clip host is unreachable: the platform synthesizer is all that is
      // left, and it only works where an Arabic voice is installed.
      if (await speak(playbackKey, word.arabic, 'ar-SA')) return;

      setPronounceFailed(true);
    } finally {
      setIsPreparing(false);
    }
  }, [playbackKey, playUrl, speak, word]);

  const handleSaveWord = useCallback(async (): Promise<void> => {
    try {
      // Read-then-merge: `put` used to overwrite the record with `mistakesCount: 0`,
      // silently erasing the learner's mistake history for that word.
      const existing = await db.wordProgress.get(word.id);
      await db.wordProgress.put({
        wordKey: word.id,
        surah: word.surah,
        ayah: word.ayah,
        wordIndex: word.wordIndex,
        arabic: word.arabic,
        memorized: true,
        mistakesCount: existing?.mistakesCount ?? 0,
        lastSeenAt: new Date().toISOString(),
      });
      setIsSaved(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setIsSaved(false), 2000);
    } catch (error) {
      console.error('Failed to save word progress:', error);
    }
  }, [word.arabic, word.ayah, word.id, word.surah, word.wordIndex]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        id={`word-popover-${word.id}`}
        role="dialog"
        aria-modal="true"
        aria-label={`Word ${word.wordIndex} of ayah ${word.surah}:${word.ayah}`}
        className="bg-card border border-border rounded-2xl p-5 w-full max-w-sm shadow-2xl space-y-4"
        style={position ? { position: 'fixed', left: position.x, top: position.y } : undefined}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border pb-3">
          <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-primary-subtle text-primary-strong">
            Word {word.wordIndex} • Ayah {word.surah}:{word.ayah}
          </span>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close word details"
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="text-center py-2 bg-surface rounded-xl border border-border">
          <p className="text-3xl font-arabic text-foreground select-text py-1" dir="rtl" lang="ar">
            {word.arabic}
          </p>
          <p className="text-xs text-muted-foreground font-medium tracking-wide">
            {transliteration}
          </p>
        </div>

        <div className="space-y-2.5 text-sm">
          <div className="flex flex-col">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              English Meaning
            </span>
            <span className="text-foreground font-medium">
              {meaningEn || (corpus === 'loading' ? 'Looking up…' : 'Meaning provided in context')}
            </span>
          </div>

          {meaningTa && (
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                தமிழ் அர்த்தம் (Tamil)
              </span>
              <span className="text-primary-strong font-tamil font-medium">{meaningTa}</span>
            </div>
          )}

          {root && root !== '—' ? (
            <div className="flex items-center justify-between pt-1 border-t border-border">
              <span className="text-xs text-muted-foreground">Linguistic Root (الجذر):</span>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-secondary-subtle text-secondary-strong" dir="rtl" lang="ar">
                {root}
              </span>
            </div>
          ) : (
            <div className="pt-1 border-t border-border text-[11px] text-muted-foreground">
              {corpus === 'loading'
                ? 'Loading the root from the morphology corpus…'
                : 'Root not available for this word on this device.'}
            </div>
          )}

          {lemma && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Lemma:</span>
              <span className="font-arabic text-base text-foreground" dir="rtl" lang="ar">{lemma}</span>
            </div>
          )}

          {grammar && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Grammar:</span>
              <span className="font-medium text-foreground">{grammar}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 pt-2 border-t border-border">
          <button
            type="button"
            onClick={() => void playAudio()}
            disabled={isPreparing}
            aria-busy={isPreparing}
            className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-surface hover:bg-surface-hover border border-border text-foreground text-xs font-semibold transition-colors disabled:opacity-70"
          >
            <Volume2 className={`w-4 h-4 text-primary ${isPlaying ? 'animate-bounce' : ''}`} aria-hidden="true" />
            <span>{isPlaying ? 'Playing…' : isPreparing ? 'Loading…' : 'Pronounce'}</span>
          </button>

          <button
            type="button"
            onClick={() => void handleSaveWord()}
            aria-live="polite"
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
              isSaved
                ? 'bg-primary text-primary-foreground'
                : 'bg-primary-subtle hover:bg-primary/20 text-primary-strong border border-primary/30'
            }`}
          >
            {isSaved ? (
              <>
                <Check className="w-4 h-4" aria-hidden="true" />
                <span>Saved!</span>
              </>
            ) : (
              <>
                <Bookmark className="w-4 h-4" aria-hidden="true" />
                <span>Save to Deck</span>
              </>
            )}
          </button>
        </div>

        {pronounceFailed && (
          <p
            role="status"
            aria-live="polite"
            className="text-[11px] font-medium text-danger-strong bg-danger-subtle border border-danger/30 rounded-lg px-2.5 py-1.5"
          >
            Pronunciation audio could not be played. Check your connection and try again.
          </p>
        )}
      </div>
    </div>
  );
};
