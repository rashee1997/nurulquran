'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { CURRICULUM_LEVELS } from '@/lib/learning/curriculum';
import { db, UserProfile } from '@/lib/db';
import { checkLevelUnlockStatus, LEVEL_REQUIRED_XP } from '@/lib/learning/xp-engine';
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
  Lock,
  Unlock,
  Award,
  ShieldCheck,
  Zap,
} from 'lucide-react';

export default function CurriculumMapPage() {
  const [completedLessonIds, setCompletedLessonIds] = useState<Set<string>>(new Set());
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    async function loadData() {
      if (typeof window !== 'undefined') {
        const history = await db.lessonHistory.toArray();
        const set = new Set(history.map(h => h.lessonId));
        setCompletedLessonIds(set);

        const user = await db.userProfile.get('default_user');
        if (user) {
          setProfile(user);
        }
      }
    }
    loadData();
  }, []);

  const totalUserXp = profile?.totalXp || 0;
  const isCertified = (profile?.tajweedCertifiedLevel || 0) >= 10;

  return (
    <div id="curriculum-map-page" className="space-y-8 animate-in fade-in duration-300 pb-12">
      {/* Header */}
      <div className="bg-linear-to-r from-emerald-900 to-teal-900 rounded-3xl p-6 sm:p-8 text-white space-y-3 shadow-lg">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-800/80 text-emerald-200 text-xs font-semibold">
          <BookOpen className="w-3.5 h-3.5" />
          <span>Curriculum Map • Levels 1 to 10</span>
        </div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Quranic Reading & Hifz Pedagogy
            </h1>
            <p className="text-emerald-200/90 text-xs sm:text-sm max-w-2xl mt-1">
              Strict XP-progression pathway from Arabic alphabet recognition and Tajweed phonetics to full Juz 30 memorization.
            </p>
          </div>

          <div className="flex items-center gap-3 bg-emerald-950/60 p-3 rounded-2xl border border-emerald-800/60 shrink-0">
            <Zap className="w-5 h-5 text-amber-400" />
            <div>
              <p className="text-[10px] text-emerald-300 font-semibold uppercase tracking-wider">Your Progress</p>
              <p className="text-lg font-black text-amber-300">{totalUserXp} XP</p>
            </div>
          </div>
        </div>
      </div>

      {/* Gemini Live Placement Exam Banner (Allows Skipping XP Gating) */}
      <div className="p-6 rounded-3xl bg-linear-to-r from-emerald-950/80 via-slate-900 to-teal-950/80 border border-emerald-500/30 text-white shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-5 relative overflow-hidden">
        <div className="space-y-2 z-10 max-w-xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[11px] font-bold">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Gemini Live AI Tajweed Placement Exam</span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold">
            Already know Tajweed rules? Skip directly to advanced levels
          </h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            Levels are locked until you reach required XP thresholds. However, taking the Gemini Live Tajweed oral exam tests your recitation in real time and unlocks all levels up to Level 10 immediately upon passing!
          </p>
          {isCertified && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Certified via Gemini Live AI • All 10 Levels Unlocked</span>
            </div>
          )}
        </div>

        <Link
          href="/learn/placement-test"
          className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-linear-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 active:scale-95 transition-transform shrink-0 z-10"
        >
          <Award className="w-4 h-4" />
          <span>{isCertified ? 'Review Placement Exam' : 'Take Tajweed Placement Exam'}</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Direct Alphabet Audio Studio Card */}
      <div className="p-6 rounded-3xl bg-linear-to-r from-amber-500/10 via-emerald-500/10 to-teal-500/10 border border-amber-300/40 dark:border-amber-700/40 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 text-[11px] font-bold">
            <Sparkles className="w-3 h-3" />
            <span>Interactive Audio & Makharij</span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">
            Arabic Alphabet Pronunciation Studio
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 max-w-xl leading-relaxed">
            Listen to authentic recordings of all 28 Arabic letters with Harakat (Fatha, Kasra, Damma), Tamil transliteration, throat/tongue makharij points, and an interactive ear-training quiz.
          </p>
        </div>

        <Link
          href="/learn/alphabet"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-700/20 active:scale-95 transition-transform shrink-0"
        >
          <span>Open Alphabet Audio Studio</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Levels list with XP Gating */}
      <div className="space-y-8">
        {CURRICULUM_LEVELS.map((level) => {
          const totalLessons = level.lessons.length;
          const completedCount = level.lessons.filter(l => completedLessonIds.has(l.id)).length;
          const unlockStatus = checkLevelUnlockStatus(level.level, profile);
          const isUnlocked = unlockStatus.unlocked;

          return (
            <div
              key={level.level}
              className={`p-6 rounded-3xl border transition-all space-y-5 ${
                isUnlocked
                  ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xs'
                  : 'bg-slate-50/70 dark:bg-slate-900/50 border-slate-200/60 dark:border-slate-800/60 opacity-90'
              }`}
            >
              {/* Level header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                        isUnlocked
                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {isUnlocked ? (
                        <Unlock className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Lock className="w-3 h-3 text-slate-500" />
                      )}
                      <span>Level {level.level}</span>
                    </span>

                    <span className="font-arabic text-lg text-emerald-700 dark:text-emerald-300">
                      {level.titleArabic}
                    </span>

                    {unlockStatus.unlockedByCertification && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300/60">
                        Tajweed Bypass
                      </span>
                    )}
                  </div>

                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {level.title}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
                    {level.summary}
                  </p>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-center">
                  {isUnlocked ? (
                    <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                      {completedCount} / {totalLessons} completed
                    </span>
                  ) : (
                    <div className="text-right">
                      <span className="text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-3 py-1 rounded-full border border-amber-200 dark:border-amber-900/60 flex items-center gap-1.5">
                        <Lock className="w-3 h-3" />
                        <span>Requires {unlockStatus.requiredXp} XP</span>
                      </span>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Current: {unlockStatus.currentXp} XP ({unlockStatus.remainingXp} XP needed)
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Locked Warning Banner */}
              {!isUnlocked && (
                <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
                    <Lock className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>
                      Earn <strong>{unlockStatus.remainingXp} more XP</strong> in prior lessons to unlock, or bypass instantly via the Gemini Live Placement Exam.
                    </span>
                  </div>
                  <Link
                    href="/learn/placement-test"
                    className="shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors"
                  >
                    Test Out Now →
                  </Link>
                </div>
              )}

              {/* Lessons Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {level.lessons.map((lesson) => {
                  const isDone = completedLessonIds.has(lesson.id);

                  return (
                    <div
                      key={lesson.id}
                      className={`p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                        !isUnlocked
                          ? 'bg-slate-100/60 dark:bg-slate-800/20 border-slate-200/50 dark:border-slate-800/50 opacity-70'
                          : isDone
                          ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40'
                          : 'bg-slate-50/50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800 hover:border-emerald-300'
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {lesson.estimatedMinutes} mins
                          </span>
                          <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded-md">
                            +{lesson.xpReward} XP
                          </span>
                        </div>

                        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                          {lesson.title}
                          {isDone && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          )}
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
                          {lesson.description}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                        {isUnlocked ? (
                          <Link
                            href={`/learn/${lesson.id}`}
                            className={`w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all shadow-2xs active:scale-98 ${
                              isDone
                                ? 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200'
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                            }`}
                          >
                            <span>{isDone ? 'Review Lesson' : 'Start Lesson'}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                        ) : (
                          <Link
                            href="/learn/placement-test"
                            className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-bold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-amber-100 dark:hover:bg-amber-950 hover:text-amber-900 dark:hover:text-amber-200 transition-colors"
                          >
                            <Lock className="w-3.5 h-3.5 text-slate-400" />
                            <span>Locked • Take Test to Unlock</span>
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

