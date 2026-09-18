'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { SURAHS } from '@/lib/quran/surahs';
import { quranProvider } from '@/lib/quran/alquran-cloud';
import { Verse } from '@/lib/quran/types';
import { db } from '@/lib/db';
import { calculateNextReview, initializeVerseProgress } from '@/lib/learning/srs-engine';
import { recordActivity } from '@/lib/learning/activity';
import { shuffle } from '@/lib/utils';
import { usePreviewAudio } from '@/hooks/use-preview-audio';
import confetti from 'canvas-confetti';
import { 
  Brain, 
  Volume2, 
  RotateCcw, 
  CheckCircle2, 
  XCircle, 
  Sparkles, 
  Clock, 
  Eye, 
  EyeOff, 
  ArrowRight,
  Shuffle,
  AlertCircle
} from 'lucide-react';
import { TutorPanel } from '@/components/ai/TutorPanel';

export type HifzModeKey = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J';

const HIFZ_MODE_KEYS: readonly HifzModeKey[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

function isHifzModeKey(value: string | null): value is HifzModeKey {
  return value !== null && (HIFZ_MODE_KEYS as readonly string[]).includes(value);
}

function MemorizationContent() {
  const searchParams = useSearchParams();
  const requestedMode = searchParams.get('mode');
  const initialMode: HifzModeKey = isHifzModeKey(requestedMode) ? requestedMode : 'A';

  const [activeMode, setActiveMode] = useState<HifzModeKey>(initialMode);
  const [selectedSurahId, setSelectedSurahId] = useState<number>(1);
  const [verses, setVerses] = useState<Verse[]>([]);
  /** Which surah the verses in state actually belong to. */
  const [loadedSurahId, setLoadedSurahId] = useState<number | null>(null);
  const [verseLoadFailed, setVerseLoadFailed] = useState(false);
  /** Bumped by “Try again” to re-run the loader without duplicating it. */
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [currentVerseIndex, setCurrentVerseIndex] = useState(0);
  const [loadingVerses, setLoadingVerses] = useState(true);

  // Mode Specific State
  const [assembledIndices, setAssembledIndices] = useState<number[]>([]);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [isAnswerChecked, setIsAnswerChecked] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(15);
  const [timerActive, setTimerActive] = useState(false);
  const [aiTutorOpen, setAiTutorOpen] = useState(false);
  const [aiTutorPrompt, setAiTutorPrompt] = useState('');

  const { playUrl, speak } = usePreviewAudio();

  const resetModeState = React.useCallback(() => {
    setAssembledIndices([]);
    setSelectedChoice(null);
    setIsAnswerChecked(false);
    setIsCorrect(false);
    setIsRevealed(false);
    setTimerSeconds(15);
    setTimerActive(false);
  }, []);

  // Load verses for the selected Surah
  useEffect(() => {
    // Switching surahs quickly used to be a race: the slower reply could land last and
    // leave another surah's verses on screen under the current heading.
    let cancelled = false;

    async function loadSurahVerses() {
      setLoadingVerses(true);
      try {
        const loaded = await quranProvider.getChapterVerses(selectedSurahId);
        if (cancelled) return;
        setVerses(loaded);
        setLoadedSurahId(selectedSurahId);
        setVerseLoadFailed(false);
        setCurrentVerseIndex(0);
        resetModeState();
      } catch (error: unknown) {
        if (cancelled) return;
        console.error(`Failed to load verses for surah ${selectedSurahId}:`, error);
        // Clear the stage instead of leaving the previous surah's text in place: it would
        // be studied and graded as the surah named at the top of the screen.
        setVerses([]);
        setLoadedSurahId(null);
        setCurrentVerseIndex(0);
        setVerseLoadFailed(true);
      } finally {
        if (!cancelled) setLoadingVerses(false);
      }
    }

    void loadSurahVerses();
    return () => {
      cancelled = true;
    };
  }, [selectedSurahId, loadAttempt, resetModeState]);

  /**
   * Mode I timer. The countdown is derived from state instead of being stopped by a
   * second effect, so there is no extra render per tick and the interval cannot run
   * past zero. The tick is only deactivated from the starter button below.
   */
  const isTimerRunning = activeMode === 'I' && timerActive && timerSeconds > 0;

  useEffect(() => {
    if (!isTimerRunning) return;
    const interval = setInterval(() => {
      setTimerSeconds((previous) => Math.max(0, previous - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  /** Text is only offered for the surah it was loaded for. */
  const versesForSelection = useMemo(
    () => (loadedSurahId === selectedSurahId ? verses : []),
    [loadedSurahId, selectedSurahId, verses]
  );
  const currentVerse = versesForSelection[currentVerseIndex] ?? versesForSelection[0];

  /**
   * Plays an ayah recitation through the shared player, falling back to the Arabic
   * synthesizer when the recording cannot be loaded. Each call supersedes the last,
   * which is what stops overlapping recitations when the learner taps quickly.
   */
  const playAudio = async (url?: string, text?: string, verseKey?: string): Promise<void> => {
    // The key identifies the *verse*, never a prefix of its text. Two verses that open with
    // the same words (the ten identical refrains of Al-Mursalat, for instance) produced the
    // same key, so the shared player could mark the wrong row as playing.
    const key = verseKey ?? url ?? 'unknown';
    if (url) {
      const played = await playUrl(`memorize:${key}`, url);
      if (played) return;
    }
    if (text) {
      await speak(`memorize-speech:${key}`, text, 'ar-SA');
    }
  };

  const awardXP = async (amount: number) => {
    await recordActivity({
      xp: amount,
      event: 'memorize.graded',
      props: { mode: activeMode, surah: selectedSurahId },
    });
  };

  const handleSelfGrade = async (quality: number) => {
    if (!currentVerse) return;
    const key = `${currentVerse.surah}:${currentVerse.ayah}`;
    let prog = await db.verseProgress.get(key);
    if (!prog) {
      prog = initializeVerseProgress(currentVerse.surah, currentVerse.ayah);
    }

    const next = calculateNextReview(prog, quality);
    await db.verseProgress.put(next);

    if (quality >= 3) {
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
      await awardXP(15);
    }

    // Go to next verse
    if (currentVerseIndex < versesForSelection.length - 1) {
      setCurrentVerseIndex(prev => prev + 1);
      resetModeState();
    } else {
      setIsRevealed(false);
      alert('You have completed this Surah review round! Alhamdulillah!');
    }
  };

  /**
   * Multiple-choice options for the current ayah.
   *
   * Memoised per verse: building (and shuffling) this inside render meant the options
   * were reshuffled on every state change — including the tap itself — so the button
   * under the learner's finger moved before the answer could land.
   */
  const choiceOptions = useMemo(() => {
    if (!currentVerse || versesForSelection.length < 2) return [];
    const others = versesForSelection
      .filter((verse) => verse.ayah !== currentVerse.ayah)
      .slice(0, 3)
      .map((verse) => verse.textUthmani);
    return shuffle([currentVerse.textUthmani, ...others]);
  }, [currentVerse, versesForSelection]);

  const handleCheckMultipleChoice = (chosen: string) => {
    setSelectedChoice(chosen);
    const correct = chosen === currentVerse.textUthmani;
    setIsCorrect(correct);
    setIsAnswerChecked(true);

    if (correct) {
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
      awardXP(10);
    }
  };

  const modesList = [
    { id: 'A', name: 'Listen & Repeat', icon: '🎧' },
    { id: 'B', name: 'Complete Verse', icon: '✍️' },
    { id: 'C', name: 'Word Reordering', icon: '🧩' },
    { id: 'D', name: 'First Word Prompt', icon: '💡' },
    { id: 'E', name: 'Audio to Ayah', icon: '🔊' },
    { id: 'F', name: 'Meaning to Ayah', icon: '🌐' },
    { id: 'G', name: 'Missing Segment', icon: '🔍' },
    { id: 'H', name: 'Blind Recitation (SRS)', icon: '🙈' },
    { id: 'I', name: 'Speed Recall (15s)', icon: '⚡' },
    { id: 'J', name: 'Guided Session', icon: '📖' },
  ];

  return (
    <div id="memorization-suite" className="space-y-6 animate-in fade-in duration-300">
      {/* Top Header & Surah Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card p-5 rounded-3xl border border-border shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary-subtle flex items-center justify-center text-primary font-bold">
            <Brain className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">
              Memorization Modes
            </h1>
            <p className="text-xs text-muted-foreground">
              Ten recall drills linked to spaced repetition
            </p>
          </div>
        </div>

        {/* Surah Dropdown selector & Planner CTA */}
        <div className="flex items-center gap-3">
          <Link
            href="/memorize/planner"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-subtle text-primary-strong text-xs font-bold border border-primary/20 hover:bg-primary-subtle/80 transition-colors"
          >
            <span>Sabaq/Sabqi Plan</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>

          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-muted-foreground">Surah:</label>
            <select
              value={selectedSurahId}
              onChange={(e) => setSelectedSurahId(Number(e.target.value))}
              className="text-xs font-semibold px-3 py-2 rounded-xl bg-surface text-foreground border border-border outline-hidden cursor-pointer"
            >
              {SURAHS.slice(0, 30).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id}. {s.nameSimple} ({s.nameEnglish}) - {s.versesCount} Ayahs
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Mode Picker Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {modesList.map((m) => (
          <button
            key={m.id}
            onClick={() => {
              setActiveMode(m.id as HifzModeKey);
              resetModeState();
            }}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              activeMode === m.id
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'bg-card text-muted-foreground border border-border hover:bg-surface-hover hover:text-foreground'
            }`}
          >
            <span>{m.icon}</span>
            <span>Mode {m.id}: {m.name}</span>
          </button>
        ))}
      </div>

      {/* Current Verse Navigation Bar */}
      {versesForSelection.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2 bg-surface rounded-2xl border border-border text-xs font-semibold text-muted-foreground">
          <span>
            Ayah {currentVerseIndex + 1} of {versesForSelection.length} (Surah {currentVerse?.surah}:{currentVerse?.ayah})
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={currentVerseIndex === 0}
              onClick={() => {
                setCurrentVerseIndex(prev => Math.max(0, prev - 1));
                resetModeState();
              }}
              className="px-2.5 py-1 rounded-lg bg-card border border-border hover:bg-surface-hover text-foreground disabled:opacity-40 transition-colors"
            >
              Prev
            </button>
            <button
              disabled={currentVerseIndex === versesForSelection.length - 1}
              onClick={() => {
                setCurrentVerseIndex(prev => Math.min(versesForSelection.length - 1, prev + 1));
                resetModeState();
              }}
              className="px-2.5 py-1 rounded-lg bg-card border border-border hover:bg-surface-hover text-foreground disabled:opacity-40 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Main Interactive Stage for the Selected Mode */}
      {loadingVerses ? (
        <div className="text-center py-20 text-muted-foreground">
          <Brain className="w-8 h-8 mx-auto mb-2 animate-spin text-primary" />
          <p className="text-xs">Loading verses for Surah {selectedSurahId}…</p>
        </div>
      ) : currentVerse ? (
        <div className="bg-card border border-border rounded-3xl p-6 sm:p-8 shadow-lg space-y-6">

          {/* MODE A: LISTEN & REPEAT */}
          {activeMode === 'A' && (
            <div className="space-y-6 text-center">
              <div className="space-y-1">
                <span className="text-xs font-bold text-primary uppercase tracking-wider">Mode A • Auditory Loop</span>
                <h3 className="text-lg font-bold text-foreground">Listen & Repeat</h3>
                <p className="text-xs text-muted-foreground">Listen to the ayah repeatedly and recite along.</p>
              </div>

              <div className="py-8 px-4 bg-surface rounded-2xl border border-border">
                <p className="font-arabic text-3xl sm:text-4xl text-foreground leading-loose dir-rtl" dir="rtl">
                  {currentVerse.textUthmani}
                </p>
                <p className="text-xs text-muted-foreground mt-4 max-w-lg mx-auto">
                  {currentVerse.translationEn}
                </p>
                {currentVerse.translationTa && (
                  <p className="text-xs text-primary font-tamil mt-1">
                    {currentVerse.translationTa}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() =>
                    void playAudio(
                      currentVerse.audioUrl,
                      currentVerse.textUthmani,
                      `${currentVerse.surah}:${currentVerse.ayah}`
                    )
                  }
                  className="flex items-center gap-2 px-5 py-3 rounded-xl bg-surface border border-border hover:bg-surface-hover text-foreground text-xs font-bold transition-all active:scale-95"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>Play Recitation</span>
                </button>
                <button
                  onClick={() => handleSelfGrade(4)}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold shadow-md transition-all active:scale-95"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Mastered This Verse (+15 XP)</span>
                </button>
              </div>
            </div>
          )}

          {/* MODE B: COMPLETE THE VERSE */}
          {activeMode === 'B' && (
            <div className="space-y-6">
              <div className="text-center space-y-1">
                <span className="text-xs font-bold text-primary uppercase tracking-wider">Mode B • Continuation</span>
                <h3 className="text-lg font-bold text-foreground">Complete the Verse</h3>
                <p className="text-xs text-muted-foreground">Read the starting words and choose the correct continuation.</p>
              </div>

              {/* Prompt showing only first half */}
              <div className="py-6 px-4 bg-surface rounded-2xl border border-border text-center dir-rtl" dir="rtl">
                <p className="font-arabic text-3xl text-primary-strong">
                  {currentVerse.words.slice(0, Math.max(2, Math.floor(currentVerse.words.length / 2))).map(w => w.arabic).join(' ')} ... ؟
                </p>
              </div>

              {/* Choices */}
              <div className="space-y-2.5">
                {choiceOptions.map((opt, idx) => (
                  <button
                    key={idx}
                    disabled={isAnswerChecked}
                    onClick={() => handleCheckMultipleChoice(opt)}
                    className={`w-full p-4 rounded-xl border text-right font-arabic text-xl dir-rtl transition-all ${
                      isAnswerChecked && opt === currentVerse.textUthmani
                        ? 'bg-success-subtle text-success-strong border-success/40'
                        : selectedChoice === opt && !isCorrect
                        ? 'bg-danger-subtle text-danger-strong border-danger/40'
                        : 'bg-surface border border-border hover:border-primary text-foreground'
                    }`}
                    dir="rtl"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* MODE C: WORD REORDERING */}
          {activeMode === 'C' && (
            <div className="space-y-6">
              <div className="text-center space-y-1">
                <span className="text-xs font-bold text-primary uppercase tracking-wider">Mode C • Syntax Assembly</span>
                <h3 className="text-lg font-bold text-foreground">Word Reordering</h3>
                <p className="text-xs text-muted-foreground">Assemble the words of this ayah in order.</p>
              </div>

              {/* Workspace */}
              <div className="min-h-[80px] p-4 bg-surface rounded-2xl border-2 border-dashed border-border flex flex-wrap gap-2 items-center justify-center dir-rtl" dir="rtl">
                {assembledIndices.length === 0 ? (
                  <span className="text-xs text-muted-foreground font-sans" dir="ltr">Tap tokens below in order</span>
                ) : (
                  assembledIndices.map((wordIdx, pos) => {
                    const word = currentVerse.words[wordIdx];
                    return (
                      <button
                        key={pos}
                        onClick={() => setAssembledIndices(prev => prev.filter((_, i) => i !== pos))}
                        className="font-arabic text-2xl px-3 py-1.5 rounded-xl bg-primary text-primary-foreground shadow-xs hover:bg-danger transition-colors"
                      >
                        {word?.arabic}
                      </button>
                    );
                  })
                )}
              </div>

              {/* Shuffled Available Tokens */}
              <div className="flex flex-wrap gap-2 justify-center dir-rtl" dir="rtl">
                {currentVerse.words.map((w, idx) => {
                  const isUsed = assembledIndices.includes(idx);
                  return (
                    <button
                      key={idx}
                      disabled={isUsed || isAnswerChecked}
                      onClick={() => setAssembledIndices(prev => [...prev, idx])}
                      className={`font-arabic text-2xl px-4 py-2 rounded-xl border transition-all ${
                        isUsed
                          ? 'opacity-30 border-border pointer-events-none'
                          : 'bg-surface border border-border hover:border-primary text-foreground'
                      }`}
                    >
                      {w.arabic}
                    </button>
                  );
                })}
              </div>

              <div className="pt-2">
                <button
                  onClick={() => {
                    const ans = assembledIndices.map(i => currentVerse.words[i]?.arabic).join(' ').trim();
                    const target = currentVerse.words.map(w => w.arabic).join(' ').trim();
                    const correct = ans === target;
                    setIsCorrect(correct);
                    setIsAnswerChecked(true);
                    if (correct) {
                      confetti({ particleCount: 50, spread: 60 });
                      awardXP(15);
                    }
                  }}
                  className="w-full py-3.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground font-bold text-xs shadow-md transition-colors"
                >
                  Check Canonical Order
                </button>
              </div>
            </div>
          )}

          {/* MODE D: FIRST WORD PROMPT */}
          {activeMode === 'D' && (
            <div className="space-y-6 text-center">
              <div className="space-y-1">
                <span className="text-xs font-bold text-primary uppercase tracking-wider">Mode D • Initial Trigger</span>
                <h3 className="text-lg font-bold text-foreground">First Word Recall</h3>
                <p className="text-xs text-muted-foreground">Recall the ayah from its first word.</p>
              </div>

              <div className="py-8 bg-surface rounded-2xl border border-border text-center">
                <span className="text-xs font-semibold text-muted-foreground block mb-2">First Word:</span>
                <p className="font-arabic text-4xl text-primary font-bold">
                  {currentVerse.words[0]?.arabic}
                </p>
                {isRevealed && (
                  <p className="font-arabic text-2xl text-foreground mt-6 leading-loose animate-in fade-in">
                    {currentVerse.textUthmani}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setIsRevealed(!isRevealed)}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl bg-surface hover:bg-surface-hover border border-border text-foreground text-xs font-bold transition-colors"
                >
                  {isRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  <span>{isRevealed ? 'Hide Full Verse' : 'Reveal Full Verse'}</span>
                </button>
              </div>
            </div>
          )}

          {/* MODE E: AUDIO TO AYAH */}
          {activeMode === 'E' && (
            <div className="space-y-6">
              <div className="text-center space-y-1">
                <span className="text-xs font-bold text-primary uppercase tracking-wider">Mode E • Auditory Recognition</span>
                <h3 className="text-lg font-bold text-foreground">Audio to Ayah Match</h3>
                <p className="text-xs text-muted-foreground">Play the clip and choose which ayah was recited.</p>
              </div>

              <div className="text-center py-4">
                <button
                  onClick={() =>
                    void playAudio(
                      currentVerse.audioUrl,
                      currentVerse.textUthmani,
                      `${currentVerse.surah}:${currentVerse.ayah}`
                    )
                  }
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold shadow-md active:scale-95 transition-all"
                >
                  <Volume2 className="w-5 h-5" />
                  <span>Play Mystery Recitation</span>
                </button>
              </div>

              <div className="space-y-2.5">
                {choiceOptions.map((opt, idx) => (
                  <button
                    key={idx}
                    disabled={isAnswerChecked}
                    onClick={() => handleCheckMultipleChoice(opt)}
                    className={`w-full p-4 rounded-xl border text-right font-arabic text-xl dir-rtl transition-all ${
                      isAnswerChecked && opt === currentVerse.textUthmani
                        ? 'bg-success-subtle text-success-strong border-success/40'
                        : selectedChoice === opt && !isCorrect
                        ? 'bg-danger-subtle text-danger-strong border-danger/40'
                        : 'bg-surface border border-border hover:border-primary text-foreground'
                    }`}
                    dir="rtl"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* MODE F: MEANING TO AYAH */}
          {activeMode === 'F' && (
            <div className="space-y-6">
              <div className="text-center space-y-1">
                <span className="text-xs font-bold text-primary uppercase tracking-wider">Mode F • Meaning match</span>
                <h3 className="text-lg font-bold text-foreground">Meaning to Ayah Match</h3>
                <p className="text-xs text-muted-foreground">Read the English & Tamil translations, then match with the Arabic text.</p>
              </div>

              <div className="p-6 bg-surface rounded-2xl border border-border space-y-2 text-center">
                <p className="text-sm font-medium text-foreground">
                  &ldquo;{currentVerse.translationEn}&rdquo;
                </p>
                {currentVerse.translationTa && (
                  <p className="text-xs text-primary-strong font-tamil">
                    &ldquo;{currentVerse.translationTa}&rdquo;
                  </p>
                )}
              </div>

              <div className="space-y-2.5">
                {choiceOptions.map((opt, idx) => (
                  <button
                    key={idx}
                    disabled={isAnswerChecked}
                    onClick={() => handleCheckMultipleChoice(opt)}
                    className={`w-full p-4 rounded-xl border text-right font-arabic text-xl dir-rtl transition-all ${
                      isAnswerChecked && opt === currentVerse.textUthmani
                        ? 'bg-success-subtle text-success-strong border-success/40'
                        : selectedChoice === opt && !isCorrect
                        ? 'bg-danger-subtle text-danger-strong border-danger/40'
                        : 'bg-surface border border-border hover:border-primary text-foreground'
                    }`}
                    dir="rtl"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* MODE G: MISSING SEGMENT */}
          {activeMode === 'G' && (
            <div className="space-y-6">
              <div className="text-center space-y-1">
                <span className="text-xs font-bold text-primary uppercase tracking-wider">Mode G • Missing words</span>
                <h3 className="text-lg font-bold text-foreground">Missing Segment</h3>
                <p className="text-xs text-muted-foreground">Identify the missing word in the verse.</p>
              </div>

              <div className="p-6 bg-surface rounded-2xl border border-border text-center dir-rtl" dir="rtl">
                <p className="font-arabic text-3xl text-foreground leading-loose">
                  {currentVerse.words.map((w, i) => (
                    i === 1 ? (
                      <span key={i} className="px-3 py-1 bg-secondary-subtle border border-secondary/30 rounded-lg text-secondary-strong mx-1">
                        [ ؟ ]
                      </span>
                    ) : (
                      <span key={i} className="mx-1">{w.arabic}</span>
                    )
                  ))}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[currentVerse.words[1]?.arabic, ...currentVerse.words.slice(2, 5).map(w => w.arabic)]
                  .filter(Boolean)
                  .sort((a, b) => (a.charCodeAt(0) % 7) - (b.charCodeAt(0) % 7))
                  .map((opt, oIdx) => (
                    <button
                      key={oIdx}
                      disabled={isAnswerChecked}
                      onClick={() => {
                        const correct = opt === currentVerse.words[1]?.arabic;
                        setIsCorrect(correct);
                        setSelectedChoice(opt);
                        setIsAnswerChecked(true);
                        if (correct) {
                          confetti({ particleCount: 50 });
                          awardXP(10);
                        }
                      }}
                      className={`p-4 rounded-xl border text-center font-arabic text-2xl transition-all ${
                        isAnswerChecked && opt === currentVerse.words[1]?.arabic
                          ? 'bg-success-subtle text-success-strong border-success/40'
                          : selectedChoice === opt && !isCorrect
                          ? 'bg-danger-subtle text-danger-strong border-danger/40'
                          : 'bg-surface border border-border text-foreground hover:border-primary'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* MODE H: BLIND RECITATION (SRS SELF-RATING) */}
          {activeMode === 'H' && (
            <div className="space-y-6 text-center">
              <div className="space-y-1">
                <span className="text-xs font-bold text-primary uppercase tracking-wider">Mode H • Blind recitation</span>
                <h3 className="text-lg font-bold text-foreground">Mental Recitation & Self-Rating</h3>
                <p className="text-xs text-muted-foreground">Recite Ayah {currentVerse.surah}:{currentVerse.ayah} from memory, then reveal and rate your retention quality.</p>
              </div>

              <div className="p-8 bg-surface rounded-2xl border border-border min-h-[140px] flex flex-col items-center justify-center">
                {!isRevealed ? (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-muted-foreground">Verse hidden for blind recall</p>
                    <button
                      onClick={() => setIsRevealed(true)}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold shadow-md transition-all active:scale-95"
                    >
                      <Eye className="w-4 h-4" />
                      <span>Reveal Verse</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 animate-in fade-in">
                    <p className="font-arabic text-3xl sm:text-4xl text-foreground leading-loose dir-rtl" dir="rtl">
                      {currentVerse.textUthmani}
                    </p>
                    <p className="text-xs text-muted-foreground">{currentVerse.translationEn}</p>
                  </div>
                )}
              </div>

              {/* SM-2 Rating Buttons */}
              {isRevealed && (
                <div className="space-y-2 pt-2 animate-in slide-in-from-bottom-2">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                    Grade Your Recall (Spaced Repetition Engine)
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <button
                      onClick={() => handleSelfGrade(1)}
                      className="p-3 rounded-xl bg-danger-subtle border border-danger/30 text-danger-strong text-xs font-bold hover:bg-danger/20 transition-colors"
                    >
                      Again (&lt;1d)
                    </button>
                    <button
                      onClick={() => handleSelfGrade(3)}
                      className="p-3 rounded-xl bg-secondary-subtle border border-secondary/30 text-secondary-strong text-xs font-bold hover:bg-secondary/20 transition-colors"
                    >
                      Hard (1-2d)
                    </button>
                    <button
                      onClick={() => handleSelfGrade(4)}
                      className="p-3 rounded-xl bg-primary-subtle border border-primary/30 text-primary-strong text-xs font-bold hover:bg-primary/20 transition-colors"
                    >
                      Good (3-5d)
                    </button>
                    <button
                      onClick={() => handleSelfGrade(5)}
                      className="p-3 rounded-xl bg-surface border border-border text-foreground text-xs font-bold hover:bg-surface-hover transition-colors"
                    >
                      Easy (7+d)
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MODE I: TIMED SPEED RECALL */}
          {activeMode === 'I' && (
            <div className="space-y-6 text-center">
              <div className="space-y-1">
                <span className="text-xs font-bold text-primary uppercase tracking-wider">Mode I • Speed recall</span>
                <h3 className="text-lg font-bold text-foreground">Timed Speed Recall (15s)</h3>
                <p className="text-xs text-muted-foreground">See whether you can recall the verse within 15 seconds.</p>
              </div>

              <div className="flex items-center justify-center gap-2">
                <Clock className="w-5 h-5 text-secondary" />
                <span className={`text-2xl font-extrabold ${timerSeconds <= 5 ? 'text-danger animate-ping' : 'text-foreground'}`}>
                  {timerSeconds}s
                </span>
              </div>

              {!isTimerRunning && (
                <button
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
                  <p className="font-arabic text-3xl text-foreground leading-loose dir-rtl" dir="rtl">
                    {currentVerse.textUthmani}
                  </p>
                  <button
                    onClick={() => {
                      setTimerActive(false);
                      confetti({ particleCount: 60 });
                      awardXP(20);
                    }}
                    className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold shadow-md transition-colors"
                  >
                    I Recited It In Time! (+20 XP)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* MODE J: GUIDED SESSION */}
          {activeMode === 'J' && (
            <div className="space-y-6 text-center">
              <div className="space-y-1">
                <span className="text-xs font-bold text-primary uppercase tracking-wider">Mode J • Guided session</span>
                <h3 className="text-lg font-bold text-foreground">Guided Recitation Session</h3>
                <p className="text-xs text-muted-foreground">Work through the verse with the assistant to identify phonetic pitfalls and mnemonic associations.</p>
              </div>

              <div className="p-6 bg-primary-subtle rounded-2xl border border-primary/30 text-center space-y-3">
                <Sparkles className="w-8 h-8 text-secondary mx-auto" />
                <h4 className="text-sm font-bold text-foreground">
                  Ready to test Surah {currentVerse.surah}:{currentVerse.ayah}
                </h4>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  The assistant asks about roots, Tajweed phonetics and the Tamil or English meaning of this verse.
                </p>
                <button
                  onClick={() => {
                    setAiTutorPrompt(`Please guide me in memorizing Surah ${currentVerse.surah}:${currentVerse.ayah} ("${currentVerse.textUthmani}"). Give me: 1) Memory anchors / root connections, 2) Tajweed pronunciation watch-outs, 3) Tamil explanation to reinforce meaning.`);
                    setAiTutorOpen(true);
                  }}
                  className="px-6 py-3 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold shadow-md transition-colors"
                >
                  Start guided session
                </button>
              </div>
            </div>
          )}

        </div>
      ) : (
        <div className="max-w-xl mx-auto my-12 p-8 rounded-3xl bg-card border border-border text-center space-y-4">
          <AlertCircle className="w-8 h-8 mx-auto text-warning" aria-hidden="true" />
          <h3 className="text-base font-bold text-foreground">
            Surah {selectedSurahId} could not be loaded
          </h3>
          <p className="text-xs text-muted-foreground">
            No text is shown, because displaying a different surah&rsquo;s verses here would
            misrepresent the Quran. Check your connection, then try again.
          </p>
          {verseLoadFailed && (
            <button
              type="button"
              onClick={() => setLoadAttempt((previous) => previous + 1)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-surface border border-border text-foreground hover:bg-surface-hover text-xs font-bold transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Try again</span>
            </button>
          )}
        </div>
      )}

      {/* Floating Study Assistant when triggered */}
      <TutorPanel
        isOpen={aiTutorOpen}
        onClose={() => setAiTutorOpen(false)}
        initialPrompt={aiTutorPrompt}
      />
    </div>
  );
}

export default function MemorizationPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-xs text-muted-foreground">Loading memorization modes…</div>}>
      <MemorizationContent />
    </Suspense>
  );
}
