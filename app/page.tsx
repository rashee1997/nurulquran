'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
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
  Play,
  Gamepad2,
  Radar,
  Languages
} from 'lucide-react';
import { db } from '@/lib/db';
import { calculateLevel } from '@/lib/learning/xp-engine';
import { CURRICULUM_LEVELS } from '@/lib/learning/curriculum';
import { SURAHS } from '@/lib/quran/surahs';
import { track } from '@/lib/telemetry/events';
import { isStreakAtRisk } from '@/lib/learning/activity';
import { useLocale } from '@/lib/i18n/useLocale';

export default function DashboardPage() {
  const { t } = useLocale();
  /**
   * Live views over IndexedDB, like the header. A one-shot read left the due count and the
   * memorised count stale after a review until the page was reloaded.
   */
  const profile = useLiveQuery(() => db.userProfile.get('default_user'), [], undefined);
  const dueReviewCount = useLiveQuery(
    () => db.verseProgress.where('dueDate').belowOrEqual(new Date().toISOString()).count(),
    [],
    0
  );
  const memorizedCount = useLiveQuery(
    () => db.verseProgress.where('state').anyOf('memorized', 'mastered').count(),
    [],
    0
  );
  const completedLessonIds = useLiveQuery(
    async () => new Set((await db.lessonHistory.toArray()).map((row) => row.lessonId)),
    [],
    new Set<string>()
  );

  const levelInfo = calculateLevel(profile?.totalXp ?? 0);

  /** First lesson not yet completed, in curriculum order; the last one if all are done. */
  const nextLesson = useMemo(() => {
    const all = CURRICULUM_LEVELS.flatMap((level) => level.lessons);
    return all.find((lesson) => !completedLessonIds.has(lesson.id)) ?? all[all.length - 1];
  }, [completedLessonIds]);
  const nextLessonLevel = CURRICULUM_LEVELS.find((level) => level.lessons.some((l) => l.id === nextLesson.id))?.level ?? 1;

  const readingPosition = profile?.readingPosition ?? null;
  const readingSurah = readingPosition ? SURAHS.find((s) => s.id === readingPosition.surah) : null;
  const streakAtRisk = isStreakAtRisk(profile);
  const freezes = profile?.streakFreezes ?? 0;

  const popularSurahs = [
    SURAHS.find(s => s.id === 1)!,
    SURAHS.find(s => s.id === 112)!,
    SURAHS.find(s => s.id === 113)!,
    SURAHS.find(s => s.id === 114)!,
    SURAHS.find(s => s.id === 108)!,
    SURAHS.find(s => s.id === 67)!,
  ];

  const hifzModes = [
    { mode: 'A', name: 'Listen & Repeat', desc: 'Loop the ayah with audio', icon: '🎧' },
    { mode: 'B', name: 'Complete Verse', desc: 'Fill the prompt gap', icon: '✍️' },
    { mode: 'C', name: 'Word Reordering', desc: 'Assemble words in order', icon: '🧩' },
    { mode: 'D', name: 'First Word Prompt', desc: 'Recall from the first word', icon: '💡' },
    { mode: 'E', name: 'Audio to Ayah', desc: 'Identify the verse from audio', icon: '🔊' },
    { mode: 'F', name: 'Meaning to Ayah', desc: 'Match English and Tamil meanings', icon: '🌐' },
    { mode: 'G', name: 'Missing Segment', desc: 'Fill in missing words', icon: '🔍' },
    { mode: 'H', name: 'Blind Recitation', desc: 'Self-rated recall with spaced repetition', icon: '🙈' },
    { mode: 'I', name: 'Timed Speed Recall', desc: 'Recall within a time limit', icon: '⚡' },
    { mode: 'J', name: 'Guided Session', desc: 'Work through the verse with the assistant', icon: '📖' },
  ];

  return (
    <div id="executive-dashboard" className="space-y-8 animate-in fade-in duration-300">
      {/* Hero Welcome & Streak preservation */}
      <div className="relative overflow-hidden rounded-3xl bg-hero-bg border border-hero-border p-6 sm:p-8 text-hero-fg shadow-xl">
        <div className="absolute inset-0 opacity-10 bg-pattern-dots" />
        
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-hero-pill-bg text-hero-pill-fg text-xs font-semibold backdrop-blur-xs">
              <span>Level {levelInfo.level} • {levelInfo.title} ({levelInfo.titleArabic})</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {t('dashboard.hero.title', 'Bismillah, Welcome to NurulQuran')}
            </h1>
            <p className="text-hero-muted text-xs sm:text-sm max-w-xl">
              {t(
                'dashboard.hero.subtitle',
                'Study Arabic reading, Tajweed and memorization with spaced repetition, plus English and Tamil translations.'
              )}
            </p>
          </div>

          <div className="flex items-center gap-3 bg-hero-card-bg backdrop-blur-md p-3.5 rounded-2xl border border-hero-border shrink-0">
            <div className="w-12 h-12 rounded-xl bg-secondary-subtle border border-secondary/30 flex items-center justify-center text-secondary">
              <Flame className="w-6 h-6 fill-secondary animate-pulse" />
            </div>
            <div>
              <span className="text-[11px] text-hero-muted font-semibold uppercase tracking-wider block">
                {t('dashboard.streak.active', 'Active Streak')}
              </span>
              <p className="text-xl font-extrabold text-hero-fg">
                {profile?.streakCount || 1} {t('dashboard.streak.day', 'Day Streak')}
              </p>
              <span className="text-[10px] text-secondary font-medium">
                {streakAtRisk
                  ? t('dashboard.streak.at_risk', 'Not practised yet today — your streak is at risk.')
                  : freezes > 0
                    ? `${freezes} ${t('dashboard.streak.freeze_available', 'freeze token(s) protect a missed day.')}`
                    : t('dashboard.streak.practice_today', 'Practise today to keep your streak.')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Continue reading: the ayah the reader was last scrolled to. */}
      {readingPosition && readingSurah && (
        <Link
          href={`/quran/${readingPosition.surah}#ayah-${readingPosition.ayah}`}
          onClick={() => track('dashboard.continue_clicked', { surah: readingPosition.surah, ayah: readingPosition.ayah })}
          className="flex items-center justify-between gap-4 p-5 rounded-3xl bg-card border border-border hover:border-primary shadow-xs transition-colors group"
        >
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-primary-subtle text-primary flex items-center justify-center shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-bold text-primary-strong uppercase tracking-wider">{t('dashboard.continue_reading', 'Continue reading')}</span>
              <h3 className="text-sm font-bold text-foreground truncate">
                {readingSurah.nameSimple} · Ayah {readingPosition.surah}:{readingPosition.ayah}
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Last read {new Date(readingPosition.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            </div>
          </div>
          <span lang="ar" dir="rtl" className="font-arabic text-2xl text-primary shrink-0 hidden sm:block">
            {readingSurah.nameArabic}
          </span>
          <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary shrink-0" />
        </Link>
      )}

      {/* Main Highlights Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Next Lesson Card */}
        <div className="p-6 rounded-3xl bg-card border border-border shadow-xs flex flex-col justify-between space-y-4 hover:border-primary transition-colors">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-primary-strong bg-primary-subtle px-2.5 py-1 rounded-lg">
                Curriculum
              </span>
              <span className="text-xs text-muted-foreground font-medium">Level {nextLessonLevel}</span>
            </div>
            <h3 className="text-base font-bold text-foreground">
              {nextLesson.title}
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {nextLesson.description}
            </p>
          </div>

          <div className="pt-2">
            <Link
              href={`/learn/${nextLesson.id}`}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold transition-all shadow-md active:scale-98"
            >
              <span>
                {completedLessonIds.size > 0
                  ? t('dashboard.resume_lesson', 'Resume Lesson')
                  : t('dashboard.start_lesson', 'Start Lesson')}
              </span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Spaced Repetition Review Card */}
        <div className="p-6 rounded-3xl bg-card border border-border shadow-xs flex flex-col justify-between space-y-4 hover:border-secondary transition-colors">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-secondary-strong bg-secondary-subtle px-2.5 py-1 rounded-lg">
                Spaced Repetition
              </span>
              <span className="text-xs text-muted-foreground font-medium">{dueReviewCount} due</span>
            </div>
            <h3 className="text-base font-bold text-foreground">
              Review Queue
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Verses scheduled for review today, from Al-Fatihah and Juz Amma.
            </p>
          </div>

          <div className="pt-2">
            <Link
              href="/review"
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-secondary hover:bg-secondary-hover text-secondary-foreground text-xs font-bold transition-all shadow-md active:scale-98"
            >
              <Clock className="w-4 h-4" />
              <span>Review {dueReviewCount} Due Items</span>
            </Link>
          </div>
        </div>

        {/* 10 Hifz Memorization Modes Quick Card */}
        <div className="p-6 rounded-3xl bg-card border border-border shadow-xs flex flex-col justify-between space-y-4 hover:border-info transition-colors">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-info-strong bg-info-subtle px-2.5 py-1 rounded-lg">
                Memorization
              </span>
              <span className="text-xs text-muted-foreground font-medium">Ten modes</span>
            </div>
            <h3 className="text-base font-bold text-foreground">
              Ten practice modes
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              From listen-and-repeat to blind recitation and assistant-guided sessions.
            </p>
          </div>

          <div className="pt-2">
            <Link
              href="/memorize"
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-info hover:bg-info/90 text-info-foreground text-xs font-bold transition-all shadow-md active:scale-98"
            >
              <Brain className="w-4 h-4" />
              <span>Open Memorization Modes</span>
            </Link>
          </div>
        </div>

        {/* Tafseer Lessons Card */}
        <div className="p-6 rounded-3xl bg-card border border-border shadow-xs flex flex-col justify-between space-y-4 hover:border-secondary transition-colors">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-secondary-strong bg-secondary-subtle px-2.5 py-1 rounded-lg">
                Tafseer
              </span>
              <span className="text-xs text-muted-foreground font-medium">EN &amp; தமிழ்</span>
            </div>
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-secondary" />
              Tafseer Lessons
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Read each ayah with English and Tamil exegesis, then let Ustadh Ameen explain the
              meaning as a story — and tell him what you understood.
            </p>
          </div>

          <div className="pt-2">
            <Link
              href="/lessons/tafsir"
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-secondary hover:bg-secondary-hover text-secondary-foreground text-xs font-bold transition-all shadow-md active:scale-98"
            >
              <span>Open Tafseer Lessons</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Arabic Lab Dual-Track Card */}
        <div className="p-6 rounded-3xl bg-card border border-border shadow-xs flex flex-col justify-between space-y-4 hover:border-primary transition-colors">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-primary-strong bg-primary-subtle px-2.5 py-1 rounded-lg">
                Classical &#8596; Spoken
              </span>
              <span className="text-xs text-muted-foreground font-medium">A1&Acirc;&ndash;A8</span>
            </div>
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <Languages className="w-4 h-4 text-primary" />
              Arabic Lab
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Trace letters on the Arabic baseline, parse Uthmani i&#8217;r&#257;b, then say the same idea in
              everyday Modern Standard Arabic &#8212; every rule taught as a classical &#8596; spoken pair.
            </p>
          </div>

          <div className="pt-2">
            <Link
              href="/arabic-lab"
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold transition-all shadow-md active:scale-98"
            >
              <span>Open Arabic Lab</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* Featured 2D Mini-Games Arcade Banner */}
      <div className="p-6 rounded-3xl bg-linear-to-r from-card via-card to-card/60 border border-border shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">
              <Gamepad2 className="w-3.5 h-3.5" />
              <span>Three games</span>
            </div>
            <h2 className="text-xl font-bold text-foreground">
              {t('dashboard.games.title', 'Practice Games')}
            </h2>
            <p className="text-xs text-muted-foreground max-w-xl">
              Reinforce memorization with word ordering, similar-verse discrimination and recall matching.
            </p>
          </div>

          <Link
            href="/games"
            className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs flex items-center gap-2 shadow-md shadow-primary/20 hover:opacity-90 transition-opacity shrink-0"
          >
            <span>{t('dashboard.games.open', 'Open games')}</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <Link
            href="/games/ayah-assembly"
            className="p-4 rounded-2xl bg-card border border-border hover:border-emerald-500/50 flex flex-col justify-between gap-3 transition-all hover:shadow-xs group"
          >
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <Gamepad2 className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                Word order
              </span>
            </div>
            <div>
              <h4 className="text-xs font-bold text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                Celestial Ayah Assembly
              </h4>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Connect words in Quranic sequence with recitation playback.
              </p>
            </div>
          </Link>

          <Link
            href="/games/mutashabihat-radar"
            className="p-4 rounded-2xl bg-card border border-border hover:border-sky-500/50 flex flex-col justify-between gap-3 transition-all hover:shadow-xs group"
          >
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                <Radar className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400">
                Similar verses
              </span>
            </div>
            <div>
              <h4 className="text-xs font-bold text-foreground group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                Mutashabihat Radar
              </h4>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Distinguish similar verses to reduce hesitation during Salah.
              </p>
            </div>
          </Link>

          <Link
            href="/games/memory-matrix"
            className="p-4 rounded-2xl bg-card border border-border hover:border-amber-500/50 flex flex-col justify-between gap-3 transition-all hover:shadow-xs group"
          >
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Brain className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                Recall matching
              </span>
            </div>
            <div>
              <h4 className="text-xs font-bold text-foreground group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                Ayah Memory Matrix
              </h4>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Match a verse opening with its completion.
              </p>
            </div>
          </Link>
        </div>
      </div>

      {/* 10 Hifz Modes Grid Overview */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              {t('dashboard.modes.title', 'Ten Memorization Modes')}
            </h2>
            <p className="text-xs text-muted-foreground">
              Exercises for auditory, visual and associative recall.
            </p>
          </div>
          <Link
            href="/memorize"
            className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
          >
            <span>{t('dashboard.modes.explore_all', 'Explore All')}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {hifzModes.map((m) => (
            <Link
              key={m.mode}
              href={`/memorize?mode=${m.mode}`}
              className="p-3.5 rounded-2xl bg-card border border-border hover:border-primary transition-all hover:shadow-md group flex flex-col justify-between"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xl">{m.icon}</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-surface-muted text-muted-foreground">
                    Mode {m.mode}
                  </span>
                </div>
                <h4 className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                  {m.name}
                </h4>
                <p className="text-[11px] text-muted-foreground line-clamp-2">
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
            <h2 className="text-lg font-bold text-foreground">
              {t('dashboard.surahs.title', 'Daily Surahs & Reader')}
            </h2>
            <p className="text-xs text-muted-foreground">
              Read the Uthmani script with colour-coded Tajweed, audio, and English and Tamil translations.
            </p>
          </div>
          <Link
            href="/quran"
            className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
          >
            <span>{t('dashboard.surahs.all', 'All 114 Surahs')}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {popularSurahs.map((s) => (
            <Link
              key={s.id}
              href={`/quran/${s.id}`}
              className="p-5 rounded-2xl bg-card border border-border hover:border-primary transition-all hover:shadow-md flex items-center justify-between group"
            >
              <div className="flex items-center gap-3.5">
                <span className="w-9 h-9 rounded-xl bg-surface-muted text-foreground flex items-center justify-center font-bold text-xs group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  {s.id}
                </span>
                <div>
                  <h4 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                    {s.nameSimple}
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    {s.nameEnglish} • {s.versesCount} Ayahs
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className="font-arabic text-2xl text-primary-strong" lang="ar" dir="rtl">
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
