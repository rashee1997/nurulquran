'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Volume2, Play, Square, Repeat, Turtle, Infinity as InfinityIcon } from 'lucide-react';
import { usePronunciation } from '@/hooks/use-pronunciation';
import {
  lettersOfText,
  pronunciationItems,
  pronunciationSource,
  type Pronunciation,
  type PronunciationItem,
} from '@/lib/learning/pronunciation';
import type { RecitationSpan } from '@/lib/quran/word-audio';
import { showToast } from '@/lib/ui/toast';

export interface PronunciationPhrase {
  id: string;
  /** What this text is, e.g. "Activity text" or "Verse quoted above". */
  label: string;
  arabic: string;
  /** Verified position of this text, when the activity knows it. */
  anchor?: RecitationSpan;
}

interface PronunciationLabProps {
  phrases: PronunciationPhrase[];
  className?: string;
}

interface ResolvedPhrase {
  resolution: Pronunciation;
  /** The recorded words (or letters) of this text, in order. */
  items: PronunciationItem[];
  /** Recorded letters the text contains — the fallback when the text has no recording itself. */
  letterItems: PronunciationItem[];
}

type Phase = 'idle' | 'playing' | 'repeat';

/** How long the learner gets to repeat a word, at normal and slowed pace. */
const REPEAT_GAP_MS = 2200;
const REPEAT_GAP_SLOW_MS = 3200;
/** Granularity of the cancellable wait, and of the countdown shown to the learner. */
const TICK_MS = 200;

/** Small labelled toggle used by the control row. */
const LabToggle: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  hint: string;
}> = ({ active, onClick, icon: Icon, label, hint }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    title={hint}
    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold transition-colors ${
      active
        ? 'bg-secondary-subtle border-secondary/50 text-secondary-strong'
        : 'bg-surface border-border text-muted-foreground hover:text-foreground hover:bg-surface-hover'
    }`}
  >
    <Icon className="w-3.5 h-3.5" aria-hidden="true" />
    <span>{label}</span>
  </button>
);

/**
 * Manual pronunciation practice for a lesson — no AI, no microphone, no account.
 *
 * A learner has to be able to hear the Arabic *before* reciting it, and to hear any single word
 * again on demand. The Quran reader already did that well; the lessons did not, because their only
 * audio was one button that fell through to the platform speech engine (no Arabic voice on most
 * desktops) and then to a metered AI voice, which in practice produced silence — leaving the AI
 * Recitation Guide as the only way to practise, and it may be unconfigured, rate-limited, or simply
 * unavailable.
 *
 * Everything here plays a real recording, resolved by `lib/learning/pronunciation`, and the badge
 * says which kind: a verified Qur'an run, letter recordings, or — reported plainly — nothing.
 *
 * Three modes matter for practice:
 *
 *  - **Play phrase** recites word by word, highlighting each word as it sounds, so eye and ear stay
 *    together.
 *  - **Repeat after me** puts a pause after every word, which is exactly what a `listen_repeat`
 *    activity asks for: the learner recites into the gap.
 *  - **Slow** replays the same recording at 0.75 speed with pitch preserved, which is how a
 *    difficult makhraj becomes audible, and lengthens the repeat gap to match.
 *
 * Tapping any word always plays that word alone, at the selected speed. When the text itself has no
 * recording (a mnemonic such as "قُطْبُ جَدّ"), the panel says so and offers the recorded letters it
 * is built from — as letters, because that is honestly what they are.
 */
export const PronunciationLab: React.FC<PronunciationLabProps> = ({ phrases, className = '' }) => {
  const { resolve, playItem, stop } = usePronunciation();

  const [resolved, setResolved] = useState<Record<string, ResolvedPhrase>>({});
  const [activePhraseId, setActivePhraseId] = useState<string | null>(phrases[0]?.id ?? null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [slow, setSlow] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [loop, setLoop] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  /** Identifies the current run; bumping it cancels every pending step of the previous one. */
  const runRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rate = slow ? 0.75 : 1;
  const repeatGapMs = slow ? REPEAT_GAP_SLOW_MS : REPEAT_GAP_MS;

  const activePhrase = useMemo(
    () => phrases.find((phrase) => phrase.id === activePhraseId) ?? phrases[0],
    [activePhraseId, phrases]
  );
  const current = activePhrase ? resolved[activePhrase.id] : undefined;

  const cancelRun = useCallback((): void => {
    runRef.current += 1;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPhase('idle');
    setSecondsLeft(0);
  }, []);

  const halt = useCallback((): void => {
    cancelRun();
    setActiveIndex(null);
    stop();
  }, [cancelRun, stop]);

  // Resolve every phrase once. A lesson has at most two, and the lookup behind them is cached, so
  // switching between them is instant.
  useEffect(() => {
    let cancelled = false;

    const resolveAll = async (): Promise<void> => {
      const entries = await Promise.all(
        phrases.map(async (phrase) => {
          const resolution = await resolve(phrase.arabic, phrase.anchor);
          const letterItems: PronunciationItem[] = lettersOfText(phrase.arabic).map((meta) => ({
            key: `letter:${meta.id}`,
            text: meta.letter,
            sources: [meta.audioUrl],
          }));
          return [phrase.id, { resolution, items: pronunciationItems(resolution), letterItems }] as const;
        })
      );
      if (cancelled) return;
      setResolved(Object.fromEntries(entries));
    };

    void resolveAll();
    return () => {
      cancelled = true;
    };
  }, [phrases, resolve]);

  // A run must never outlive the panel.
  useEffect(
    () => () => {
      runRef.current += 1;
      if (timerRef.current) clearTimeout(timerRef.current);
      stop();
    },
    [stop]
  );

  /**
   * Moving to the next activity keeps the panel mounted but replaces its text, so the phrase
   * selection and any playing state are reset for the new one. Resetting during render (rather
   * than from an effect) is React's documented pattern for deriving state from changed props: it
   * takes effect in the same commit, with no intermediate frame of the old activity's chips.
   */
  const phrasesKey = phrases.map((phrase) => `${phrase.id}:${phrase.arabic}`).join('|');
  const [lastPhrasesKey, setLastPhrasesKey] = useState(phrasesKey);
  if (phrasesKey !== lastPhrasesKey) {
    setLastPhrasesKey(phrasesKey);
    setActivePhraseId(phrases[0]?.id ?? null);
    setActiveIndex(null);
    setPhase('idle');
    setSecondsLeft(0);
  }

  // A clip left playing under a question the learner has already answered is confusing and hard to
  // place, so the run is cancelled when the text changes. This only touches the player and the
  // pending timer — the state reset above already happened during render.
  useEffect(() => {
    runRef.current += 1;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    stop();
  }, [phrasesKey, stop]);

  /** Cancellable pause, so Stop interrupts a repeat gap instead of waiting it out. */
  const pause = useCallback((ms: number, runId: number): Promise<void> => {
    return new Promise((resolvePause) => {
      const deadline = Date.now() + ms;
      const tick = (): void => {
        if (runRef.current !== runId) {
          resolvePause();
          return;
        }
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
          setSecondsLeft(0);
          resolvePause();
          return;
        }
        setSecondsLeft(Math.ceil(remaining / 1000));
        timerRef.current = setTimeout(tick, TICK_MS);
      };
      tick();
    });
  }, []);

  const playFrom = useCallback(
    async (items: PronunciationItem[], startIndex: number): Promise<void> => {
      if (items.length === 0) return;
      cancelRun();
      const runId = runRef.current;
      setPhase('playing');

      let index = startIndex;
      let failures = 0;

      for (;;) {
        if (runRef.current !== runId) return;
        if (index >= items.length) {
          if (!loop) break;
          index = 0;
        }

        const item = items[index];
        setActiveIndex(index);
        const played = await playItem(`lab:${runId}:${item.key}`, item, { rate });
        if (runRef.current !== runId) return;
        if (!played) failures += 1;

        index += 1;
        if (repeat && index < items.length) {
          setPhase('repeat');
          await pause(repeatGapMs, runId);
          setPhase('playing');
        }
      }

      setActiveIndex(null);
      setPhase('idle');
      if (failures > 0) {
        showToast(
          failures === 1
            ? 'One clip could not be played. Check the connection and try again.'
            : `${failures} clips could not be played. Check the connection and try again.`,
          'error'
        );
      }
    },
    [cancelRun, loop, pause, playItem, rate, repeat, repeatGapMs]
  );

  const playSingle = useCallback(
    async (items: PronunciationItem[], index: number): Promise<void> => {
      if (!items[index]) return;
      cancelRun();
      const runId = runRef.current;
      setPhase('playing');
      setActiveIndex(index);
      const played = await playItem(`lab:${runId}:${items[index].key}`, items[index], { rate });
      if (runRef.current !== runId) return;
      setActiveIndex(null);
      setPhase('idle');
      if (!played) showToast('That clip could not be played. Check the connection.', 'error');
    },
    [cancelRun, playItem, rate]
  );

  if (!activePhrase) return null;

  const source = current ? pronunciationSource(current.resolution) : null;
  const recordedItems = current?.items ?? [];
  const fallbackItems = current?.letterItems ?? [];
  // A text with no recording of its own still has letters, and the letters are usually the point
  // (a mnemonic). Those are played as letters, never presented as the reading of the text.
  const usingLetters = current?.resolution.kind === 'letters';
  const usingLetterFallback = !usingLetters && (current?.resolution.kind === 'none') && fallbackItems.length > 0;
  const displayItems = usingLetterFallback ? fallbackItems : recordedItems;
  const isPlaying = phase !== 'idle';
  const activeWord = activeIndex !== null ? displayItems[activeIndex] : undefined;
  const singleLetter = current?.resolution.kind === 'letters' && current.resolution.letters.length === 1
    ? current.resolution.letters[0]
    : null;
  const unit = usingLetters || usingLetterFallback ? 'letter' : 'word';

  const status = (() => {
    if (!current || !source) return 'Preparing the recordings…';
    if (phase === 'repeat') {
      return `Your turn — repeat ${unit} ${(activeIndex ?? 0) + 1} of ${displayItems.length}${
        secondsLeft > 0 ? ` · next in ${secondsLeft}s` : ''
      }`;
    }
    if (phase === 'playing' && activeWord) {
      return `Playing ${unit} ${(activeIndex ?? 0) + 1} of ${displayItems.length}`;
    }
    if (displayItems.length === 0) return source.detail;
    if (usingLetterFallback) {
      return `No recording for this text. These are the recorded letters it is built from — tap any one to hear it.`;
    }
    return `${displayItems.length} ${unit}${displayItems.length === 1 ? '' : 's'} · tap any one to hear it alone`;
  })();

  return (
    <section
      id={`pronunciation-lab-${activePhrase.id}`}
      aria-label="Pronunciation practice"
      className={`rounded-2xl border border-border bg-card p-4 space-y-3 text-left ${className}`}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-primary-subtle text-primary-strong flex items-center justify-center shrink-0">
            <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-bold text-foreground">Pronunciation practice</p>
            <p className="text-[10px] text-muted-foreground">Recorded audio · no AI needed</p>
          </div>
        </div>

        {source && (
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              source.recorded
                ? 'bg-success-subtle border-success/40 text-success-strong'
                : 'bg-surface-muted border-border text-muted-foreground'
            }`}
            title={source.detail}
          >
            {source.label}
          </span>
        )}
      </div>

      {phrases.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Which text to practise">
          {phrases.map((phrase) => {
            const isActive = phrase.id === activePhrase.id;
            return (
              <button
                key={phrase.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => {
                  halt();
                  setActivePhraseId(phrase.id);
                }}
                className={`px-2.5 py-1 rounded-full border text-[10px] font-bold transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-surface border-border text-muted-foreground hover:text-foreground hover:bg-surface-hover'
                }`}
              >
                {phrase.label}
              </button>
            );
          })}
        </div>
      )}

      {displayItems.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5 py-1" dir="rtl">
          {displayItems.map((item, index) => {
            const isActive = activeIndex === index;
            return (
              <button
                key={`${item.key}-${index}`}
                type="button"
                lang="ar"
                dir="rtl"
                onClick={() => void playSingle(displayItems, index)}
                title="Hear this alone"
                className={`font-arabic text-2xl sm:text-3xl px-2.5 py-1 rounded-xl border transition-all ${
                  isActive
                    ? 'bg-primary-subtle text-primary-strong border-primary ring-2 ring-primary/40'
                    : 'bg-surface border-border text-foreground hover:border-primary hover:bg-surface-hover'
                }`}
              >
                {item.text}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void playFrom(displayItems, 0)}
          disabled={displayItems.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:pointer-events-none text-primary-foreground text-[11px] font-bold shadow-xs active:scale-95 transition-all"
        >
          <Play className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{isPlaying ? 'Restart' : 'Play phrase'}</span>
        </button>

        <button
          type="button"
          onClick={halt}
          disabled={!isPlaying}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-border bg-surface text-[11px] font-bold text-muted-foreground hover:text-foreground hover:bg-surface-hover disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          <Square className="w-3 h-3" aria-hidden="true" />
          <span>Stop</span>
        </button>

        <LabToggle
          active={repeat}
          onClick={() => setRepeat((value) => !value)}
          icon={Repeat}
          label="Repeat after me"
          hint="Pause after every word so you can recite it back"
        />
        <LabToggle
          active={slow}
          onClick={() => setSlow((value) => !value)}
          icon={Turtle}
          label="Slow"
          hint="Play at 0.75 speed, keeping the reciter's pitch"
        />
        <LabToggle
          active={loop}
          onClick={() => setLoop((value) => !value)}
          icon={InfinityIcon}
          label="Loop"
          hint="Start again when the phrase ends"
        />
      </div>

      <p role="status" aria-live="polite" className="text-[11px] text-muted-foreground leading-snug">
        {status}
      </p>

      {singleLetter && (
        <div className="rounded-xl bg-surface border border-border p-3 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-foreground">
              {singleLetter.nameEn} <span className="text-primary-strong">({singleLetter.nameTa})</span>
            </span>
            <span className="text-[10px] text-muted-foreground">
              {singleLetter.isEmphatic ? 'Heavy — Tafkheem' : 'Light — Tarqeeq'}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug">{singleLetter.makhrajEn}</p>
          <div className="flex flex-wrap gap-2 pt-1" dir="rtl">
            {(
              [
                ['Isolated', singleLetter.forms.isolated],
                ['Initial', singleLetter.forms.initial],
                ['Medial', singleLetter.forms.medial],
                ['Final', singleLetter.forms.final],
              ] as const
            ).map(([formLabel, glyph]) => (
              <span key={formLabel} className="inline-flex items-center gap-1">
                <span className="font-arabic text-xl text-foreground" lang="ar">
                  {glyph}
                </span>
                <span className="text-[9px] uppercase tracking-wide text-muted-foreground font-sans" dir="ltr">
                  {formLabel}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {source && !source.recorded && (
        <p className="text-[11px] text-muted-foreground leading-snug">
          {current?.resolution.kind === 'none' ? current.resolution.reason : source.detail}
        </p>
      )}
    </section>
  );
};
