'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { CURRICULUM_LEVELS } from '@/lib/learning/curriculum';
import { db, UserProfile } from '@/lib/db';
import { checkLevelUnlockStatus } from '@/lib/learning/xp-engine';
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
  Lock,
  Unlock,
  Award,
  Zap,
  Volume2,
  GraduationCap,
  Layers,
} from 'lucide-react';

export default function CurriculumMapPage() {
  const [completedLessonIds, setCompletedLessonIds] = useState<Set<string>>(new Set());
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [selectedStage, setSelectedStage] = useState<'all' | 'stage1' | 'stage2' | 'stage3'>('all');

  useEffect(() => {
    async function loadData() {
      if (typeof window !== 'undefined') {
        const history = await db.lessonHistory.toArray();
        const set = new Set(history.map((h) => h.lessonId));
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

  // Calculate total curriculum completion percentage
  const allLessons = CURRICULUM_LEVELS.flatMap((l) => l.lessons);
  const completedTotal = allLessons.filter((l) => completedLessonIds.has(l.id)).length;
  const completionPercentage = Math.round((completedTotal / (allLessons.length || 1)) * 100);

  // Filter levels based on pedagogical stage
  const filteredLevels = CURRICULUM_LEVELS.filter((lvl) => {
    if (selectedStage === 'stage1') return lvl.level >= 1 && lvl.level <= 3;
    if (selectedStage === 'stage2') return lvl.level >= 4 && lvl.level <= 7;
    if (selectedStage === 'stage3') return lvl.level >= 8 && lvl.level <= 10;
    return true;
  });

  return (
    <div id="curriculum-map-page" className="space-y-6 animate-in fade-in duration-300 pb-16">
      {/* Header & Overall Progress Banner */}
      <div className="bg-card rounded-3xl p-6 sm:p-7 border border-border shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary-subtle text-primary-strong text-[11px] font-bold">
              <BookOpen className="w-3.5 h-3.5" />
              <span>Ten levels</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              Tajweed & Hifz Curriculum
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-xl">
              From Arabic phonetics and articulation points (Makharij) through Sifaat and Ghunnah to Juz 30.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-surface p-3 sm:px-4 rounded-2xl border border-border flex items-center gap-3">
              <Zap className="w-5 h-5 text-secondary shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Earned XP</p>
                <p className="text-base font-black text-secondary">{totalUserXp} XP</p>
              </div>
            </div>

            <div className="bg-surface p-3 sm:px-4 rounded-2xl border border-border flex items-center gap-3">
              <GraduationCap className="w-5 h-5 text-primary shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Curriculum</p>
                <p className="text-base font-black text-foreground">
                  {completionPercentage}% <span className="text-xs font-normal text-muted-foreground">({completedTotal}/{allLessons.length})</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Global Progress Bar */}
        <div className="w-full bg-surface-muted h-2 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-500 rounded-full"
            style={{ width: `${Math.max(2, completionPercentage)}%` }}
          />
        </div>
      </div>

      {/* Accelerated Learning Hub: 2-Column Responsive Tray */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Placement Exam Card */}
        <div className="p-5 rounded-3xl bg-card border border-border flex flex-col justify-between gap-3 shadow-xs">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-secondary-subtle text-secondary-strong border border-secondary/30 text-[10px] font-bold">
                <Award className="w-3 h-3 text-secondary" />
                <span>Oral assessment</span>
              </div>
              {isCertified && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-success-subtle text-success-strong">
                  Placed • Levels 2–10 open
                </span>
              )}
            </div>
            <h2 className="text-sm sm:text-base font-bold text-foreground">
              Place a Level by Reciting
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Already read Quranic Arabic? Recite aloud and the assessment can place you above the introductory levels.
            </p>
          </div>

          <Link
            href="/learn/placement-test"
            className="inline-flex items-center justify-between px-4 py-2.5 rounded-xl bg-secondary hover:bg-secondary-hover text-secondary-foreground font-bold text-xs shadow-xs active:scale-98 transition-all"
          >
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4" />
              <span>{isCertified ? 'Review placement results' : 'Start oral assessment'}</span>
            </div>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Alphabet Pronunciation Studio Card */}
        <div className="p-5 rounded-3xl bg-card border border-border flex flex-col justify-between gap-3 shadow-xs">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary-subtle text-primary-strong text-[10px] font-bold">
              <Volume2 className="w-3 h-3 text-primary" />
              <span>Twenty-eight letters</span>
            </div>
            <h2 className="text-sm sm:text-base font-bold text-foreground">
              Arabic Alphabet
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              All 28 letters with recorded audio, Makharij diagrams for throat and tongue, and Tamil transliteration.
            </p>
          </div>

          <Link
            href="/learn/alphabet"
            className="inline-flex items-center justify-between px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground font-bold text-xs shadow-xs active:scale-98 transition-all"
          >
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4" />
              <span>Open alphabet</span>
            </div>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Pedagogical Stage Filter Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-2 pt-2">
        <div className="flex items-center gap-1.5 p-1 bg-surface rounded-2xl border border-border overflow-x-auto">
          {[
            { id: 'all', label: 'All Levels (1–10)' },
            { id: 'stage1', label: 'Stage 1: Foundations (1–3)' },
            { id: 'stage2', label: 'Stage 2: Core Tajweed (4–7)' },
            { id: 'stage3', label: 'Stage 3: Hifz & Recitation (8–10)' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedStage(tab.id as typeof selectedStage)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                selectedStage === tab.id
                  ? 'bg-card text-foreground shadow-xs border border-border'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <span className="text-xs text-muted-foreground">
          Showing {filteredLevels.length} of {CURRICULUM_LEVELS.length} levels
        </span>
      </div>

      {/* Stepped Curriculum Levels List */}
      <div className="space-y-6">
        {filteredLevels.map((level) => {
          const totalLessons = level.lessons.length;
          const completedCount = level.lessons.filter((l) => completedLessonIds.has(l.id)).length;
          const unlockStatus = checkLevelUnlockStatus(level.level, profile);
          const isUnlocked = unlockStatus.unlocked;
          const levelPercent = Math.round((completedCount / (totalLessons || 1)) * 100);

          return (
            <div
              key={level.level}
              className={`p-6 rounded-3xl border transition-all space-y-5 ${
                isUnlocked
                  ? 'bg-card border-border shadow-xs'
                  : 'bg-surface/80 border-border opacity-85'
              }`}
            >
              {/* Level Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                        isUnlocked
                          ? 'bg-primary-subtle text-primary-strong'
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

                    <span className="font-arabic text-xl font-bold text-primary">
                      {level.titleArabic}
                    </span>

                    {unlockStatus.unlockedByCertification && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-secondary-subtle text-secondary-strong border border-secondary/30">
                        Placed by assessment
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

                <div className="flex items-center gap-3 self-start sm:self-center">
                  {isUnlocked ? (
                    <div className="text-right">
                      <span className="text-xs font-semibold px-3 py-1 rounded-full bg-surface border border-border text-muted-foreground inline-block">
                        {completedCount} / {totalLessons} completed ({levelPercent}%)
                      </span>
                    </div>
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

              {/* Locked Notice */}
              {!isUnlocked && (
                <div className="p-3.5 rounded-2xl bg-secondary-subtle border border-secondary/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-secondary-strong">
                    <Lock className="w-4 h-4 shrink-0 text-secondary" />
                    <span>
                      Earn <strong>{unlockStatus.remainingXp} more XP</strong> in earlier lessons, or take the oral assessment to place higher.
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
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
                            <span>Locked • Take assessment</span>
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
