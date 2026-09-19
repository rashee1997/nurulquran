'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { 
  Flame, 
  Trophy, 
  Gamepad2, 
  Clock, 
  Brain, 
  CheckCircle2, 
  ArrowRight, 
  Calendar, 
  TrendingUp
} from 'lucide-react';
import { db, UserProfile, initializeDatabase } from '@/lib/db';
import { GameSessionResult } from '@/lib/db/schemas/streak-schema';
import { getGameSessions } from '@/lib/games/game-service';
import { calculateLevel } from '@/lib/learning/xp-engine';
import { dailyCounts } from '@/lib/telemetry/events';
import { localDayKey, shiftLocalDayKey } from '@/lib/time/day';

export default function DashboardPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [sessions, setSessions] = useState<GameSessionResult[]>([]);
  const [dueReviewCount, setDueReviewCount] = useState<number>(0);
  const [memorizedCount, setMemorizedCount] = useState<number>(0);
  /** Per-local-day activity counts from the ledger, keyed YYYY-MM-DD. */
  const [activityByDay, setActivityByDay] = useState<Record<string, number>>({});

  useEffect(() => {
    async function loadData() {
      const p = await initializeDatabase();
      setProfile(p);
      const s = await getGameSessions();
      setSessions(s);

      const to = localDayKey();
      const from = shiftLocalDayKey(to, -(70 - 1));
      setActivityByDay(await dailyCounts(from, to));

      if (typeof window !== 'undefined') {
        const verses = await db.verseProgress.toArray();
        const now = new Date().toISOString();
        const due = verses.filter((v) => v.dueDate <= now);
        const mem = verses.filter((v) => v.state === 'memorized' || v.state === 'mastered');
        setDueReviewCount(due.length);
        setMemorizedCount(mem.length);
      }
    }
    loadData();

    const handleUpdate = () => {
      loadData();
    };
    window.addEventListener('quran-game-completed', handleUpdate);
    return () => window.removeEventListener('quran-game-completed', handleUpdate);
  }, []);

  const levelInfo = calculateLevel(profile?.totalXp ?? 0);

  // Compute Game Stats
  const totalGames = sessions.length;
  const avgAccuracy = totalGames > 0
    ? Math.round(sessions.reduce((acc, s) => acc + s.accuracy, 0) / totalGames)
    : 0;
  const highestScore = totalGames > 0
    ? Math.max(...sessions.map((s) => s.score))
    : 0;
  const maxCombo = totalGames > 0
    ? Math.max(...sessions.map((s) => s.comboMax))
    : 0;

  /**
   * Ten weeks of activity for the heatmap, derived from the activity ledger.
   *
   * This previously counted *game sessions only* while the caption claimed it covered
   * games, lessons and reviews — so a day of reviews with no games rendered empty and
   * contradicted the streak counter. `dailyCounts` reads every ledger event (reviews,
   * drills, reading, games), so the grid now agrees with the streak. Day keys are the
   * learner's LOCAL calendar day: `toISOString()` produced UTC keys, so a session played
   * after 05:30 in UTC+05:30 landed on the previous column.
   */
  const heatmapDays = useMemo(() => {
    const daysInHeatmap = 70; // 10 weeks of cells
    const today = new Date();

    return Array.from({ length: daysInHeatmap }).map((_, index) => {
      const day = new Date(today);
      day.setDate(day.getDate() - (daysInHeatmap - 1 - index));
      const dateKey = localDayKey(day);
      const count = activityByDay[dateKey] ?? 0;
      const isToday = index === daysInHeatmap - 1;

      return {
        date: dateKey,
        count,
        isToday,
        hasActivity: count > 0 || Boolean(isToday && profile?.streakCount),
      };
    });
  }, [activityByDay, profile?.streakCount]);

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-2">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Progress</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
            Memorization & Review Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Games, review queue and memorization milestones in one place.
          </p>
        </div>

        <Link
          href="/games"
          className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs flex items-center gap-2 shadow-md shadow-primary/20 hover:opacity-90 transition-opacity"
        >
          <Gamepad2 className="w-4 h-4" />
          <span>Open Practice Games</span>
        </Link>
      </div>

      {/* Top Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Streak Card */}
        <div className="p-5 rounded-2xl bg-card border border-border flex flex-col justify-between gap-3 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Active Streak</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Flame className="w-5 h-5 fill-amber-500" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-foreground flex items-baseline gap-1">
              <span>{profile?.streakCount || 1}</span>
              <span className="text-sm font-semibold text-muted-foreground">Days</span>
            </div>
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1 mt-1">
              <CheckCircle2 className="w-3 h-3" /> Streak Active Today
            </span>
          </div>
        </div>

        {/* Level & XP Card */}
        <div className="p-5 rounded-2xl bg-card border border-border flex flex-col justify-between gap-3 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Level</span>
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Trophy className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-foreground">
              Level {levelInfo.level}
            </div>
            <span className="text-[11px] text-muted-foreground font-medium block mt-1">
              {profile?.totalXp || 0} Total XP ({levelInfo.nextLevelXp - levelInfo.currentLevelXp} XP to Level {levelInfo.level + 1})
            </span>
          </div>
        </div>

        {/* Game Accuracy */}
        <div className="p-5 rounded-2xl bg-card border border-border flex flex-col justify-between gap-3 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Practice Accuracy</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Brain className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-foreground">
              {avgAccuracy > 0 ? `${avgAccuracy}%` : '100%'}
            </div>
            <span className="text-[11px] text-muted-foreground font-medium block mt-1">
              Across {totalGames} sessions
            </span>
          </div>
        </div>

        {/* Max Combo */}
        <div className="p-5 rounded-2xl bg-card border border-border flex flex-col justify-between gap-3 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Best Streak</span>
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-foreground">
              {maxCombo > 0 ? `${maxCombo}x` : '1x'}
            </div>
            <span className="text-[11px] text-muted-foreground font-medium block mt-1">
              Best score: {highestScore} pts
            </span>
          </div>
        </div>
      </div>

      {/* 365-Day Activity Heatmap */}
      <div className="p-6 rounded-2xl bg-card border border-border space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span>Practice Activity</span>
            </h3>
            <p className="text-xs text-muted-foreground">
              Daily activity from games, lessons and reviews.
            </p>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>Less</span>
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-xs bg-muted" />
              <span className="w-3 h-3 rounded-xs bg-primary/30" />
              <span className="w-3 h-3 rounded-xs bg-primary/60" />
              <span className="w-3 h-3 rounded-xs bg-primary" />
            </div>
            <span>More</span>
          </div>
        </div>

        {/* Grid Cells */}
        <div className="overflow-x-auto py-2">
          <div className="grid grid-flow-col grid-rows-7 gap-1.5 w-max">
            {heatmapDays.map((day, idx) => {
              let colorClass = 'bg-muted/60';
              if (day.count >= 1) colorClass = 'bg-primary/40';
              if (day.count >= 3) colorClass = 'bg-primary/70';
              if (day.count >= 6) colorClass = 'bg-primary shadow-xs';
              if (day.isToday) {
                colorClass += ' ring-2 ring-primary/40 ring-offset-1';
              }

              return (
                <div
                  key={idx}
                  className={`w-3.5 h-3.5 rounded-xs ${colorClass} transition-transform hover:scale-125 cursor-pointer`}
                  title={`${day.date}: ${day.count} activities`}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Dual Column: Quick Launch Mini-Games & SRS Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Mini-Games Quick Launch */}
        <div className="p-6 rounded-2xl bg-card border border-border space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Gamepad2 className="w-4 h-4 text-primary" />
              <span>Practice Games</span>
            </h3>
            <Link href="/games" className="text-xs text-primary font-semibold hover:underline">
              View All
            </Link>
          </div>

          <div className="space-y-3">
            <Link
              href="/games/ayah-assembly"
              className="p-3.5 rounded-xl border border-border hover:border-emerald-500/40 bg-card hover:bg-muted/30 flex items-center justify-between gap-3 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                  ✦
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground">Celestial Ayah Assembly</h4>
                  <span className="text-[11px] text-muted-foreground">Word order with recitation</span>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </Link>

            <Link
              href="/games/mutashabihat-radar"
              className="p-3.5 rounded-xl border border-border hover:border-sky-500/40 bg-card hover:bg-muted/30 flex items-center justify-between gap-3 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold">
                  ◎
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground">Mutashabihat Radar</h4>
                  <span className="text-[11px] text-muted-foreground">Similar-verse discrimination</span>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </Link>

            <Link
              href="/games/memory-matrix"
              className="p-3.5 rounded-xl border border-border hover:border-amber-500/40 bg-card hover:bg-muted/30 flex items-center justify-between gap-3 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                  ۞
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground">Ayah Memory Matrix</h4>
                  <span className="text-[11px] text-muted-foreground">Recall matching</span>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </Link>
          </div>
        </div>

        {/* Right: SRS Retention Status */}
        <div className="p-6 rounded-2xl bg-card border border-border space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              <span>Review Queue</span>
            </h3>
            <Link href="/review" className="text-xs text-primary font-semibold hover:underline">
              Open Queue
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-xl bg-muted/30 border border-border">
              <span className="text-[11px] text-muted-foreground font-semibold uppercase">Due For Review</span>
              <span className="text-2xl font-black text-amber-600 dark:text-amber-400 block mt-1">
                {dueReviewCount}
              </span>
            </div>
            <div className="p-4 rounded-xl bg-muted/30 border border-border">
              <span className="text-[11px] text-muted-foreground font-semibold uppercase">Mastered Ayahs</span>
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 block mt-1">
                {memorizedCount}
              </span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Verses are scheduled with spaced repetition. Practice sessions also reinforce retention.
          </p>

          <Link
            href="/review"
            className="w-full py-2 px-4 rounded-xl bg-card border border-border hover:bg-muted text-foreground font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
          >
            <span>Start today’s review</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Full Game Sessions Feed */}
      <div className="p-6 rounded-2xl bg-card border border-border space-y-4 shadow-xs">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Trophy className="w-4 h-4 text-primary" />
          <span>Practice History</span>
        </h3>

        {sessions.length === 0 ? (
          <div className="p-8 text-center rounded-xl bg-muted/30 border border-dashed border-border text-xs text-muted-foreground">
            No sessions yet. Play a game to record your first session.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-semibold">
                  <th className="py-2.5 px-3">Game</th>
                  <th className="py-2.5 px-3">Surah</th>
                  <th className="py-2.5 px-3">Accuracy</th>
                  <th className="py-2.5 px-3">Score</th>
                  <th className="py-2.5 px-3">Max Combo</th>
                  <th className="py-2.5 px-3">XP</th>
                  <th className="py-2.5 px-3">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sessions.map((s) => (
                  <tr key={s.sessionId} className="hover:bg-muted/20 transition-colors">
                    <td className="py-3 px-3 font-semibold text-foreground">{s.gameTitle}</td>
                    <td className="py-3 px-3 text-muted-foreground">{s.surahName}</td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
                        {s.accuracy}%
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-foreground font-semibold">{s.score}</td>
                    <td className="py-3 px-3 text-amber-600 dark:text-amber-400 font-bold">{s.comboMax}x</td>
                    <td className="py-3 px-3 font-bold text-primary">+{s.xpEarned}</td>
                    <td className="py-3 px-3 text-muted-foreground">
                      {new Date(s.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}{' '}
                      {new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
