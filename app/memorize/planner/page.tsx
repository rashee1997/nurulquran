'use client';

import React, { useState, useEffect } from 'react';
import { 
  getDailyHifzPlan, 
  DailyHifzPlan, 
  HIFZ_PACES, 
  HifzGoalPace 
} from '@/lib/learning/hifz-planner';
import { HIFZ_TIER_META } from '@/lib/learning/srs-engine';
import { db, VerseProgress } from '@/lib/db';
import { 
  Calendar, 
  CheckCircle2, 
  Clock, 
  Compass, 
  Sparkles, 
  Flame, 
  BookOpen, 
  ArrowRight, 
  Layers, 
  Award,
  ChevronRight,
  RefreshCw
} from 'lucide-react';
import Link from 'next/link';

export default function HifzPlannerPage() {
  const [plan, setPlan] = useState<DailyHifzPlan | null>(null);
  const [selectedPace, setSelectedPace] = useState<HifzGoalPace>(HIFZ_PACES[1]);
  const [loading, setLoading] = useState(true);

  const refreshPlan = async () => {
    try {
      const data = await getDailyHifzPlan();
      setPlan(data);
    } catch (e) {
      console.error('Failed to load Hifz plan:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    getDailyHifzPlan()
      .then((data) => {
        if (isMounted) {
          setPlan(data);
          setLoading(false);
        }
      })
      .catch((e) => {
        console.error('Failed to load Hifz plan:', e);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const markCompletedToday = async (verseKey: string) => {
    const item = await db.verseProgress.get(verseKey);
    if (!item) return;

    item.lastReviewedAt = new Date().toISOString();
    await db.verseProgress.put(item);
    await refreshPlan();
  };

  const calculateTargetDate = (ayahsPerDay: number, memorizedCount: number) => {
    const remaining = Math.max(0, 6236 - memorizedCount);
    const days = Math.ceil(remaining / ayahsPerDay);
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-card border border-border shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-primary-subtle text-primary-strong text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5" />
                <span>Classical Curriculum</span>
              </span>
              <span className="text-xs text-muted-foreground font-semibold">
                Daily Hifz Architecture
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground">
              Sabaq, Sabqi &amp; Manzil Planner
            </h1>
            <p className="text-sm text-muted-foreground">
              The time-tested three-tier Islamic seminary routine to balance new memorization with iron-clad retention.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/memorize"
              className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold flex items-center gap-2 shadow-sm transition-all"
            >
              <span>Practice Mode</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* High-level stats pill grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="p-3 rounded-2xl bg-surface border border-border space-y-0.5">
            <span className="text-[11px] text-muted-foreground font-semibold">
              Total Quran Ayahs
            </span>
            <p className="text-lg font-extrabold text-foreground">6,236</p>
          </div>

          <div className="p-3 rounded-2xl bg-surface border border-border space-y-0.5">
            <span className="text-[11px] text-muted-foreground font-semibold">
              Mastered / Memorized
            </span>
            <p className="text-lg font-extrabold text-primary">
              {plan?.totalVersesMemorized ?? 0}
            </p>
          </div>

          <div className="p-3 rounded-2xl bg-surface border border-border space-y-0.5">
            <span className="text-[11px] text-muted-foreground font-semibold">
              Active Pace
            </span>
            <p className="text-lg font-extrabold text-secondary">
              {selectedPace.ayahsPerDay} / day
            </p>
          </div>

          <div className="p-3 rounded-2xl bg-surface border border-border space-y-0.5">
            <span className="text-[11px] text-muted-foreground font-semibold">
              Target Finish
            </span>
            <p className="text-xs font-bold text-foreground truncate mt-1">
              {calculateTargetDate(selectedPace.ayahsPerDay, plan?.totalVersesMemorized ?? 0)}
            </p>
          </div>
        </div>
      </div>

      {/* Pace Simulator Bar */}
      <div className="p-5 rounded-2xl bg-surface border border-border space-y-3">
        <div className="flex items-center justify-between text-xs font-bold">
          <span className="text-foreground flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-primary" />
            <span>Select Your Memorization Velocity Target</span>
          </span>
          <span className="text-muted-foreground">
            Estimated duration for 30 Juz completion
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
          {HIFZ_PACES.map((pace) => {
            const isSelected = selectedPace.ayahsPerDay === pace.ayahsPerDay;
            return (
              <button
                key={pace.ayahsPerDay}
                onClick={() => setSelectedPace(pace)}
                className={`p-3 rounded-xl text-left border transition-all ${
                  isSelected
                    ? 'bg-primary-subtle border-primary text-primary-strong shadow-xs'
                    : 'bg-card border-border hover:border-border-strong text-foreground'
                }`}
              >
                <div className="font-bold text-xs">{pace.title}</div>
                <div className="text-xs opacity-90 mt-0.5">
                  {pace.ayahsPerDay} Ayahs / day
                </div>
                <div className="text-[11px] text-muted-foreground mt-1 font-medium">
                  {pace.durationLabel}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tri-Tier Daily Cards */}
      <div className="space-y-6">
        <h2 className="text-lg font-extrabold text-foreground flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          <span>Today&apos;s Tri-Tier Schedule</span>
        </h2>

        {/* Tier 1: Sabaq */}
        <div className="p-5 sm:p-6 rounded-2xl bg-card border border-border space-y-4 shadow-xs">
          <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-md bg-primary-subtle text-primary-strong font-bold text-xs">
                  {HIFZ_TIER_META.sabaq.titleAr} • {HIFZ_TIER_META.sabaq.titleEn}
                </span>
                <span className="text-xs font-tamil text-muted-foreground">
                  {HIFZ_TIER_META.sabaq.titleTa}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {HIFZ_TIER_META.sabaq.descriptionEn}
              </p>
            </div>
            <span className="text-xs font-bold text-foreground px-2.5 py-1 rounded-lg bg-surface">
              {plan?.sabaq.length ?? 0} In Queue
            </span>
          </div>

          {plan?.sabaq.length === 0 ? (
            <div className="p-6 text-center space-y-2 bg-surface rounded-xl border border-dashed border-border">
              <p className="text-xs text-muted-foreground">
                No active Sabaq lessons queued. Select any Surah in the Quran Reader and tap &quot;Add to Hifz&quot; to begin your daily lesson!
              </p>
              <Link
                href="/quran"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline pt-1"
              >
                <span>Browse Quran to Add Verses</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {plan?.sabaq.map((item) => (
                <div
                  key={item.verseKey}
                  className="flex items-center justify-between p-3 rounded-xl bg-surface border border-border text-xs"
                >
                  <span className="font-bold text-foreground">
                    Surah {item.surah}:{item.ayah}
                  </span>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/quran/${item.surah}`}
                      className="text-[11px] text-primary hover:underline"
                    >
                      Read
                    </Link>
                    <button
                      onClick={() => markCompletedToday(item.verseKey)}
                      className="p-1 rounded-md text-muted-foreground hover:text-primary transition-colors"
                      title="Mark Recited Today"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tier 2: Sabqi */}
        <div className="p-5 sm:p-6 rounded-2xl bg-card border border-border space-y-4 shadow-xs">
          <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-md bg-secondary-subtle text-secondary-strong font-bold text-xs">
                  {HIFZ_TIER_META.sabqi.titleAr} • {HIFZ_TIER_META.sabqi.titleEn}
                </span>
                <span className="text-xs font-tamil text-muted-foreground">
                  {HIFZ_TIER_META.sabqi.titleTa}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {HIFZ_TIER_META.sabqi.descriptionEn}
              </p>
            </div>
            <span className="text-xs font-bold text-foreground px-2.5 py-1 rounded-lg bg-surface">
              {plan?.sabqi.length ?? 0} In Queue
            </span>
          </div>

          {plan?.sabqi.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground bg-surface rounded-xl border border-dashed border-border">
              Sabqi buffer activates once your newly learned Sabaq ayahs graduate after 3 days of consistent practice.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {plan?.sabqi.map((item) => (
                <div
                  key={item.verseKey}
                  className="flex items-center justify-between p-3 rounded-xl bg-surface border border-border text-xs"
                >
                  <span className="font-bold text-foreground">
                    Surah {item.surah}:{item.ayah}
                  </span>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/quran/${item.surah}`}
                      className="text-[11px] text-secondary hover:underline"
                    >
                      Review
                    </Link>
                    <button
                      onClick={() => markCompletedToday(item.verseKey)}
                      className="p-1 rounded-md text-muted-foreground hover:text-secondary transition-colors"
                      title="Mark Recited Today"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tier 3: Manzil */}
        <div className="p-5 sm:p-6 rounded-2xl bg-card border border-border space-y-4 shadow-xs">
          <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-md bg-surface-muted text-foreground font-bold text-xs">
                  {HIFZ_TIER_META.manzil.titleAr} • {HIFZ_TIER_META.manzil.titleEn}
                </span>
                <span className="text-xs font-tamil text-muted-foreground">
                  {HIFZ_TIER_META.manzil.titleTa}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {HIFZ_TIER_META.manzil.descriptionEn}
              </p>
            </div>
            <span className="text-xs font-bold text-foreground px-2.5 py-1 rounded-lg bg-surface">
              {plan?.manzil.length ?? 0} In Queue
            </span>
          </div>

          {plan?.manzil.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground bg-surface rounded-xl border border-dashed border-border">
              Manzil rotation activates as your memorized portions mature into permanent long-term memory.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {plan?.manzil.map((item) => (
                <div
                  key={item.verseKey}
                  className="flex items-center justify-between p-3 rounded-xl bg-surface border border-border text-xs"
                >
                  <span className="font-bold text-foreground">
                    Surah {item.surah}:{item.ayah}
                  </span>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/quran/${item.surah}`}
                      className="text-[11px] text-foreground hover:underline"
                    >
                      Rotate
                    </Link>
                    <button
                      onClick={() => markCompletedToday(item.verseKey)}
                      className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
                      title="Mark Recited Today"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
