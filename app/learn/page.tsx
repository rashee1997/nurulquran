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
      <div className="bg-card rounded-3xl p-6 sm:p-8 text-foreground border border-border space-y-3 shadow-xs">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-subtle text-primary text-xs font-semibold">
          <BookOpen className="w-3.5 h-3.5" />
          <span>Curriculum Map • Levels 1 to 10</span>
        </div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              Quranic Reading & Hifz Pedagogy
            </h1>
            <p className="text-muted-foreground text-xs sm:text-sm max-w-2xl mt-1">
              Strict XP-progression pathway from Arabic alphabet recognition and Tajweed phonetics to full Juz 30 memorization.
            </p>
          </div>

          <div className="flex items-center gap-3 bg-surface p-3 rounded-2xl border border-border shrink-0">
            <Zap className="w-5 h-5 text-secondary" />
            <div>
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Your Progress</p>
              <p className="text-lg font-black text-secondary">{totalUserXp} XP</p>
            </div>
          </div>
        </div>
      </div>

      {/* Gemini Live Placement Exam Banner (Allows Skipping XP Gating) */}
      <div className="p-6 rounded-3xl bg-card border border-border text-foreground shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-5 relative overflow-hidden">
        <div className="space-y-2 z-10 max-w-xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary-subtle text-secondary-strong border border-secondary/30 text-[11px] font-bold">
            <Sparkles className="w-3.5 h-3.5 text-secondary" />
            <span>Gemini Live AI Tajweed Placement Exam</span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-foreground">
            Already know Tajweed rules? Skip directly to advanced levels
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Levels are locked until you reach required XP thresholds. However, taking the Gemini Live Tajweed oral exam tests your recitation in real time and unlocks all levels up to Level 10 immediately upon passing!
          </p>
          {isCertified && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-success-subtle text-success-strong border border-success/40 text-xs font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Certified via Gemini Live AI • All 10 Levels Unlocked</span>
            </div>
          )}
        </div>

        <Link
          href="/learn/placement-test"
          className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-secondary hover:bg-secondary-hover text-secondary-foreground font-bold text-xs shadow-md active:scale-95 transition-transform shrink-0 z-10"
        >
          <Award className="w-4 h-4" />
          <span>{isCertified ? 'Review Placement Exam' : 'Take Tajweed Placement Exam'}</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Direct Alphabet Audio Studio Card */}
      <div className="p-6 rounded-3xl bg-card border border-border shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary-subtle text-primary text-[11px] font-bold">
            <Sparkles className="w-3 h-3" />
            <span>Interactive Audio & Makharij</span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-foreground">
            Arabic Alphabet Pronunciation Studio
          </h2>
          <p className="text-xs text-muted-foreground max-w-xl leading-relaxed">
            Listen to authentic recordings of all 28 Arabic letters with Harakat (Fatha, Kasra, Damma), Tamil transliteration, throat/tongue makharij points, and an interactive ear-training quiz.
          </p>
        </div>

        <Link
          href="/learn/alphabet"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-primary hover:bg-primary-hover text-primary-foreground font-bold text-xs shadow-md active:scale-95 transition-transform shrink-0"
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
                  ? 'bg-card border-border shadow-xs'
                  : 'bg-surface border-border opacity-90'
              }`}
            >
              {/* Level header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                        isUnlocked
                          ? 'bg-primary-subtle text-primary'
                          : 'bg-surface border border-border text-muted-foreground'
                      }`}
                    >
                      {isUnlocked ? (
                        <Unlock className="w-3 h-3 text-primary" />
                      ) : (
                        <Lock className="w-3 h-3 text-muted-foreground" />
                      )}
                      <span>Level {level.level}</span>
                    </span>

                    <span className="font-arabic text-lg text-primary">
                      {level.titleArabic}
                    </span>

                    {unlockStatus.unlockedByCertification && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-secondary-subtle text-secondary-strong border border-secondary/30">
                        Tajweed Bypass
                      </span>
                    )}
                  </div>

                  <h2 className="text-lg font-bold text-foreground">
                    {level.title}
                  </h2>
                  <p className="text-xs text-muted-foreground max-w-2xl">
                    {level.summary}
                  </p>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-center">
                  {isUnlocked ? (
                    <span className="text-xs font-semibold px-3 py-1 rounded-full bg-surface border border-border text-muted-foreground">
                      {completedCount} / {totalLessons} completed
                    </span>
                  ) : (
                    <div className="text-right">
                      <span className="text-xs font-bold text-secondary-strong bg-secondary-subtle px-3 py-1 rounded-full border border-secondary/30 flex items-center gap-1.5">
                        <Lock className="w-3 h-3" />
                        <span>Requires {unlockStatus.requiredXp} XP</span>
                      </span>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Current: {unlockStatus.currentXp} XP ({unlockStatus.remainingXp} XP needed)
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Locked Warning Banner */}
              {!isUnlocked && (
                <div className="p-4 rounded-2xl bg-secondary-subtle border border-secondary/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-secondary-strong">
                    <Lock className="w-4 h-4 shrink-0 text-secondary" />
                    <span>
                      Earn <strong>{unlockStatus.remainingXp} more XP</strong> in prior lessons to unlock, or bypass instantly via the Gemini Live Placement Exam.
                    </span>
                  </div>
                  <Link
                    href="/learn/placement-test"
                    className="shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-xl bg-secondary hover:bg-secondary-hover text-secondary-foreground shadow-xs transition-colors"
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
                          ? 'bg-surface border-border opacity-70'
                          : isDone
                          ? 'bg-success-subtle border-success/30'
                          : 'bg-surface border-border hover:border-primary/40'
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {lesson.estimatedMinutes} mins
                          </span>
                          <span className="text-[10px] font-bold text-secondary-strong bg-secondary-subtle border border-secondary/20 px-2 py-0.5 rounded-md">
                            +{lesson.xpReward} XP
                          </span>
                        </div>

                        <h4 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                          {lesson.title}
                          {isDone && (
                            <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                          )}
                        </h4>
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                          {lesson.description}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-border">
                        {isUnlocked ? (
                          <Link
                            href={`/learn/${lesson.id}`}
                            className={`w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all shadow-xs active:scale-98 ${
                              isDone
                                ? 'bg-card border border-border hover:bg-surface-hover text-foreground'
                                : 'bg-primary hover:bg-primary-hover text-primary-foreground'
                            }`}
                          >
                            <span>{isDone ? 'Review Lesson' : 'Start Lesson'}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                        ) : (
                          <Link
                            href="/learn/placement-test"
                            className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-bold bg-surface border border-border text-muted-foreground hover:bg-secondary-subtle hover:text-secondary-strong transition-colors"
                          >
                            <Lock className="w-3.5 h-3.5 text-muted-foreground" />
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

