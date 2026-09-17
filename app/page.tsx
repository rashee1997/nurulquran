'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  BookOpen, 
  Brain, 
  Sparkles, 
  Clock, 
  Flame, 
  ArrowRight, 
  Award, 
  CheckCircle2, 
  Volume2, 
  Compass,
  Play
} from 'lucide-react';
import { db, UserProfile } from '@/lib/db';
import { calculateLevel } from '@/lib/learning/xp-engine';
import { CURRICULUM_LEVELS } from '@/lib/learning/curriculum';
import { SURAHS } from '@/lib/quran/surahs';

export default function DashboardPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [dueReviewCount, setDueReviewCount] = useState(0);
  const [memorizedCount, setMemorizedCount] = useState(0);

  useEffect(() => {
    async function loadStats() {
      if (typeof window !== 'undefined') {
        const p = await db.userProfile.get('default_user');
        if (p) setProfile(p);

        const verses = await db.verseProgress.toArray();
        const now = new Date().toISOString();
        const due = verses.filter(v => v.dueDate <= now);
        const mem = verses.filter(v => v.state === 'memorized' || v.state === 'mastered');
        setDueReviewCount(due.length);
        setMemorizedCount(mem.length);
      }
    }
    loadStats();
  }, []);

  const levelInfo = calculateLevel(profile?.totalXp ?? 0);
  const nextLesson = CURRICULUM_LEVELS[0].lessons[0];

  const popularSurahs = [
    SURAHS.find(s => s.id === 1)!,
    SURAHS.find(s => s.id === 112)!,
    SURAHS.find(s => s.id === 113)!,
    SURAHS.find(s => s.id === 114)!,
    SURAHS.find(s => s.id === 108)!,
    SURAHS.find(s => s.id === 67)!,
  ];

  const hifzModes = [
    { mode: 'A', name: 'Listen & Repeat', desc: 'Loop Ayah with audio', icon: '🎧' },
    { mode: 'B', name: 'Complete Verse', desc: 'Fill the prompt gap', icon: '✍️' },
    { mode: 'C', name: 'Word Reordering', desc: 'Assemble words in order', icon: '🧩' },
    { mode: 'D', name: 'First Word Prompt', desc: 'Recall from initial token', icon: '💡' },
    { mode: 'E', name: 'Audio to Ayah', desc: 'Identify verse from audio', icon: '🔊' },
    { mode: 'F', name: 'Meaning to Ayah', desc: 'English & Tamil matching', icon: '🌐' },
    { mode: 'G', name: 'Missing Segment', desc: 'Supply deleted tokens', icon: '🔍' },
    { mode: 'H', name: 'Blind Recitation', desc: 'Self-rating with SM-2 SRS', icon: '🙈' },
    { mode: 'I', name: 'Timed Speed Recall', desc: 'Rapid memory check', icon: '⚡' },
    { mode: 'J', name: 'AI Guided Hifz', desc: 'Interactive tutor coaching', icon: '🤖' },
  ];

  return (
    <div id="executive-dashboard" className="space-y-8 animate-in fade-in duration-300">
      {/* Hero Welcome & Streak preservation */}
      <div className="relative overflow-hidden rounded-3xl bg-linear-to-r from-emerald-900 via-emerald-800 to-teal-950 p-6 sm:p-8 text-white shadow-xl">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:20px_20px]" />
        
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-700/60 text-emerald-200 text-xs font-semibold backdrop-blur-xs">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Level {levelInfo.level} • {levelInfo.title} ({levelInfo.titleArabic})</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Bismillah, Welcome to NurulQuran
            </h1>
            <p className="text-emerald-200/90 text-xs sm:text-sm max-w-xl">
              Master Arabic reading, Tajweed rules, and Quranic memorization with deterministic spaced repetition and authentic English & Tamil meanings.
            </p>
          </div>

          <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/15 shrink-0">
            <div className="w-12 h-12 rounded-xl bg-amber-400/20 border border-amber-300/30 flex items-center justify-center text-amber-300">
              <Flame className="w-6 h-6 fill-amber-300 animate-pulse" />
            </div>
            <div>
              <span className="text-[11px] text-emerald-200 font-semibold uppercase tracking-wider block">
                Active Streak
              </span>
              <p className="text-xl font-extrabold text-white">
                {profile?.streakCount || 1} Day Streak
              </p>
              <span className="text-[10px] text-amber-200 font-medium">Keep it glowing today!</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Highlights Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Next Lesson Card */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-4 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-lg">
                Curriculum Progression
              </span>
              <span className="text-xs text-slate-400 font-medium">Level 1</span>
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {nextLesson.title}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {nextLesson.description}
            </p>
          </div>

          <div className="pt-2">
            <Link
              href={`/learn/${nextLesson.id}`}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-md active:scale-98"
            >
              <span>Resume Lesson</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Spaced Repetition Review Card */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-4 hover:border-amber-300 dark:hover:border-amber-700 transition-colors">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2.5 py-1 rounded-lg">
                Spaced Repetition (SM-2)
              </span>
              <span className="text-xs text-slate-400 font-medium">{dueReviewCount} due</span>
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Hifz Retention Queue
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Strengthen memory traces before decay. Includes verses from Surah Al-Fatihah and Juz Amma.
            </p>
          </div>

          <div className="pt-2">
            <Link
              href="/review"
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold transition-all shadow-md active:scale-98"
            >
              <Clock className="w-4 h-4" />
              <span>Review {dueReviewCount} Due Items</span>
            </Link>
          </div>
        </div>

        {/* 10 Hifz Memorization Modes Quick Card */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-4 hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2.5 py-1 rounded-lg">
                10 Memorization Modes
              </span>
              <span className="text-xs text-slate-400 font-medium">Hifz Suite</span>
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Multi-Sensory Practice
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              From listen & repeat to blind recitation and AI guided sessions with instant feedback.
            </p>
          </div>

          <div className="pt-2">
            <Link
              href="/memorize"
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-md active:scale-98"
            >
              <Brain className="w-4 h-4" />
              <span>Launch 10 Hifz Modes</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 10 Hifz Modes Grid Overview */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              10 Memorization & Hifz Game Modes
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pedagogically structured exercises targeting auditory, visual, and associative recall.
            </p>
          </div>
          <Link
            href="/memorize"
            className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
          >
            <span>Explore All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {hifzModes.map((m) => (
            <Link
              key={m.mode}
              href={`/memorize?mode=${m.mode}`}
              className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-400 dark:hover:border-emerald-600 transition-all hover:shadow-md group flex flex-col justify-between"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xl">{m.icon}</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    Mode {m.mode}
                  </span>
                </div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 transition-colors">
                  {m.name}
                </h4>
                <p className="text-[11px] text-slate-400 line-clamp-2">
                  {m.desc}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Popular Short Surahs for Daily Recitation */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Daily Surahs & Reader
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Read authentic Uthmani script with color-coded Tajweed, audio, and English & Tamil translations.
            </p>
          </div>
          <Link
            href="/quran"
            className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
          >
            <span>All 114 Surahs</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {popularSurahs.map((s) => (
            <Link
              key={s.id}
              href={`/quran/${s.id}`}
              className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-400 dark:hover:border-emerald-600 transition-all hover:shadow-md flex items-center justify-between group"
            >
              <div className="flex items-center gap-3.5">
                <span className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold text-xs group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  {s.id}
                </span>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 transition-colors">
                    {s.nameSimple}
                  </h4>
                  <p className="text-xs text-slate-400">
                    {s.nameEnglish} • {s.versesCount} Ayahs
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className="font-arabic text-2xl text-emerald-800 dark:text-emerald-300">
                  {s.nameArabic}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
