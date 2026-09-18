'use client';

import React, { useMemo } from 'react';
import confetti from 'canvas-confetti';
import { Volume2, CheckCircle2, Eye, EyeOff, Clock, Sparkles } from 'lucide-react';
import type { ModeStageProps } from './types';
import { verseKeyOf } from './types';

const Header: React.FC<{ tag: string; title: string; description: string }> = ({ tag, title, description }) => (
  <div className="space-y-1">
    <span className="text-xs font-bold text-primary uppercase tracking-wider">{tag}</span>
    <h3 className="text-lg font-bold text-foreground">{title}</h3>
    <p className="text-xs text-muted-foreground">{description}</p>
  </div>
);

function celebrate(particleCount: number): void {
  try {
    confetti({ particleCount, spread: 60, origin: { y: 0.7 } });
  } catch {
    // Celebration is optional.
  }
}

/** Mode A: listen and repeat. */
export const ListenRepeatMode: React.FC<ModeStageProps> = ({ verse, playAudio, handleSelfGrade }) => (
  <div className="space-y-6 text-center">
    <Header tag="Mode A • Auditory Loop" title="Listen & Repeat" description="Listen to the ayah repeatedly and recite along." />
    <div className="py-8 px-4 bg-surface rounded-2xl border border-border">
      <p className="font-arabic text-3xl sm:text-4xl text-foreground leading-loose" dir="rtl" lang="ar">
        {verse.textUthmani}
      </p>
      <p className="text-xs text-muted-foreground mt-4 max-w-lg mx-auto">{verse.translationEn}</p>
      {verse.translationTa && (
        <p className="text-xs text-primary font-tamil mt-1" lang="ta">
          {verse.translationTa}
        </p>
      )}
    </div>
    <div className="flex items-center justify-center gap-3 flex-wrap">
      <button
        type="button"
        onClick={() => void playAudio(verse.audioUrl, verse.textUthmani, verseKeyOf(verse))}
        className="flex items-center gap-2 px-5 py-3 rounded-xl bg-surface border border-border hover:bg-surface-hover text-foreground text-xs font-bold transition-all active:scale-95"
      >
        <Volume2 className="w-4 h-4" />
        <span>Play Recitation</span>
      </button>
      <button
        type="button"
        onClick={() => void handleSelfGrade(4)}
        className="flex items-center gap-2 px-5 py-3 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold shadow-md transition-all active:scale-95"
      >
        <CheckCircle2 className="w-4 h-4" />
        <span>Mastered This Verse (+15 XP)</span>
      </button>
    </div>
  </div>
);

/** Mode C: assemble the words in order. */
export const WordReorderMode: React.FC<ModeStageProps> = (props) => {
  const { verse, assembledIndices, isAnswerChecked, setAssembledIndices, setIsCorrect, setIsAnswerChecked, awardXP } = props;
  return (
    <div className="space-y-6">
      <div className="text-center">
        <Header tag="Mode C • Syntax Assembly" title="Word Reordering" description="Assemble the words of this ayah in order." />
      </div>
      <div
        className="min-h-[80px] p-4 bg-surface rounded-2xl border-2 border-dashed border-border flex flex-wrap gap-2 items-center justify-center"
        dir="rtl"
      >
        {assembledIndices.length === 0 ? (
          <span className="text-xs text-muted-foreground font-sans" dir="ltr">
            Tap tokens below in order
          </span>
        ) : (
          assembledIndices.map((wordIdx, pos) => (
            <button
              key={pos}
              type="button"
              onClick={() => setAssembledIndices((prev) => prev.filter((_, i) => i !== pos))}
              className="font-arabic text-2xl px-3 py-1.5 rounded-xl bg-primary text-primary-foreground shadow-xs hover:bg-danger transition-colors"
              lang="ar"
            >
              {verse.words[wordIdx]?.arabic}
            </button>
          ))
        )}
      </div>
      <div className="flex flex-wrap gap-2 justify-center" dir="rtl">
        {verse.words.map((w, idx) => {
          const isUsed = assembledIndices.includes(idx);
          return (
            <button
              key={idx}
              type="button"
              disabled={isUsed || isAnswerChecked}
              onClick={() => setAssembledIndices((prev) => [...prev, idx])}
              className={`font-arabic text-2xl px-4 py-2 rounded-xl border transition-all ${
                isUsed ? 'opacity-30 border-border pointer-events-none' : 'bg-surface border border-border hover:border-primary text-foreground'
              }`}
              lang="ar"
            >
              {w.arabic}
            </button>
          );
        })}
      </div>
      <div className="pt-2">
        <button
          type="button"
          onClick={() => {
            const answer = assembledIndices.map((i) => verse.words[i]?.arabic).join(' ').trim();
            const target = verse.words.map((w) => w.arabic).join(' ').trim();
            const correct = answer === target;
            setIsCorrect(correct);
            setIsAnswerChecked(true);
            if (correct) {
              celebrate(50);
              void awardXP(15);
            }
          }}
          className="w-full py-3.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground font-bold text-xs shadow-md transition-colors"
        >
          Check Canonical Order
        </button>
      </div>
    </div>
  );
};

/** Mode D: recall from the first word. */
export const FirstWordMode: React.FC<ModeStageProps> = ({ verse, isRevealed, setIsRevealed }) => (
  <div className="space-y-6 text-center">
    <Header tag="Mode D • Initial Trigger" title="First Word Recall" description="Recall the ayah from its first word." />
    <div className="py-8 bg-surface rounded-2xl border border-border text-center">
      <span className="text-xs font-semibold text-muted-foreground block mb-2">First Word:</span>
      <p className="font-arabic text-4xl text-primary font-bold" dir="rtl" lang="ar">
        {verse.words[0]?.arabic}
      </p>
      {isRevealed && (
        <p className="font-arabic text-2xl text-foreground mt-6 leading-loose animate-in fade-in" dir="rtl" lang="ar">
          {verse.textUthmani}
        </p>
      )}
    </div>
    <div className="flex items-center justify-center gap-3">
      <button
        type="button"
        onClick={() => setIsRevealed(!isRevealed)}
        className="flex items-center gap-2 px-5 py-3 rounded-xl bg-surface hover:bg-surface-hover border border-border text-foreground text-xs font-bold transition-colors"
      >
        {isRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        <span>{isRevealed ? 'Hide Full Verse' : 'Reveal Full Verse'}</span>
      </button>
    </div>
  </div>
);

/** Mode G: one word is blanked; pick it. The blank rotates by ayah so it is not always word 2. */
export const MissingSegmentMode: React.FC<ModeStageProps> = (props) => {
  const { verse, isAnswerChecked, selectedChoice, isCorrect, setIsCorrect, setSelectedChoice, setIsAnswerChecked, awardXP } = props;
  const blankIndex = verse.words.length <= 1 ? 0 : 1 + ((verse.ayah + verse.surah) % (verse.words.length - 1));
  const answer = verse.words[blankIndex]?.arabic ?? '';

  const options = useMemo(() => {
    const distractors = verse.words
      .map((w) => w.arabic)
      .filter((w, index) => index !== blankIndex && w !== answer);
    const unique = Array.from(new Set(distractors)).slice(0, 3);
    const pool = [answer, ...unique];
    // Deterministic order per ayah so the button under the finger does not move.
    return pool.sort((a, b) => ((a.charCodeAt(0) + verse.ayah) % 7) - ((b.charCodeAt(0) + verse.ayah) % 7));
  }, [answer, blankIndex, verse.ayah, verse.words]);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <Header tag="Mode G • Missing words" title="Missing Segment" description="Identify the missing word in the verse." />
      </div>
      <div className="p-6 bg-surface rounded-2xl border border-border text-center" dir="rtl" lang="ar">
        <p className="font-arabic text-3xl text-foreground leading-loose">
          {verse.words.map((w, i) =>
            i === blankIndex ? (
              <span key={i} className="px-3 py-1 bg-secondary-subtle border border-secondary/30 rounded-lg text-secondary-strong mx-1">
                [ ؟ ]
              </span>
            ) : (
              <span key={i} className="mx-1">
                {w.arabic}
              </span>
            )
          )}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {options.map((option, index) => (
          <button
            key={index}
            type="button"
            disabled={isAnswerChecked}
            onClick={() => {
              const correct = option === answer;
              setIsCorrect(correct);
              setSelectedChoice(option);
              setIsAnswerChecked(true);
              if (correct) {
                celebrate(50);
                void awardXP(10);
              }
            }}
            className={`p-4 rounded-xl border text-center font-arabic text-2xl transition-all ${
              isAnswerChecked && option === answer
                ? 'bg-success-subtle text-success-strong border-success/40'
                : selectedChoice === option && !isCorrect
                  ? 'bg-danger-subtle text-danger-strong border-danger/40'
                  : 'bg-surface border border-border text-foreground hover:border-primary'
            }`}
            lang="ar"
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
};

/** Mode I: timed recall. */
export const SpeedRecallMode: React.FC<ModeStageProps> = ({ verse, timerSeconds, isTimerRunning, setTimerSeconds, setTimerActive, awardXP }) => (
  <div className="space-y-6 text-center">
    <Header tag="Mode I • Speed recall" title="Timed Speed Recall (15s)" description="See whether you can recall the verse within 15 seconds." />
    <div className="flex items-center justify-center gap-2">
      <Clock className="w-5 h-5 text-secondary" />
      <span className={`text-2xl font-extrabold ${timerSeconds <= 5 ? 'text-danger animate-ping' : 'text-foreground'}`}>{timerSeconds}s</span>
    </div>
    {!isTimerRunning && (
      <button
        type="button"
        onClick={() => {
          setTimerSeconds(15);
          setTimerActive(true);
        }}
        className="px-6 py-3 rounded-xl bg-secondary hover:bg-secondary-hover text-secondary-foreground font-bold text-xs shadow-md transition-colors"
      >
        Start 15s Countdown
      </button>
    )}
    {isTimerRunning && (
      <div className="p-6 bg-surface rounded-2xl border border-border space-y-4">
        <p className="font-arabic text-3xl text-foreground leading-loose" dir="rtl" lang="ar">
          {verse.textUthmani}
        </p>
        <button
          type="button"
          onClick={() => {
            setTimerActive(false);
            celebrate(60);
            void awardXP(20);
          }}
          className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold shadow-md transition-colors"
        >
          I Recited It In Time! (+20 XP)
        </button>
      </div>
    )}
  </div>
);

/** Mode J: assistant-guided session. */
export const GuidedSessionMode: React.FC<ModeStageProps> = ({ verse, openTutor }) => (
  <div className="space-y-6 text-center">
    <Header
      tag="Mode J • Guided session"
      title="Guided Recitation Session"
      description="Work through the verse with the assistant to identify phonetic pitfalls and mnemonic associations."
    />
    <div className="p-6 bg-primary-subtle rounded-2xl border border-primary/30 text-center space-y-3">
      <Sparkles className="w-8 h-8 text-secondary mx-auto" />
      <h4 className="text-sm font-bold text-foreground">
        Ready to test Surah {verse.surah}:{verse.ayah}
      </h4>
      <p className="text-xs text-muted-foreground max-w-md mx-auto">
        The assistant asks about roots, Tajweed phonetics and the Tamil or English meaning of this verse.
      </p>
      <button
        type="button"
        onClick={() =>
          openTutor(
            `Please guide me in memorizing Surah ${verse.surah}:${verse.ayah} ("${verse.textUthmani}"). Give me: 1) Memory anchors / root connections, 2) Tajweed pronunciation watch-outs, 3) Tamil explanation to reinforce meaning.`
          )
        }
        className="px-6 py-3 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold shadow-md transition-colors"
      >
        Start guided session
      </button>
    </div>
  </div>
);
