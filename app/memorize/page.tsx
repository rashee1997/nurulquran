'use client';

import React, { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import confetti from 'canvas-confetti';
import { Brain, RotateCcw, ArrowRight, AlertCircle, Clock, BookOpen } from 'lucide-react';
import { SURAHS } from '@/lib/quran/surahs';
import { quranProvider } from '@/lib/quran/alquran-cloud';
import { Verse } from '@/lib/quran/types';
import { db } from '@/lib/db';
import { calculateNextReview, initializeVerseProgress } from '@/lib/learning/srs-engine';
import { recordActivity } from '@/lib/learning/activity';
import { track } from '@/lib/telemetry/events';
import { shuffle } from '@/lib/utils';
import { usePreviewAudio } from '@/hooks/use-preview-audio';
import { TutorPanel } from '@/components/ai/TutorPanel';
import { HIFZ_MODES, isHifzModeKey, type HifzModeKey, type ModeStageProps } from '@/components/memorize/types';
import { CompleteVerseMode, AudioToAyahMode, MeaningToAyahMode } from '@/components/memorize/ChoiceModes';
import {
  ListenRepeatMode,
  WordReorderMode,
  FirstWordMode,
  MissingSegmentMode,
  SpeedRecallMode,
  GuidedSessionMode,
} from '@/components/memorize/RecallModes';
import { RecitationMode } from '@/components/memorize/RecitationMode';

export type { HifzModeKey } from '@/components/memorize/types';

type DrillSource = 'surah' | 'queue';

const MODE_COMPONENTS: Record<HifzModeKey, React.FC<ModeStageProps>> = {
  A: ListenRepeatMode,
  B: CompleteVerseMode,
  C: WordReorderMode,
  D: FirstWordMode,
  E: AudioToAyahMode,
  F: MeaningToAyahMode,
  G: MissingSegmentMode,
  H: RecitationMode,
  I: SpeedRecallMode,
  J: GuidedSessionMode,
};

function MemorizationContent() {
  const searchParams = useSearchParams();
  const requestedMode = searchParams.get('mode');
  const requestedSource: DrillSource = searchParams.get('source') === 'queue' ? 'queue' : 'surah';
  const requestedSurah = Number(searchParams.get('surah'));

  const [activeMode, setActiveMode] = useState<HifzModeKey>(isHifzModeKey(requestedMode) ? requestedMode : 'A');
  const [source, setSource] = useState<DrillSource>(requestedSource);
  const [selectedSurahId, setSelectedSurahId] = useState<number>(
    Number.isInteger(requestedSurah) && requestedSurah >= 1 && requestedSurah <= 114 ? requestedSurah : 1
  );
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const [verses, setVerses] = useState<Verse[]>([]);
  /** Identifies which selection the verses in state were loaded for. */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [verseLoadFailed, setVerseLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [currentVerseIndex, setCurrentVerseIndex] = useState(0);
  const [loadingVerses, setLoadingVerses] = useState(true);
  const [queueEmpty, setQueueEmpty] = useState(false);

  // Mode-specific state
  const [assembledIndices, setAssembledIndicesState] = useState<number[]>([]);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [isAnswerChecked, setIsAnswerChecked] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(15);
  const [timerActive, setTimerActive] = useState(false);
  const [aiTutorOpen, setAiTutorOpen] = useState(false);
  const [aiTutorPrompt, setAiTutorPrompt] = useState('');
  const [roundComplete, setRoundComplete] = useState(false);

  const { playUrl, speak } = usePreviewAudio();

  /**
   * Restore the last surah and mode unless the URL asked for something specific. A learner
   * who drilled Al-Kahf yesterday should not come back to Al-Fatihah, mode A.
   */
  useEffect(() => {
    let active = true;
    db.userProfile
      .get('default_user')
      .then((profile) => {
        if (!active) return;
        if (!searchParams.get('surah') && profile?.lastMemorizeSurah) setSelectedSurahId(profile.lastMemorizeSurah);
        if (!requestedMode && isHifzModeKey(profile?.lastMemorizeMode)) setActiveMode(profile.lastMemorizeMode);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setPrefsLoaded(true);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!prefsLoaded) return;
    db.userProfile
      .get('default_user')
      .then((profile) => {
        if (!profile) return;
        return db.userProfile.update('default_user', { lastMemorizeSurah: selectedSurahId, lastMemorizeMode: activeMode });
      })
      .catch(() => undefined);
  }, [selectedSurahId, activeMode, prefsLoaded]);

  const resetModeState = useCallback(() => {
    setAssembledIndicesState([]);
    setSelectedChoice(null);
    setIsAnswerChecked(false);
    setIsCorrect(false);
    setIsRevealed(false);
    setTimerSeconds(15);
    setTimerActive(false);
  }, []);

  const selectionKey = source === 'queue' ? 'queue' : `surah:${selectedSurahId}`;

  // Load the verse set: a whole surah, or today's due queue.
  useEffect(() => {
    if (!prefsLoaded) return;
    let cancelled = false;

    async function load() {
      setLoadingVerses(true);
      setQueueEmpty(false);
      try {
        let loaded: Verse[];
        if (source === 'queue') {
          const now = new Date().toISOString();
          const due = (await db.verseProgress.toArray()).filter((item) => item.dueDate <= now || item.repetitions === 0);
          due.sort((a, b) => a.surah - b.surah || a.ayah - b.ayah);
          if (due.length === 0) {
            if (!cancelled) {
              setVerses([]);
              setLoadedFor('queue');
              setQueueEmpty(true);
              setVerseLoadFailed(false);
            }
            return;
          }
          loaded = await Promise.all(due.slice(0, 40).map((item) => quranProvider.getVerse({ surah: item.surah, ayah: item.ayah })));
          track('memorize.drill_started', { source: 'queue', count: loaded.length, mode: activeMode });
        } else {
          loaded = await quranProvider.getChapterVerses(selectedSurahId);
          track('memorize.drill_started', { source: 'surah', surah: selectedSurahId, mode: activeMode });
        }
        if (cancelled) return;
        setVerses(loaded);
        setLoadedFor(selectionKey);
        setVerseLoadFailed(false);
        setCurrentVerseIndex(0);
        setRoundComplete(false);
        resetModeState();
      } catch (error: unknown) {
        if (cancelled) return;
        console.error(`Failed to load verses for ${selectionKey}:`, error);
        setVerses([]);
        setLoadedFor(null);
        setCurrentVerseIndex(0);
        setVerseLoadFailed(true);
      } finally {
        if (!cancelled) setLoadingVerses(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
    // The mode is intentionally not a dependency: switching modes keeps the loaded set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey, loadAttempt, resetModeState, prefsLoaded]);

  const isTimerRunning = activeMode === 'I' && timerActive && timerSeconds > 0;
  useEffect(() => {
    if (!isTimerRunning) return;
    const interval = setInterval(() => setTimerSeconds((previous) => Math.max(0, previous - 1)), 1000);
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  const versesForSelection = useMemo(() => (loadedFor === selectionKey ? verses : []), [loadedFor, selectionKey, verses]);
  const currentVerse = versesForSelection[currentVerseIndex] ?? versesForSelection[0];

  const playAudio = useCallback(
    async (url?: string, text?: string, verseKey?: string): Promise<void> => {
      const key = verseKey ?? url ?? 'unknown';
      if (url) {
        const played = await playUrl(`memorize:${key}`, url);
        if (played) return;
      }
      if (text) await speak(`memorize-speech:${key}`, text, 'ar-SA');
    },
    [playUrl, speak]
  );

  const awardXP = useCallback(
    async (amount: number) => {
      await recordActivity({ xp: amount, event: 'memorize.graded', props: { mode: activeMode, source } });
    },
    [activeMode, source]
  );

  const advance = useCallback(() => {
    if (currentVerseIndex < versesForSelection.length - 1) {
      setCurrentVerseIndex((prev) => prev + 1);
      resetModeState();
    } else {
      setIsRevealed(false);
      setRoundComplete(true);
    }
  }, [currentVerseIndex, resetModeState, versesForSelection.length]);

  const handleSelfGrade = useCallback(
    async (quality: number) => {
      if (!currentVerse) return;
      const key = `${currentVerse.surah}:${currentVerse.ayah}`;
      const existing = (await db.verseProgress.get(key)) ?? initializeVerseProgress(currentVerse.surah, currentVerse.ayah);
      const next = calculateNextReview(existing, quality);
      await db.verseProgress.put(next);
      if (quality >= 3) {
        try {
          confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
        } catch {
          // optional
        }
        await awardXP(15);
      } else {
        await awardXP(5);
      }
      advance();
    },
    [advance, awardXP, currentVerse]
  );

  const choiceOptions = useMemo(() => {
    if (!currentVerse || versesForSelection.length < 2) return [];
    const others = versesForSelection
      .filter((verse) => verse.ayah !== currentVerse.ayah || verse.surah !== currentVerse.surah)
      .slice(0, 3)
      .map((verse) => verse.textUthmani);
    return shuffle([currentVerse.textUthmani, ...others]);
  }, [currentVerse, versesForSelection]);

  const handleCheckMultipleChoice = useCallback(
    (chosen: string) => {
      if (!currentVerse) return;
      setSelectedChoice(chosen);
      const correct = chosen === currentVerse.textUthmani;
      setIsCorrect(correct);
      setIsAnswerChecked(true);
      if (correct) {
        try {
          confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
        } catch {
          // optional
        }
        void awardXP(10);
      }
    },
    [awardXP, currentVerse]
  );

  const setAssembledIndices = useCallback((updater: (previous: number[]) => number[]) => {
    setAssembledIndicesState((previous) => updater(previous));
  }, []);

  const openTutor = useCallback((prompt: string) => {
    setAiTutorPrompt(prompt);
    setAiTutorOpen(true);
  }, []);

  const ModeComponent = MODE_COMPONENTS[activeMode];

  const stageProps: ModeStageProps | null = currentVerse
    ? {
        verse: currentVerse,
        verses: versesForSelection,
        choiceOptions,
        selectedChoice,
        isAnswerChecked,
        isCorrect,
        isRevealed,
        assembledIndices,
        timerSeconds,
        isTimerRunning,
        setSelectedChoice,
        setIsAnswerChecked,
        setIsCorrect,
        setIsRevealed,
        setAssembledIndices,
        setTimerSeconds,
        setTimerActive,
        playAudio,
        awardXP,
        handleSelfGrade,
        handleCheckMultipleChoice,
        openTutor,
      }
    : null;

  return (
    <div id="memorization-suite" className="space-y-6 animate-in fade-in duration-300">
      {/* Header, source switch and surah selector */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-card p-5 rounded-3xl border border-border shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary-subtle flex items-center justify-center text-primary font-bold">
            <Brain className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">Memorization Modes</h1>
            <p className="text-xs text-muted-foreground">Ten recall drills linked to spaced repetition</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/memorize/planner"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-subtle text-primary-strong text-xs font-bold border border-primary/20 hover:bg-primary-subtle/80 transition-colors"
          >
            <span>Sabaq/Sabqi Plan</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>

          <div className="inline-flex items-center p-1 rounded-xl bg-surface border border-border">
            <button
              type="button"
              onClick={() => setSource('queue')}
              aria-pressed={source === 'queue'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                source === 'queue' ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Today&apos;s due</span>
            </button>
            <button
              type="button"
              onClick={() => setSource('surah')}
              aria-pressed={source === 'surah'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                source === 'surah' ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>By surah</span>
            </button>
          </div>

          {source === 'surah' && (
            <div className="flex items-center gap-2">
              <label htmlFor="memorize-surah" className="text-xs font-semibold text-muted-foreground">
                Surah:
              </label>
              <select
                id="memorize-surah"
                value={selectedSurahId}
                onChange={(e) => setSelectedSurahId(Number(e.target.value))}
                className="text-xs font-semibold px-3 py-2 rounded-xl bg-surface text-foreground border border-border outline-hidden cursor-pointer max-w-[260px]"
              >
                {SURAHS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id}. {s.nameSimple} ({s.nameEnglish}) - {s.versesCount} Ayahs
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Mode picker */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none" role="tablist" aria-label="Memorization mode">
        {HIFZ_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={activeMode === m.id}
            onClick={() => {
              setActiveMode(m.id);
              resetModeState();
            }}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              activeMode === m.id
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'bg-card text-muted-foreground border border-border hover:bg-surface-hover hover:text-foreground'
            }`}
          >
            <span>{m.icon}</span>
            <span>
              Mode {m.id}: {m.name}
            </span>
          </button>
        ))}
      </div>

      {/* Verse navigation */}
      {versesForSelection.length > 0 && currentVerse && (
        <div className="flex items-center justify-between px-4 py-2 bg-surface rounded-2xl border border-border text-xs font-semibold text-muted-foreground">
          <span>
            Ayah {currentVerseIndex + 1} of {versesForSelection.length} (Surah {currentVerse.surah}:{currentVerse.ayah})
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentVerseIndex === 0}
              onClick={() => {
                setCurrentVerseIndex((prev) => Math.max(0, prev - 1));
                resetModeState();
              }}
              className="px-2.5 py-1 rounded-lg bg-card border border-border hover:bg-surface-hover text-foreground disabled:opacity-40 transition-colors"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={currentVerseIndex === versesForSelection.length - 1}
              onClick={() => {
                setCurrentVerseIndex((prev) => Math.min(versesForSelection.length - 1, prev + 1));
                resetModeState();
              }}
              className="px-2.5 py-1 rounded-lg bg-card border border-border hover:bg-surface-hover text-foreground disabled:opacity-40 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Stage */}
      {loadingVerses ? (
        <div className="text-center py-20 text-muted-foreground">
          <Brain className="w-8 h-8 mx-auto mb-2 animate-spin text-primary" />
          <p className="text-xs">{source === 'queue' ? 'Loading today’s due ayahs…' : `Loading verses for Surah ${selectedSurahId}…`}</p>
        </div>
      ) : roundComplete ? (
        <div className="max-w-md mx-auto my-8 p-8 rounded-3xl bg-card border border-border text-center space-y-4 shadow-xl">
          <h3 className="text-lg font-bold text-foreground">Round complete — Alhamdulillah</h3>
          <p className="text-xs text-muted-foreground">You worked through all {versesForSelection.length} ayahs in this set.</p>
          <div className="flex gap-3 justify-center">
            <button
              type="button"
              onClick={() => {
                setCurrentVerseIndex(0);
                setRoundComplete(false);
                resetModeState();
              }}
              className="px-4 py-2.5 rounded-xl bg-surface border border-border text-foreground text-xs font-bold"
            >
              Go again
            </button>
            <Link href="/review" className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-md">
              Open review queue
            </Link>
          </div>
        </div>
      ) : queueEmpty ? (
        <div className="max-w-xl mx-auto my-12 p-8 rounded-3xl bg-card border border-border text-center space-y-4">
          <Clock className="w-8 h-8 mx-auto text-primary" aria-hidden="true" />
          <h3 className="text-base font-bold text-foreground">Nothing is due right now</h3>
          <p className="text-xs text-muted-foreground">
            Your scheduled ayahs are not due yet. Drill a surah instead, or add new ayahs from the reader.
          </p>
          <div className="flex gap-3 justify-center">
            <button type="button" onClick={() => setSource('surah')} className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-md">
              Drill by surah
            </button>
            <Link href="/quran" className="px-4 py-2.5 rounded-xl bg-surface border border-border text-foreground text-xs font-bold">
              Open the reader
            </Link>
          </div>
        </div>
      ) : stageProps ? (
        <div className="bg-card p-6 sm:p-8 rounded-3xl border border-border shadow-md min-h-[380px]">
          <ModeComponent {...stageProps} />
        </div>
      ) : (
        <div className="max-w-xl mx-auto my-12 p-8 rounded-3xl bg-card border border-border text-center space-y-4">
          <AlertCircle className="w-8 h-8 mx-auto text-warning" aria-hidden="true" />
          <h3 className="text-base font-bold text-foreground">
            {source === 'queue' ? 'The due ayahs could not be loaded' : `Surah ${selectedSurahId} could not be loaded`}
          </h3>
          <p className="text-xs text-muted-foreground">
            No text is shown, because displaying a different surah&rsquo;s verses here would misrepresent the Quran. Check your
            connection, then try again.
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

      <TutorPanel isOpen={aiTutorOpen} onClose={() => setAiTutorOpen(false)} initialPrompt={aiTutorPrompt} />
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
