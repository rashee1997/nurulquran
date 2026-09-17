'use client';

import React, { useState } from 'react';
import { Activity, Lesson } from '@/lib/learning/curriculum';
import { db } from '@/lib/db';
import { evaluateStreak } from '@/lib/learning/xp-engine';
import { playLetterAudio } from '@/lib/audio/alphabet-audio';
import confetti from 'canvas-confetti';
import { Volume2, CheckCircle2, XCircle, ArrowRight, RotateCcw, Award, Loader2, Sparkles } from 'lucide-react';
import Link from 'next/link';
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
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isCoachOpen, setIsCoachOpen] = useState(false);

  const currentActivity: Activity = lesson.activities[currentIdx];
  const progressPercent = Math.round(((currentIdx) / lesson.activities.length) * 100);

  const playAudio = async (text?: string, url?: string) => {
    setIsPlayingAudio(true);
    if (url) {
      const audio = new Audio(url);
      audio.onended = () => setIsPlayingAudio(false);
      audio.onerror = async () => {
        if (text) {
          await playLetterAudio(text, (state) => {
            if (state === 'ended' || state === 'error') setIsPlayingAudio(false);
          });
        } else {
          setIsPlayingAudio(false);
        }
      };
      try {
        await audio.play();
      } catch {
        if (text) {
          await playLetterAudio(text, (state) => {
            if (state === 'ended' || state === 'error') setIsPlayingAudio(false);
          });
        } else {
          setIsPlayingAudio(false);
        }
      }
    } else if (text) {
      await playLetterAudio(text, (state) => {
        if (state === 'ended' || state === 'error') setIsPlayingAudio(false);
      });
    } else {
      setIsPlayingAudio(false);
    }
  };

  const checkAnswer = () => {
    let correct = false;

    if (currentActivity.type === 'word_order') {
      const userSentence = assembledTokens.join(' ').trim();
      correct = userSentence === currentActivity.correctAnswer.trim();
    } else {
      correct = selectedOption?.trim() === currentActivity.correctAnswer.trim();
    }

    setIsCorrect(correct);
    setIsAnswerChecked(true);

    if (correct) {
      setScore(prev => prev + 1);
    }
  };

  const handleNext = async () => {
    setIsAnswerChecked(false);
    setSelectedOption(null);
    setAssembledTokens([]);

    if (currentIdx < lesson.activities.length - 1) {
      setCurrentIdx(prev => prev + 1);
    } else {
      // Lesson finished!
      const totalActivities = lesson.activities.length;
      const finalScore = Math.round(((score + (isCorrect ? 1 : 0)) / totalActivities) * 100);
      const xp = lesson.xpReward;
      setEarnedXp(xp);
      setIsCompleted(true);

      // Trigger celebration confetti
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch (e) {
        console.warn(e);
      }

      // Save to Dexie
      try {
        await db.lessonHistory.put({
          lessonId: lesson.id,
          score: finalScore,
          xpEarned: xp,
          completedAt: new Date().toISOString(),
        });

        const profile = await db.userProfile.get('default_user');
        if (profile) {
          const streakEval = evaluateStreak(profile.lastActiveDate, profile.streakCount);
          await db.userProfile.update('default_user', {
            totalXp: profile.totalXp + xp,
            streakCount: streakEval.newStreak,
            lastActiveDate: new Date().toISOString().split('T')[0],
          });
        }
      } catch (err) {
        console.error('Failed to record lesson completion:', err);
      }

      if (onFinished) onFinished();
    }
  };

  const restartLesson = () => {
    setCurrentIdx(0);
    setSelectedOption(null);
    setAssembledTokens([]);
    setIsAnswerChecked(false);
    setIsCorrect(false);
    setScore(0);
    setIsCompleted(false);
  };

  // Completion Screen
  if (isCompleted) {
    return (
      <div id="lesson-completed-screen" className="max-w-xl mx-auto p-8 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl text-center space-y-6 animate-in zoom-in-95">
        <div className="w-20 h-20 rounded-2xl bg-amber-100 dark:bg-amber-950/60 mx-auto flex items-center justify-center text-amber-500 shadow-md">
          <Award className="w-10 h-10" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Lesson Completed!
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            You successfully finished <span className="font-semibold text-slate-800 dark:text-slate-200">{lesson.title}</span>.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 py-3">
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40">
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold uppercase">XP Earned</span>
            <p className="text-3xl font-extrabold text-emerald-700 dark:text-emerald-300">+{earnedXp}</p>
          </div>

          <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40">
            <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold uppercase">Accuracy</span>
            <p className="text-3xl font-extrabold text-amber-700 dark:text-amber-300">
              {Math.round((score / lesson.activities.length) * 100)}%
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={restartLesson}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Practice Again</span>
          </button>

          <Link
            href="/learn"
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-md active:scale-95"
          >
            <span>Back to Map</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div id="lesson-runner" className="max-w-2xl mx-auto space-y-6">
      {/* Progress header */}
      <div className="space-y-2">
        <div className="flex justify-between items-center text-xs font-semibold text-slate-500 dark:text-slate-400">
          <span>Question {currentIdx + 1} of {lesson.activities.length}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCoachOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-[11px] shadow-xs active:scale-95 transition-all"
              title="Open Live Gemini Tajweed Coach"
            >
              <Sparkles className="w-3 h-3 text-amber-300" />
              <span>AI Tajweed Coach</span>
            </button>
            <span className="hidden sm:inline font-medium text-slate-700 dark:text-slate-300">{lesson.title}</span>
          </div>
        </div>
        <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Activity Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-lg space-y-6">
        <div className="space-y-1 text-center">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            {currentActivity.type.replace('_', ' ')}
          </span>
          <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {currentActivity.title}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {currentActivity.instruction}
          </p>
        </div>

        {/* Visual Arabic prompt if present */}
        {currentActivity.promptArabic && (
          <div className="text-center py-6 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-3">
            <p className="text-5xl font-arabic text-slate-900 dark:text-slate-100 select-none py-2">
              {currentActivity.promptArabic}
            </p>
            <button
              onClick={() => playAudio(currentActivity.promptArabic, currentActivity.promptAudioUrl)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all active:scale-95 ${
                isPlayingAudio
                  ? 'bg-amber-500 text-slate-950 shadow-md animate-pulse ring-2 ring-amber-300'
                  : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900'
              }`}
            >
              {isPlayingAudio ? (
                <>
                  <Volume2 className="w-4 h-4 animate-bounce" />
                  <span>Playing Authentic Audio...</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4" />
                  <span>Hear Pronunciation</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Word Order Activity Builder */}
        {currentActivity.type === 'word_order' && currentActivity.wordTokens && (
          <div className="space-y-4">
            {/* Assembled Area */}
            <div className="min-h-[64px] p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-wrap gap-2 items-center justify-center dir-rtl" dir="rtl">
              {assembledTokens.length === 0 ? (
                <span className="text-xs text-slate-400 font-sans" dir="ltr">Tap words below to arrange them here</span>
              ) : (
                assembledTokens.map((token, tIdx) => (
                  <button
                    key={tIdx}
                    onClick={() => {
                      if (!isAnswerChecked) {
                        setAssembledTokens(prev => prev.filter((_, i) => i !== tIdx));
                      }
                    }}
                    className="font-arabic text-xl px-3 py-1.5 rounded-xl bg-emerald-600 text-white shadow-xs hover:bg-rose-500 transition-colors"
                  >
                    {token}
                  </button>
                ))
              )}
            </div>

            {/* Available Tokens */}
            <div className="flex flex-wrap gap-2 justify-center dir-rtl" dir="rtl">
              {currentActivity.wordTokens.map((token, idx) => {
                const countUsed = assembledTokens.filter(t => t === token).length;
                const countTotal = currentActivity.wordTokens!.filter(t => t === token).length;
                const isAllUsed = countUsed >= countTotal;

                return (
                  <button
                    key={idx}
                    disabled={isAllUsed || isAnswerChecked}
                    onClick={() => {
                      setAssembledTokens(prev => [...prev, token]);
                      playAudio(token);
                    }}
                    className={`font-arabic text-2xl px-4 py-2 rounded-xl border transition-all ${
                      isAllUsed
                        ? 'opacity-30 border-slate-200 dark:border-slate-800 pointer-events-none'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-emerald-500 hover:shadow-md'
                    }`}
                  >
                    {token}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Multiple choice options */}
        {currentActivity.options && currentActivity.type !== 'word_order' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {currentActivity.options.map((opt, oIdx) => {
              const isSelected = selectedOption === opt;
              let btnStyle = 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:border-emerald-500';

              if (isAnswerChecked) {
                if (opt === currentActivity.correctAnswer) {
                  btnStyle = 'bg-emerald-500 text-white border-emerald-600';
                } else if (isSelected) {
                  btnStyle = 'bg-rose-500 text-white border-rose-600';
                } else {
                  btnStyle = 'opacity-40 border-slate-200 dark:border-slate-800';
                }
              } else if (isSelected) {
                btnStyle = 'bg-emerald-50 dark:bg-emerald-950 border-emerald-500 text-emerald-800 dark:text-emerald-200 ring-2 ring-emerald-400';
              }

              return (
                <button
                  key={oIdx}
                  disabled={isAnswerChecked}
                  onClick={() => {
                    setSelectedOption(opt);
                    playAudio(opt);
                  }}
                  className={`p-4 rounded-2xl border text-sm font-semibold transition-all text-center flex items-center justify-center gap-2 cursor-pointer ${btnStyle}`}
                >
                  <span className="font-arabic text-2xl select-none">{opt}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Feedback area */}
        {isAnswerChecked && (
          <div
            className={`p-4 rounded-2xl border flex items-start gap-3 animate-in slide-in-from-bottom-2 ${
              isCorrect
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/40 text-emerald-900 dark:text-emerald-100'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/40 text-rose-900 dark:text-rose-100'
            }`}
          >
            {isCorrect ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            )}

            <div className="space-y-1 text-xs">
              <h4 className="font-bold text-sm">
                {isCorrect ? 'Excellent! Correct' : 'Not quite right'}
              </h4>
              {currentActivity.explanationEn && (
                <p className="opacity-90">{currentActivity.explanationEn}</p>
              )}
              {currentActivity.explanationTa && (
                <p className="opacity-90 font-tamil">{currentActivity.explanationTa}</p>
              )}
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
          {!isAnswerChecked ? (
            <button
              onClick={checkAnswer}
              disabled={
                currentActivity.type === 'word_order'
                  ? assembledTokens.length === 0
                  : !selectedOption
              }
              className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:pointer-events-none text-white font-bold text-sm transition-all shadow-md active:scale-98"
            >
              Check Answer
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-all shadow-md active:scale-98 flex items-center justify-center gap-2"
            >
              <span>{currentIdx < lesson.activities.length - 1 ? 'Continue' : 'Finish Lesson'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Live Gemini Tajweed Coach Modal */}
      <LiveTajweedCoach
        isOpen={isCoachOpen}
        onClose={() => setIsCoachOpen(false)}
        currentLessonTitle={lesson.title}
        currentActivityTitle={currentActivity?.title}
        promptArabic={currentActivity?.promptArabic}
        targetRule={currentActivity?.instruction}
      />
    </div>
  );
};
