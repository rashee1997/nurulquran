'use client';

import React, { useState, useEffect } from 'react';
import { db, VerseProgress } from '@/lib/db';
import { calculateNextReview, initializeVerseProgress, STATE_LABELS } from '@/lib/learning/srs-engine';
import { quranProvider } from '@/lib/quran/alquran-cloud';
import { Verse } from '@/lib/quran/types';
import { evaluateStreak } from '@/lib/learning/xp-engine';
import confetti from 'canvas-confetti';
import { Clock, Eye, Volume2, CheckCircle2, RotateCcw, ArrowRight, Sparkles, Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function SrsReviewPage() {
  const [dueItems, setDueItems] = useState<VerseProgress[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentVerseData, setCurrentVerseData] = useState<Verse | null>(null);
  const [isVerseLoading, setIsVerseLoading] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reviewedCount, setReviewedCount] = useState(0);

  useEffect(() => {
    async function loadDueQueue() {
      setLoading(true);
      try {
        let items = await db.verseProgress.toArray();
        if (items.length === 0) {
          // Initialize a few starter verses from Al-Fatihah into the queue
          const seeds = [
            initializeVerseProgress(1, 1),
            initializeVerseProgress(1, 2),
            initializeVerseProgress(1, 3),
            initializeVerseProgress(112, 1),
            initializeVerseProgress(112, 2),
          ];
          for (const s of seeds) {
            await db.verseProgress.put(s);
          }
          items = seeds;
        }

        const now = new Date().toISOString();
        const due = items.filter(i => i.dueDate <= now || i.repetitions === 0);
        setDueItems(due.length > 0 ? due : items);
        setCurrentIndex(0);
      } catch (e) {
        console.error('Failed to load review queue:', e);
      } finally {
        setLoading(false);
      }
    }
    loadDueQueue();
  }, []);

  // Fetch verse text when currentIndex changes
  useEffect(() => {
    let isMounted = true;
    if (dueItems.length > 0 && dueItems[currentIndex]) {
      const item = dueItems[currentIndex];
      quranProvider
        .getVerse({ surah: item.surah, ayah: item.ayah })
        .then((verse) => {
          if (isMounted) {
            setCurrentVerseData(verse);
            setIsRevealed(false);
            setIsVerseLoading(false);
          }
        })
        .catch((e) => {
          if (isMounted) {
            console.error(e);
            setIsVerseLoading(false);
          }
        });
    }
    return () => {
      isMounted = false;
    };
  }, [dueItems, currentIndex]);

  const handleRetryLoadVerse = async () => {
    if (dueItems.length > 0 && dueItems[currentIndex]) {
      const item = dueItems[currentIndex];
      setIsVerseLoading(true);
      try {
        const verse = await quranProvider.getVerse({ surah: item.surah, ayah: item.ayah });
        setCurrentVerseData(verse);
        setIsRevealed(false);
      } catch (e) {
        console.error(e);
      } finally {
        setIsVerseLoading(false);
      }
    }
  };

  const currentItem = dueItems[currentIndex];

  const handleGrade = async (quality: number) => {
    if (!currentItem) return;

    const nextProgress = calculateNextReview(currentItem, quality);
    await db.verseProgress.put(nextProgress);

    // Award XP
    const xp = quality >= 3 ? 15 : 5;
    try {
      const profile = await db.userProfile.get('default_user');
      if (profile) {
        const streakEval = evaluateStreak(profile.lastActiveDate, profile.streakCount);
        await db.userProfile.update('default_user', {
          totalXp: profile.totalXp + xp,
          streakCount: streakEval.newStreak,
          lastActiveDate: new Date().toISOString().split('T')[0],
        });
      }
    } catch (e) {
      console.error(e);
    }

    if (quality >= 4) {
      confetti({ particleCount: 40, spread: 50 });
    }

    setReviewedCount(prev => prev + 1);

    if (currentIndex < dueItems.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      // Completed queue!
      setCurrentIndex(dueItems.length);
    }
  };

  const playAudio = (url?: string, arabicFallbackText?: string) => {
    if (url) {
      const audio = new Audio(url);
      audio.onerror = () => {
        if (arabicFallbackText && typeof window !== 'undefined' && 'speechSynthesis' in window) {
          const u = new SpeechSynthesisUtterance(arabicFallbackText);
          u.lang = 'ar-SA';
          window.speechSynthesis.speak(u);
        }
      };
      audio.play().catch(() => {
        if (arabicFallbackText && typeof window !== 'undefined' && 'speechSynthesis' in window) {
          const u = new SpeechSynthesisUtterance(arabicFallbackText);
          u.lang = 'ar-SA';
          window.speechSynthesis.speak(u);
        }
      });
    } else if (arabicFallbackText && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(arabicFallbackText);
      u.lang = 'ar-SA';
      window.speechSynthesis.speak(u);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-20 text-slate-400">
        <Clock className="w-8 h-8 mx-auto mb-2 animate-spin text-emerald-500" />
        <p className="text-xs">Assembling your spaced repetition queue...</p>
      </div>
    );
  }

  // Queue completed screen
  if (currentIndex >= dueItems.length) {
    return (
      <div className="max-w-md mx-auto p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-5 shadow-xl animate-in zoom-in-95">
        <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-600 mx-auto">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Queue Clear! Alhamdulillah
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            You reviewed {reviewedCount} items today. Your memory consolidation is on track.
          </p>
        </div>

        <div className="flex gap-3 pt-2">
          <Link
            href="/memorize"
            className="flex-1 py-3 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold hover:bg-slate-200"
          >
            10 Hifz Modes
          </Link>
          <Link
            href="/"
            className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md"
          >
            Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const stateMeta = currentItem ? STATE_LABELS[currentItem.state] : null;

  return (
    <div id="srs-review-page" className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
              Spaced Repetition Review
            </span>
            {stateMeta && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${stateMeta.bg} ${stateMeta.color}`}>
                {stateMeta.label}
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Item {currentIndex + 1} of {dueItems.length}
          </h1>
        </div>

        <span className="text-xs text-slate-400 font-medium">
          Interval: {currentItem.interval}d • Reps: {currentItem.repetitions}
        </span>
      </div>

      {/* Flashcard Container */}
      <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl space-y-6">
        {/* Ayah target banner */}
        <div className="text-center pb-4 border-b border-slate-100 dark:border-slate-800">
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            Surah {currentItem.surah} • Ayah {currentItem.ayah}
          </span>
          <p className="text-xs text-slate-400 mt-2">
            Recite this Ayah mentally or aloud, then tap Reveal to verify.
          </p>
        </div>

        {/* Hidden / Revealed Area */}
        <div className="min-h-[160px] flex flex-col items-center justify-center text-center p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border">
          {!isRevealed ? (
            <button
              onClick={() => setIsRevealed(true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md active:scale-95 transition-all"
            >
              <Eye className="w-4 h-4" />
              <span>Reveal Ayah</span>
            </button>
          ) : isVerseLoading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
              <span className="text-xs">Fetching verified Quran text & translation...</span>
            </div>
          ) : currentVerseData ? (
            <div className="space-y-4 animate-in fade-in w-full">
              <p className="font-arabic text-3xl sm:text-4xl text-slate-900 dark:text-slate-100 leading-loose select-text dir-rtl" dir="rtl">
                {currentVerseData.textUthmani}
              </p>

              <div className="space-y-1.5 text-xs text-left max-w-lg mx-auto pt-2 border-t border-slate-200 dark:border-slate-700">
                <p className="text-slate-700 dark:text-slate-300">
                  <span className="font-bold text-slate-400 mr-1.5 uppercase">EN:</span>
                  {currentVerseData.translationEn}
                </p>
                {currentVerseData.translationTa && (
                  <p className="text-emerald-700 dark:text-emerald-300 font-tamil">
                    <span className="font-bold text-emerald-600 mr-1.5">தமிழ்:</span>
                    {currentVerseData.translationTa}
                  </p>
                )}
              </div>

              {currentVerseData.audioUrl && (
                <div className="pt-2">
                  <button
                    onClick={() => playAudio(currentVerseData.audioUrl, currentVerseData.textUthmani)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-xs font-semibold hover:bg-emerald-200"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Listen Verification</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-6 space-y-3">
              <p className="text-xs text-rose-500 font-semibold">Network offline or verse could not be fetched.</p>
              <button
                onClick={handleRetryLoadVerse}
                className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retry Load</span>
              </button>
            </div>
          )}
        </div>

        {/* Rating Buttons */}
        {isRevealed && (
          <div className="space-y-3 pt-2 animate-in slide-in-from-bottom-2">
            <div className="flex justify-between text-xs text-slate-500 font-semibold px-1">
              <span>Rate Your Recall Precision</span>
              <span className="text-emerald-600">SM-2 Spaced Algorithm</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <button
                onClick={() => handleGrade(1)}
                className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-bold hover:bg-rose-100 flex flex-col items-center gap-1"
              >
                <span>Again (1)</span>
                <span className="text-[10px] font-normal opacity-80">&lt;1 day</span>
              </button>

              <button
                onClick={() => handleGrade(3)}
                className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-xs font-bold hover:bg-amber-100 flex flex-col items-center gap-1"
              >
                <span>Hard (3)</span>
                <span className="text-[10px] font-normal opacity-80">1-2 days</span>
              </button>

              <button
                onClick={() => handleGrade(4)}
                className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-bold hover:bg-emerald-100 flex flex-col items-center gap-1"
              >
                <span>Good (4)</span>
                <span className="text-[10px] font-normal opacity-80">3-5 days</span>
              </button>

              <button
                onClick={() => handleGrade(5)}
                className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-bold hover:bg-blue-100 flex flex-col items-center gap-1"
              >
                <span>Easy (5)</span>
                <span className="text-[10px] font-normal opacity-80">7+ days</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
