'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Compass,
  ArrowRight,
  ChevronRight,
  Plus,
  Target,
  AlertTriangle,
} from 'lucide-react';
import {
  getDailyHifzPlan,
  allocateTodaysSabaq,
  DailyHifzPlan,
  HIFZ_PACES,
  HifzGoalPace,
  DEFAULT_PACE,
  TOTAL_AYAHS,
  projectDays,
} from '@/lib/learning/hifz-planner';
import { calculateNextReview, HIFZ_TIER_META } from '@/lib/learning/srs-engine';
import { db, VerseProgress, HifzTier } from '@/lib/db';
import { SURAHS } from '@/lib/quran/surahs';
import { recordActivity } from '@/lib/learning/activity';
import { track } from '@/lib/telemetry/events';
import { PlannerCalendar } from '@/components/memorize/PlannerCalendar';

const TIER_ORDER: HifzTier[] = ['sabaq', 'sabqi', 'manzil'];

const TIER_STYLE: Record<HifzTier, { badge: string; link: string; action: string; hover: string }> = {
  sabaq: { badge: 'bg-primary-subtle text-primary-strong', link: 'text-primary', action: 'Read', hover: 'hover:text-primary' },
  sabqi: { badge: 'bg-secondary-subtle text-secondary-strong', link: 'text-secondary', action: 'Review', hover: 'hover:text-secondary' },
  manzil: { badge: 'bg-surface-muted text-foreground', link: 'text-foreground', action: 'Rotate', hover: 'hover:text-foreground' },
};

function surahName(id: number): string {
  return SURAHS.find((s) => s.id === id)?.nameSimple ?? `Surah ${id}`;
}

export default function HifzPlannerPage() {
  const [plan, setPlan] = useState<DailyHifzPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [allocating, setAllocating] = useState(false);
  const [allocationNote, setAllocationNote] = useState<string | null>(null);
  /** Verse whose "Mark recited" grade picker is open. */
  const [gradingKey, setGradingKey] = useState<string | null>(null);

  const profile = useLiveQuery(() => db.userProfile.get('default_user'), [], undefined);
  const pace = profile?.hifzPace ?? DEFAULT_PACE;
  const targetSurah = profile?.hifzTargetSurah ?? 1;

  /** Word-level mistakes from hidden-verse recitation, grouped by verse for the weak-spot map. */
  const mistakeRows = useLiveQuery(() => db.recitationMistakes.toArray(), [], []);
  const weakSpots = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of mistakeRows) counts.set(row.verseKey, (counts.get(row.verseKey) ?? 0) + 1);
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
  }, [mistakeRows]);

  const refreshPlan = useCallback(async () => {
    try {
      const data = await getDailyHifzPlan();
      setPlan(data);
    } catch (e) {
      console.error('Failed to load Hifz plan:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Synchronizes the plan with IndexedDB (an external system) whenever the pace or
    // target surah changes; the state updates happen after the async read, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async DB read, not a derived-state anti-pattern
    void refreshPlan();
  }, [refreshPlan, pace, targetSurah]);

  const selectPace = async (next: HifzGoalPace) => {
    try {
      const existing = await db.userProfile.get('default_user');
      if (!existing) return;
      await db.userProfile.update('default_user', { hifzPace: next.ayahsPerDay });
    } catch (error) {
      console.warn('Pace could not be saved:', error);
    }
  };

  const selectTargetSurah = async (surah: number) => {
    try {
      const existing = await db.userProfile.get('default_user');
      if (!existing) return;
      await db.userProfile.update('default_user', { hifzTargetSurah: surah });
    } catch (error) {
      console.warn('Target surah could not be saved:', error);
    }
  };

  const addTodaysSabaq = async () => {
    setAllocating(true);
    setAllocationNote(null);
    try {
      const added = await allocateTodaysSabaq();
      if (added.length === 0) {
        setAllocationNote(`Today's ${pace} Sabaq ayahs are already queued.`);
      } else {
        const first = added[0];
        const last = added[added.length - 1];
        setAllocationNote(
          `Added ${added.length} ayahs: ${surahName(first.surah)} ${first.surah}:${first.ayah} → ${surahName(last.surah)} ${last.surah}:${last.ayah}.`
        );
      }
      await refreshPlan();
    } catch (error) {
      console.error('Sabaq allocation failed:', error);
      setAllocationNote('The new portion could not be added. Please try again.');
    } finally {
      setAllocating(false);
    }
  };

  /**
   * Marking a verse recited is a graded review. It used to set `lastReviewedAt` without
   * rescheduling, so a "completed" Sabaq verse never moved toward Sabqi or Manzil.
   */
  const markRecited = async (item: VerseProgress, quality: number) => {
    const next = calculateNextReview(item, quality);
    await db.verseProgress.put(next);
    await recordActivity({ xp: quality >= 3 ? 10 : 3, event: 'planner.marked', props: { verseKey: item.verseKey, quality } });
    track('review.graded', { quality, verseKey: item.verseKey, intervalBefore: item.interval, intervalAfter: next.interval, source: 'planner' });
    setGradingKey(null);
    await refreshPlan();
  };

  const calculateTargetDate = (ayahsPerDay: number, memorizedCount: number) => {
    const days = projectDays(TOTAL_AYAHS - memorizedCount, ayahsPerDay);
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const tiers: Array<{ id: HifzTier; items: VerseProgress[] }> = TIER_ORDER.map((id) => ({
    id,
    items: plan ? plan[id] : [],
  }));

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="p-6 sm:p-8 rounded-3xl bg-card border border-border shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-primary-subtle text-primary-strong text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5" />
                <span>Classical Curriculum</span>
              </span>
              <span className="text-xs text-muted-foreground font-semibold">Daily Hifz Architecture</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground">Sabaq, Sabqi &amp; Manzil Planner</h1>
            <p className="text-sm text-muted-foreground">
              New portions are allocated from your target surah at your pace; every tier is rescheduled by the same scheduler as the review queue.
            </p>
          </div>

          <Link
            href="/memorize?source=queue"
            className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold flex items-center gap-2 shadow-sm transition-all shrink-0"
          >
            <span>Drill today&apos;s due</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="p-3 rounded-2xl bg-surface border border-border space-y-0.5">
            <span className="text-[11px] text-muted-foreground font-semibold">Total Quran Ayahs</span>
            <p className="text-lg font-extrabold text-foreground">{TOTAL_AYAHS.toLocaleString()}</p>
          </div>
          <div className="p-3 rounded-2xl bg-surface border border-border space-y-0.5">
            <span className="text-[11px] text-muted-foreground font-semibold">Mastered / Memorized</span>
            <p className="text-lg font-extrabold text-primary">{plan?.totalVersesMemorized ?? 0}</p>
          </div>
          <div className="p-3 rounded-2xl bg-surface border border-border space-y-0.5">
            <span className="text-[11px] text-muted-foreground font-semibold">Active Pace</span>
            <p className="text-lg font-extrabold text-secondary">{pace} / day</p>
          </div>
          <div className="p-3 rounded-2xl bg-surface border border-border space-y-0.5">
            <span className="text-[11px] text-muted-foreground font-semibold">Target Finish</span>
            <p className="text-xs font-bold text-foreground truncate mt-1">{calculateTargetDate(pace, plan?.totalVersesMemorized ?? 0)}</p>
            <p className="text-[10px] text-muted-foreground">{plan?.projectedCompletionDays ?? 0} days at this pace</p>
          </div>
        </div>
      </div>

      {/* Pace */}
      <div className="p-5 rounded-2xl bg-surface border border-border space-y-3">
        <div className="flex items-center justify-between text-xs font-bold">
          <span className="text-foreground flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-primary" />
            <span>Your memorisation pace</span>
          </span>
          <span className="text-muted-foreground">Saved to your profile</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
          {HIFZ_PACES.map((option) => {
            const isSelected = pace === option.ayahsPerDay;
            return (
              <button
                key={option.ayahsPerDay}
                type="button"
                onClick={() => void selectPace(option)}
                aria-pressed={isSelected}
                className={`p-3 rounded-xl text-left border transition-all ${
                  isSelected ? 'bg-primary-subtle border-primary text-primary-strong shadow-xs' : 'bg-card border-border hover:border-border-strong text-foreground'
                }`}
              >
                <div className="font-bold text-xs">{option.title}</div>
                <div className="text-xs opacity-90 mt-0.5">{option.ayahsPerDay} Ayahs / day</div>
                <div className="text-[11px] text-muted-foreground mt-1 font-medium">{option.durationLabel}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Next portion */}
      <div className="p-5 rounded-2xl bg-card border border-border space-y-3 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Target className="w-4 h-4 text-primary" />
              <span>Today&apos;s new portion (Sabaq)</span>
            </span>
            <p className="text-xs text-muted-foreground">
              {plan?.nextPortion
                ? `Next up: ${surahName(plan.nextPortion.surah)} ${plan.nextPortion.surah}:${plan.nextPortion.ayah}. ${plan.sabaqAddedToday} of ${pace} added today.`
                : 'Every ayah is already in your queue.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="target-surah" className="text-[11px] font-semibold text-muted-foreground">
              Start from
            </label>
            <select
              id="target-surah"
              value={targetSurah}
              onChange={(event) => void selectTargetSurah(Number(event.target.value))}
              className="text-xs px-2.5 py-2 rounded-xl bg-surface border border-border text-foreground max-w-[200px]"
            >
              {SURAHS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id}. {s.nameSimple}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void addTodaysSabaq()}
              disabled={allocating || (plan?.sabaqAddedToday ?? 0) >= pace}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold shadow-md disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>{allocating ? 'Adding…' : `Add ${Math.max(0, pace - (plan?.sabaqAddedToday ?? 0))} ayahs`}</span>
            </button>
          </div>
        </div>
        {allocationNote && <p className="text-[11px] text-primary-strong font-semibold">{allocationNote}</p>}
      </div>

      <PlannerCalendar pace={pace} />

      {/* Tiers */}
      <div className="space-y-6">
        <h2 className="text-lg font-extrabold text-foreground flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          <span>Today&apos;s Tri-Tier Schedule</span>
          {loading && <span className="text-xs font-normal text-muted-foreground">loading…</span>}
        </h2>

        {tiers.map(({ id, items }) => {
          const meta = HIFZ_TIER_META[id];
          const style = TIER_STYLE[id];
          const done = plan?.completedCounts[id] ?? 0;
          return (
            <div key={id} className="p-5 sm:p-6 rounded-2xl bg-card border border-border space-y-4 shadow-xs">
              <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2.5 py-0.5 rounded-md font-bold text-xs ${style.badge}`}>
                      {meta.titleAr} • {meta.titleEn}
                    </span>
                    <span className="text-xs font-tamil text-muted-foreground" lang="ta">
                      {meta.titleTa}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{meta.descriptionEn}</p>
                </div>
                <span className="text-xs font-bold text-foreground px-2.5 py-1 rounded-lg bg-surface whitespace-nowrap">
                  {done}/{items.length} today
                </span>
              </div>

              {items.length === 0 ? (
                <div className="p-6 text-center space-y-2 bg-surface rounded-xl border border-dashed border-border">
                  <p className="text-xs text-muted-foreground">
                    {id === 'sabaq'
                      ? 'No Sabaq queued. Add today’s portion above, or tap “Add to Hifz” on any ayah in the reader.'
                      : id === 'sabqi'
                        ? 'Sabqi fills as Sabaq ayahs are graded Good a few days in a row.'
                        : 'Manzil rotation begins once verses reach two weeks of stability.'}
                  </p>
                  {id === 'sabaq' && (
                    <Link href="/quran" className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline pt-1">
                      <span>Browse Quran to Add Verses</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {items.map((item) => {
                    const dueNow = new Date(item.dueDate).getTime() <= Date.now();
                    const isGrading = gradingKey === item.verseKey;
                    return (
                      <div key={item.verseKey} className="p-3 rounded-xl bg-surface border border-border text-xs space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-bold text-foreground">
                              {surahName(item.surah)} {item.surah}:{item.ayah}
                            </span>
                            <span className="ml-2 text-[10px] text-muted-foreground">
                              {dueNow ? 'due now' : `due in ${Math.max(1, Math.ceil((new Date(item.dueDate).getTime() - Date.now()) / 86_400_000))}d`}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Link href={`/quran/${item.surah}#ayah-${item.ayah}`} className={`text-[11px] ${style.link} hover:underline`}>
                              {style.action}
                            </Link>
                            <button
                              type="button"
                              onClick={() => setGradingKey(isGrading ? null : item.verseKey)}
                              className={`p-1 rounded-md text-muted-foreground ${style.hover} transition-colors`}
                              title="Mark recited and grade"
                              aria-expanded={isGrading}
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        {isGrading && (
                          <div className="grid grid-cols-4 gap-1.5 animate-in fade-in">
                            <button type="button" onClick={() => void markRecited(item, 1)} className="py-1.5 rounded-lg bg-danger-subtle text-danger-strong font-bold text-[11px]">
                              Again
                            </button>
                            <button type="button" onClick={() => void markRecited(item, 3)} className="py-1.5 rounded-lg bg-secondary-subtle text-secondary-strong font-bold text-[11px]">
                              Hard
                            </button>
                            <button type="button" onClick={() => void markRecited(item, 4)} className="py-1.5 rounded-lg bg-primary-subtle text-primary-strong font-bold text-[11px]">
                              Good
                            </button>
                            <button type="button" onClick={() => void markRecited(item, 5)} className="py-1.5 rounded-lg bg-card border border-border text-foreground font-bold text-[11px]">
                              Easy
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Weak spots from recitation */}
      <div className="p-5 sm:p-6 rounded-2xl bg-card border border-border space-y-3 shadow-xs">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning" />
            <span>Weak spots from hidden-verse recitation</span>
          </h2>
          <Link href="/memorize?mode=H&source=queue" className="text-xs font-bold text-primary hover:underline">
            Recite hidden
          </Link>
        </div>
        {weakSpots.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No mistakes recorded yet. Mode H listens to your recitation and marks skipped or replaced words here.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {weakSpots.map(([verseKey, count]) => {
              const [surah, ayah] = verseKey.split(':').map(Number);
              const intensity = count >= 6 ? 'bg-danger-subtle text-danger-strong border-danger/40' : count >= 3 ? 'bg-warning-subtle text-warning-strong border-warning/40' : 'bg-surface text-foreground border-border';
              return (
                <Link
                  key={verseKey}
                  href={`/memorize?mode=H&surah=${surah}`}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${intensity}`}
                  title={`${count} word mistakes recorded`}
                >
                  {surahName(surah)} {surah}:{ayah} · {count}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
