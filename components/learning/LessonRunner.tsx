'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import confetti from 'canvas-confetti';
import { Volume2, CheckCircle2, XCircle, ArrowRight, RotateCcw, Award, Sparkles } from 'lucide-react';
import { Activity, Lesson } from '@/lib/learning/curriculum';
import { db } from '@/lib/db';
import { evaluateStreak } from '@/lib/learning/xp-engine';
import { localDayKey } from '@/lib/time/day';
import { usePreviewAudio } from '@/hooks/use-preview-audio';
import { playLetterAudio } from '@/lib/audio/alphabet-audio';
import { LiveTajweedCoach } from '@/components/learning/LiveTajweedCoach';

interface LessonRunnerProps {
  lesson: Lesson;
  onFinished?: () => void;
}

export const LessonRunner: React.FC<LessonRunnerProps> = ({ lesson, onFinished }) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [assembledTokens, setAssembledTokens] = useState<string[]>([]);
  const [isAnswerChecked, setIsAnswerChecked] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [score, setScore] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [earnedXp, setEarnedXp] = useState(0);
  const [finalAccuracy, setFinalAccuracy] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isCoachOpen, setIsCoachOpen] = useState(false);

  const { playUrl, speak } = usePreviewAudio();
  /** Guards against a double-tap awarding the lesson reward twice. */
  const completionRef = useRef(false);

  const totalActivities = lesson.activities.length;
  const currentActivity: Activity | undefined = lesson.activities[currentIdx];
  const progressPercent = Math.round(((currentIdx + 1) / totalActivities) * 100);

  useEffect(() => {
    // A new lesson (or a retry) starts from a clean completion guard.
    completionRef.current = false;
  }, [lesson.id]);

  const playPromptAudio = useCallback(
    async (text?: string, url?: string): Promise<void> => {
      if (!url && !text) return;
      setIsPlayingAudio(true);
      try {
        if (url) {
          const played = await playUrl(`lesson:${lesson.id}:${currentIdx}`, url);
          if (played) return;
        }
        if (text) {
          // No usable recording: speak the letter, then fall back to a tone.
          await playLetterAudio(text);
        }
      } catch (error) {
        console.warn('Prompt audio could not be played:', error);
      } finally {
        setIsPlayingAudio(false);
      }
    },
    [currentIdx, lesson.id, playUrl]
  );

  const checkAnswer = useCallback((): void => {
    if (!currentActivity || isAnswerChecked) return;

    const correct =
      currentActivity.type === 'word_order'
        ? assembledTokens.join(' ').trim() === currentActivity.correctAnswer.trim()
        : (selectedOption ?? '').trim() === currentActivity.correctAnswer.trim();

    setIsCorrect(correct);
    setIsAnswerChecked(true);
    if (correct) {
      setScore((previous) => previous + 1);
    }
  }, [assembledTokens, currentActivity, isAnswerChecked, selectedOption]);

  const handleNext = useCallback(async (): Promise<void> => {
    if (!currentActivity) return;

    if (currentIdx < totalActivities - 1) {
      setIsAnswerChecked(false);
      setSelectedOption(null);
      setAssembledTokens([]);
      setCurrentIdx((previous) => previous + 1);
      return;
    }

    // Finishing the lesson. `score` already contains the answer that was just
    // checked, so it is used as-is; adding the current result again was inflating
    // accuracy past 100% on a perfect run.
    if (completionRef.current) return;
    completionRef.current = true;

    const accuracy = totalActivities > 0 ? Math.round((score / totalActivities) * 100) : 0;
    const xp = lesson.xpReward;
    setFinalAccuracy(accuracy);
    setEarnedXp(xp);
    setIsCompleted(true);

    try {
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
    } catch (error) {
      console.warn('Celebration effect unavailable:', error);
    }

    setIsSaving(true);
    try {
      await db.lessonHistory.put({
        lessonId: lesson.id,
        score: accuracy,
        xpEarned: xp,
        completedAt: new Date().toISOString(),
      });

      const profile = await db.userProfile.get('default_user');
      if (profile) {
        const streakEval = evaluateStreak(profile.lastActiveDate, profile.streakCount);
        await db.userProfile.update('default_user', {
          totalXp: profile.totalXp + xp,
          streakCount: streakEval.newStreak,
          lastActiveDate: localDayKey(),
        });
      }
    } catch (error) {
      console.error('Failed to record lesson completion:', error);
      setSaveError('This result could not be saved on this device. Your XP was not recorded.');
    } finally {
      setIsSaving(false);
    }

    onFinished?.();
  }, [currentActivity, currentIdx, lesson.id, lesson.xpReward, onFinished, score, totalActivities]);

  const restartLesson = useCallback((): void => {
    completionRef.current = false;
    setCurrentIdx(0);
    setSelectedOption(null);
    setAssembledTokens([]);
    setIsAnswerChecked(false);
    setIsCorrect(false);
    setScore(0);
    setIsCompleted(false);
    setEarnedXp(0);
    setFinalAccuracy(0);
    setSaveError(null);
  }, []);

  if (isCompleted) {
    return (
      <div
        id="lesson-completed-screen"
        className="max-w-xl mx-auto p-8 bg-card rounded-3xl border border-border shadow-xl text-center space-y-6 animate-in zoom-in-95"
      >
        <div className="w-20 h-20 rounded-2xl bg-secondary-subtle mx-auto flex items-center justify-center text-secondary-strong shadow-md">
          <Award className="w-10 h-10" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">Lesson Completed</h2>
          <p className="text-sm text-muted-foreground">
            You finished <span className="font-semibold text-foreground">{lesson.title}</span>.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 py-3">
          <div className="p-4 rounded-2xl bg-primary-subtle border border-primary/30">
            <span className="text-xs text-primary-strong font-semibold uppercase">XP Earned</span>
            <p className="text-3xl font-extrabold text-primary-strong">
              +{isSaving ? '…' : earnedXp}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-secondary-subtle border border-secondary/30">
            <span className="text-xs text-secondary-strong font-semibold uppercase">Accuracy</span>
            <p className="text-3xl font-extrabold text-secondary-strong">{finalAccuracy}%</p>
          </div>
        </div>

        {saveError && (
          <p role="alert" className="text-xs font-semibold text-danger-strong bg-danger-subtle rounded-xl px-3 py-2">
            {saveError}
          </p>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={restartLesson}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-border hover:bg-surface-hover text-xs font-bold text-foreground transition-colors"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            <span>Practice Again</span>
          </button>

          <Link
            href="/learn"
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold transition-all shadow-md active:scale-95"
          >
            <span>Back to Map</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    );
  }

  if (!currentActivity) {
    return (
      <div className="max-w-xl mx-auto p-8 bg-card rounded-3xl border border-border text-center space-y-3">
        <p className="text-sm font-semibold text-foreground">This lesson has no activities yet.</p>
        <Link href="/learn" className="text-xs font-bold text-primary hover:text-primary-strong">
          Return to the curriculum map
        </Link>
      </div>
    );
  }

  return (
    <div id="lesson-runner" className="max-w-2xl mx-auto space-y-6">
      {/* Progress header */}
      <div className="space-y-2">
        <div className="flex justify-between items-center text-xs font-semibold text-muted-foreground">
          <span>
            Question {currentIdx + 1} of {totalActivities}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsCoachOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary hover:bg-primary-hover text-primary-foreground font-bold text-[11px] shadow-xs active:scale-95 transition-all"
              title="Open the recitation guide"
            >
              <Sparkles className="w-3 h-3 text-secondary" aria-hidden="true" />
              <span>Recitation Guide</span>
            </button>
            <span className="hidden sm:inline font-medium text-foreground">{lesson.title}</span>
          </div>
        </div>
        <div
          className="w-full bg-surface-muted h-2 rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Lesson progress"
        >
          <div
            className="h-full bg-primary transition-all duration-300 rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Activity card */}
      <div className="bg-card border border-border rounded-3xl p-6 sm:p-8 shadow-lg space-y-6">
        <div className="space-y-1 text-center">
          <span className="text-[11px] font-bold uppercase tracking-wider text-primary-strong">
            {currentActivity.type.replace(/_/g, ' ')}
          </span>
          <h3 className="text-xl font-bold text-foreground">{currentActivity.title}</h3>
          <p className="text-sm text-muted-foreground">{currentActivity.instruction}</p>
        </div>

        {currentActivity.promptArabic && (
          <div className="space-y-4">
            <div className="text-center py-6 px-4 bg-surface rounded-2xl border border-border space-y-3">
              <p
                className="text-5xl sm:text-6xl font-arabic text-foreground select-none py-2 leading-[2.2] tracking-normal"
                dir="rtl"
                lang="ar"
              >
                {currentActivity.promptArabic}
              </p>
              <button
                type="button"
                onClick={() => void playPromptAudio(currentActivity.promptArabic, currentActivity.promptAudioUrl)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all active:scale-95 ${
                  isPlayingAudio
                    ? 'bg-secondary text-secondary-foreground shadow-md ring-2 ring-secondary/40'
                    : 'bg-primary-subtle text-primary-strong hover:bg-primary/20'
                }`}
              >
                <Volume2 className="w-4 h-4" aria-hidden="true" />
                <span>{isPlayingAudio ? 'Playing…' : 'Hear Pronunciation'}</span>
              </button>
            </div>

            <LiveTajweedCoach
              variant="embedded"
              currentLessonTitle={lesson.title}
              currentActivityTitle={currentActivity.title}
              promptArabic={currentActivity.promptArabic}
              targetRule={currentActivity.instruction}
              onExpandModal={() => setIsCoachOpen(true)}
            />
          </div>
        )}

        {/* Word order builder */}
        {currentActivity.type === 'word_order' && currentActivity.wordTokens && (
          <div className="space-y-4">
            <div
              className="min-h-[64px] p-4 bg-surface rounded-2xl border-2 border-dashed border-border flex flex-wrap gap-2 items-center justify-center dir-rtl"
              dir="rtl"
            >
              {assembledTokens.length === 0 ? (
                <span className="text-xs text-muted-foreground font-sans" dir="ltr">
                  Tap the words below to arrange them here
                </span>
              ) : (
                assembledTokens.map((token, tokenIndex) => (
                  <button
                    type="button"
                    key={`${token}-${tokenIndex}`}
                    onClick={() => {
                      if (!isAnswerChecked) {
                        setAssembledTokens((previous) => previous.filter((_, i) => i !== tokenIndex));
                      }
                    }}
                    className="font-arabic text-xl px-3 py-1.5 rounded-xl bg-primary text-primary-foreground shadow-xs hover:bg-danger transition-colors"
                  >
                    {token}
                  </button>
                ))
              )}
            </div>

            <div className="flex flex-wrap gap-2 justify-center dir-rtl" dir="rtl">
              {currentActivity.wordTokens.map((token, tokenIndex) => {
                const countUsed = assembledTokens.filter((t) => t === token).length;
                const countTotal = currentActivity.wordTokens?.filter((t) => t === token).length ?? 0;
                const isAllUsed = countUsed >= countTotal;

                return (
                  <button
                    type="button"
                    key={`${token}-${tokenIndex}`}
                    disabled={isAllUsed || isAnswerChecked}
                    onClick={() => {
                      setAssembledTokens((previous) => [...previous, token]);
                      void speak(`token:${currentIdx}:${tokenIndex}`, token, 'ar-SA');
                    }}
                    className={`font-arabic text-2xl px-4 py-2 rounded-xl border transition-all ${
                      isAllUsed
                        ? 'opacity-30 border-border pointer-events-none'
                        : 'bg-surface border-border text-foreground hover:border-primary hover:shadow-md'
                    }`}
                  >
                    {token}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Multiple choice */}
        {currentActivity.options && currentActivity.type !== 'word_order' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {currentActivity.options.map((option, optionIndex) => {
              const isSelected = selectedOption === option;
              let btnStyle = 'bg-surface border-border text-foreground hover:border-primary';

              if (isAnswerChecked) {
                if (option === currentActivity.correctAnswer) {
                  btnStyle = 'bg-success text-success-foreground border-success';
                } else if (isSelected) {
                  btnStyle = 'bg-danger text-danger-foreground border-danger';
                } else {
                  btnStyle = 'opacity-40 border-border';
                }
              } else if (isSelected) {
                btnStyle = 'bg-primary-subtle border-primary text-primary-strong ring-2 ring-primary/40';
              }

              return (
                <button
                  type="button"
                  key={`${option}-${optionIndex}`}
                  disabled={isAnswerChecked}
                  onClick={() => {
                    setSelectedOption(option);
                    void speak(`option:${currentIdx}:${optionIndex}`, option, 'ar-SA');
                  }}
                  className={`p-4 rounded-2xl border text-sm font-semibold transition-all text-center flex items-center justify-center gap-2 cursor-pointer ${btnStyle}`}
                >
                  <span className="font-arabic text-2xl select-none" dir="rtl" lang="ar">
                    {option}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Feedback */}
        {isAnswerChecked && (
          <div
            role="status"
            className={`p-4 rounded-2xl border flex items-start gap-3 animate-in slide-in-from-bottom-2 ${
              isCorrect
                ? 'bg-success-subtle border-success/40 text-success-strong'
                : 'bg-danger-subtle border-danger/40 text-danger-strong'
            }`}
          >
            {isCorrect ? (
              <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" aria-hidden="true" />
            ) : (
              <XCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" aria-hidden="true" />
            )}

            <div className="space-y-1 text-xs">
              <h4 className="font-bold text-sm">
                {isCorrect ? 'Correct' : `Not quite — the answer is ${currentActivity.correctAnswer}`}
              </h4>
              {currentActivity.explanationEn && <p className="opacity-90">{currentActivity.explanationEn}</p>}
              {currentActivity.explanationTa && (
                <p className="opacity-90 font-tamil">{currentActivity.explanationTa}</p>
              )}
            </div>
          </div>
        )}

        {/* Action */}
        <div className="pt-4 border-t border-border">
          {!isAnswerChecked ? (
            <button
              type="button"
              onClick={checkAnswer}
              disabled={
                currentActivity.type === 'word_order'
                  ? assembledTokens.length === 0
                  : !selectedOption
              }
              className="w-full py-3.5 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:pointer-events-none text-primary-foreground font-bold text-sm transition-all shadow-md active:scale-98"
            >
              Check Answer
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleNext()}
              disabled={isSaving}
              className="w-full py-3.5 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-60 text-primary-foreground font-bold text-sm transition-all shadow-md active:scale-98 flex items-center justify-center gap-2"
            >
              <span>
                {currentIdx < totalActivities - 1
                  ? 'Continue'
                  : isSaving
                    ? 'Saving result…'
                    : 'Finish Lesson'}
              </span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <LiveTajweedCoach
        variant="modal"
        isOpen={isCoachOpen}
        onClose={() => setIsCoachOpen(false)}
        currentLessonTitle={lesson.title}
        currentActivityTitle={currentActivity.title}
        promptArabic={currentActivity.promptArabic}
        targetRule={currentActivity.instruction}
      />
    </div>
  );
};
