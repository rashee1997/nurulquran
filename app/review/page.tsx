'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { db, HifzTier, VerseProgress } from '@/lib/db';
import { calculateNextReview, currentRetrievability, determineHifzTier, HIFZ_TIER_META, initializeVerseProgress, nextDueAt, previewGrades, recentMistakeVerseKeys, STATE_LABELS } from '@/lib/learning/srs-engine';
import { track } from '@/lib/telemetry/events';
import { quranProvider } from '@/lib/quran/alquran-cloud';
import { Verse } from '@/lib/quran/types';
import { recordActivity } from '@/lib/learning/activity';
import { usePreviewAudio } from '@/hooks/use-preview-audio';
import { StatePanel } from '@/components/system/StatePanel';
import confetti from 'canvas-confetti';
import { Clock, Eye, Volume2, CheckCircle2, RotateCcw, Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function SrsReviewPage() {
  const [allItems, setAllItems] = useState<VerseProgress[]>([]);
  const [activeTierFilter, setActiveTierFilter] = useState<'all' | HifzTier>('all');
  const [currentIndex, setCurrentIndex] = useState(0);
  /** Verse text by `surah:ayah`. Scripture is immutable, so a re-visited card reuses it. */
  const [versesByKey, setVersesByKey] = useState<Readonly<Record<string, Verse>>>({});
  const [failedVerseKeys, setFailedVerseKeys] = useState<ReadonlySet<string>>(new Set());
  /**
   * Which card is currently revealed, stored as a verse key.
   * Tagging it with the verse means advancing to the next card hides the text again with
   * no effect and no chance of showing the new ayah before the learner asks for it.
   */
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [isGrading, setIsGrading] = useState(false);

  const { playUrl, speak } = usePreviewAudio();
  /** Prevents a double tap from grading the same card twice and skipping a verse. */
  const gradingRef = useRef(false);

  /** Earliest upcoming due time when nothing is due right now. */
  const [nextDue, setNextDue] = useState<Date | null>(null);
  const [totalTracked, setTotalTracked] = useState(0);
  const [seeding, setSeeding] = useState(false);

  /** Which mistake-weakened verse was pulled forward, so grading can log the conversion. */
  const [mistakePriorityKeys, setMistakePriorityKeys] = useState<ReadonlySet<string>>(new Set());

  const loadDueQueue = useCallback(async () => {
    setLoading(true);
    try {
      // The `dueDate` index answers "what is due" without materialising every tracked
      // verse — at Hifz scale (6,236 rows) the old full-table scan was the queue's
      // dominant cost. New items (repetitions 0) are appended, since a first review is
      // always wanted regardless of when it is due.
      const now = new Date().toISOString();
      const due = await db.verseProgress.where('dueDate').belowOrEqual(now).toArray();
      const newItems = await db.verseProgress.filter((item) => item.repetitions === 0).toArray();
      const combined = [...due, ...newItems];
      // Deduplicate by key: a not-yet-reviewed item is both due (dueDate = now) and new.
      const byKey = new Map<string, VerseProgress>();
      for (const item of combined) byKey.set(item.verseKey, item);

      // Most-at-risk first: the scheduler's ordering promise. Weakest recall probability
      // sits at the front of the queue instead of a random position.
      const ordered = [...byKey.values()].sort(
        (a, b) => currentRetrievability(a) - currentRetrievability(b)
      );

      // Priority injection: anything with a recitation mistake in the last two weeks is
      // pulled to the front. Grading still runs the standard FSRS path — injection only
      // changes the order, never the schedule.
      const mistakeKeys = await recentMistakeVerseKeys(14);
      setMistakePriorityKeys(mistakeKeys);
      const prioritized = [
        ...ordered.filter((item) => mistakeKeys.has(item.verseKey)),
        ...ordered.filter((item) => !mistakeKeys.has(item.verseKey)),
      ];

      setTotalTracked(await db.verseProgress.count());
      setAllItems(prioritized);
      setNextDue(prioritized.length === 0 ? nextDueAt(await db.verseProgress.toArray()) : null);
      setCurrentIndex(0);
      if (prioritized.length === 0) track('review.empty_state_shown', { tracked: await db.verseProgress.count() });
    } catch (e) {
      console.error('Failed to load review queue:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async DB read on mount, not a derived-state anti-pattern
    void loadDueQueue();
  }, [loadDueQueue]);

  /** Explicit starter set — never added silently. */
  const seedStarterVerses = useCallback(async () => {
    setSeeding(true);
    try {
      const seeds = [
        initializeVerseProgress(1, 1),
        initializeVerseProgress(1, 2),
        initializeVerseProgress(1, 3),
        initializeVerseProgress(112, 1),
        initializeVerseProgress(112, 2),
      ];
      await db.verseProgress.bulkPut(seeds);
      await loadDueQueue();
    } finally {
      setSeeding(false);
    }
  }, [loadDueQueue]);

  const dueItems = useMemo(() => {
    if (activeTierFilter === 'all') return allItems;
    return allItems.filter((i) => (i.hifzTier || determineHifzTier(i)) === activeTierFilter);
  }, [allItems, activeTierFilter]);

  /**
   * Loads the text of the card on screen.
   *
   * Results are stored under the verse key they belong to instead of in a single
   * "current verse" slot, so the previous ayah can never be rendered — or graded — as the
   * one the learner is reciting while the next request is in flight. Loading and failure
   * are derived from which keys exist, so the effect never sets state synchronously.
   */
  useEffect(() => {
    let isMounted = true;
    const item = dueItems[currentIndex];
    if (!item) return;
    const key = `${item.surah}:${item.ayah}`;

    quranProvider
      .getVerse({ surah: item.surah, ayah: item.ayah })
      .then((verse) => {
        if (!isMounted) return;
        setVersesByKey((previous) => ({ ...previous, [key]: verse }));
        setFailedVerseKeys((previous) => {
          if (!previous.has(key)) return previous;
          const next = new Set(previous);
          next.delete(key);
          return next;
        });
      })
      .catch((error: unknown) => {
        if (!isMounted) return;
        console.error(`Could not load ${key} for review:`, error);
        setFailedVerseKeys((previous) => new Set(previous).add(key));
      });

    return () => {
      isMounted = false;
    };
  }, [dueItems, currentIndex]);

  const currentItem = dueItems[currentIndex];
  const currentVerseKey = currentItem ? `${currentItem.surah}:${currentItem.ayah}` : null;
  const verseForCurrentCard = currentVerseKey ? versesByKey[currentVerseKey] ?? null : null;
  // Nothing for this card yet and the request has not failed: it is still on its way.
  const isVerseLoading =
    currentVerseKey !== null && verseForCurrentCard === null && !failedVerseKeys.has(currentVerseKey);
  const isRevealed = currentVerseKey !== null && revealedKey === currentVerseKey;

  const handleRetryLoadVerse = async (): Promise<void> => {
    const item = dueItems[currentIndex];
    if (!item) return;
    const key = `${item.surah}:${item.ayah}`;

    // Clearing the failure marker is what switches the card back to its loading state.
    setFailedVerseKeys((previous) => {
      if (!previous.has(key)) return previous;
      const next = new Set(previous);
      next.delete(key);
      return next;
    });

    try {
      const verse = await quranProvider.getVerse({ surah: item.surah, ayah: item.ayah });
      setVersesByKey((previous) => ({ ...previous, [key]: verse }));
    } catch (error: unknown) {
      console.error(`Retry for ${key} failed:`, error);
      setFailedVerseKeys((previous) => new Set(previous).add(key));
    }
  };

  const handleGrade = useCallback(
    async (quality: number): Promise<void> => {
      if (!currentItem || gradingRef.current) return;
      gradingRef.current = true;
      setIsGrading(true);

      try {
        const nextProgress = calculateNextReview(currentItem, quality);
        await db.verseProgress.put(nextProgress);

        if (mistakePriorityKeys.has(currentItem.verseKey)) {
          track('mistakes.priority_review_graded', { verseKey: currentItem.verseKey });
        }

        const xp = quality >= 3 ? 15 : 5;
        await recordActivity({
          xp,
          event: 'review.graded',
          props: {
            quality,
            verseKey: currentItem.verseKey,
            intervalBefore: currentItem.interval,
            intervalAfter: nextProgress.interval,
          },
        });

        if (quality >= 4) {
          // Celebration is decorative only: skipped entirely for reduced-motion users.
          const motionAllowed =
            typeof window === 'undefined' || !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          if (motionAllowed) {
            try {
              confetti({ particleCount: 40, spread: 50, disableForReducedMotion: true });
            } catch (error) {
              console.warn('Celebration effect unavailable:', error);
            }
          }
        }

        setReviewedCount((previous) => previous + 1);

        // Grading the final card moves the index past the queue, which renders the
        // completion screen instead of an empty card.
        setCurrentIndex((previous) =>
          previous < dueItems.length - 1 ? previous + 1 : dueItems.length
        );
      } finally {
        gradingRef.current = false;
        setIsGrading(false);
      }
    },
    [currentItem, dueItems.length, mistakePriorityKeys]
  );

  /** Plays the verification recitation, ending on the Arabic synthesizer if needed. */
  const playAudio = useCallback(
    async (url?: string, arabicFallbackText?: string): Promise<void> => {
      if (url) {
        const played = await playUrl('review-verification', url);
        if (played) return;
      }
      if (arabicFallbackText) {
        await speak('review-verification-speech', arabicFallbackText, 'ar-SA');
      }
    },
    [playUrl, speak]
  );

  if (loading) {
    return (
      <div className="max-w-md mx-auto">
        <StatePanel variant="loading" title="Building today’s review queue…" description="Weakest recall first — ordering your scheduled ayahs." minHeight="min-h-[16rem]" />
      </div>
    );
  }

  // Nothing due: say so, with the next due time, instead of inventing a queue.
  if (allItems.length === 0) {
    const nextLabel = nextDue
      ? nextDue.toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })
      : null;
    return (
      <div className="max-w-md mx-auto p-8 rounded-3xl bg-card border border-border text-center space-y-5 shadow-xl animate-in zoom-in-95">
        <div className="w-16 h-16 rounded-2xl bg-primary-subtle flex items-center justify-center text-primary mx-auto">
          <Clock className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-foreground">Nothing is due right now</h2>
          <p className="text-xs text-muted-foreground">
            {totalTracked === 0
              ? 'Your review queue is empty. Add ayahs from the reader with “Add to Hifz”, or start with a small set.'
              : nextLabel
                ? `${totalTracked} ayahs are scheduled. The next one is due ${nextLabel}.`
                : `${totalTracked} ayahs are scheduled and none are due yet.`}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          {totalTracked === 0 ? (
            <button
              type="button"
              onClick={() => void seedStarterVerses()}
              disabled={seeding}
              className="flex-1 py-3 px-4 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold shadow-md transition-all active:scale-95 disabled:opacity-60"
            >
              {seeding ? 'Adding…' : 'Start with Al-Fatihah 1–3 and Al-Ikhlas 1–2'}
            </button>
          ) : (
            <Link
              href="/memorize?source=queue"
              className="flex-1 py-3 px-4 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold shadow-md transition-all active:scale-95"
            >
              Drill scheduled ayahs anyway
            </Link>
          )}
          <Link
            href="/quran"
            className="flex-1 py-3 px-4 rounded-xl bg-surface border border-border text-foreground text-xs font-bold hover:bg-surface-hover transition-colors"
          >
            Open the reader
          </Link>
        </div>
      </div>
    );
  }

  // Queue completed screen
  if (currentIndex >= dueItems.length) {
    return (
      <div className="max-w-md mx-auto p-8 rounded-3xl bg-card border border-border text-center space-y-5 shadow-xl animate-in zoom-in-95">
        <div className="w-16 h-16 rounded-2xl bg-primary-subtle flex items-center justify-center text-primary mx-auto">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-foreground">
            Queue Clear! Alhamdulillah
          </h2>
          <p className="text-xs text-muted-foreground">
            You reviewed {reviewedCount} items today.
          </p>
        </div>

        <div className="flex gap-3 pt-2">
          <Link
            href="/memorize"
            className="flex-1 py-3 px-4 rounded-xl bg-surface border border-border text-foreground text-xs font-bold hover:bg-surface-hover transition-colors"
          >
            Memorization modes
          </Link>
          <Link
            href="/"
            className="flex-1 py-3 px-4 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold shadow-md transition-all active:scale-95"
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-secondary uppercase tracking-wider">
              Spaced Repetition Review
            </span>
            {stateMeta && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${stateMeta.bg} ${stateMeta.color}`}>
                {stateMeta.label}
              </span>
            )}
            {currentItem && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-surface-muted border border-border text-foreground uppercase">
                {currentItem.hifzTier || determineHifzTier(currentItem)}
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold text-foreground">
            Item {currentIndex + 1} of {dueItems.length}
          </h1>
        </div>

        <span className="text-xs text-muted-foreground font-medium">
          Interval: {currentItem?.interval ?? 0}d • Reps: {currentItem?.repetitions ?? 0}
          {currentItem?.stability !== undefined ? ` • Stability: ${currentItem.stability.toFixed(1)}d` : ''}
        </span>
      </div>

      {/* Tier Filter Tabs */}
      <div className="flex items-center gap-1.5 p-1 rounded-xl bg-card border border-border overflow-x-auto">
        <button
          onClick={() => {
            setActiveTierFilter('all');
            setCurrentIndex(0);
          }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
            activeTierFilter === 'all'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          All Due ({allItems.length})
        </button>

        <button
          onClick={() => {
            setActiveTierFilter('sabaq');
            setCurrentIndex(0);
          }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
            activeTierFilter === 'sabaq'
              ? 'bg-primary-subtle text-primary-strong border border-primary/40'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {HIFZ_TIER_META.sabaq.titleAr} • Sabaq
        </button>

        <button
          onClick={() => {
            setActiveTierFilter('sabqi');
            setCurrentIndex(0);
          }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
            activeTierFilter === 'sabqi'
              ? 'bg-secondary-subtle text-secondary-strong border border-secondary/40'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {HIFZ_TIER_META.sabqi.titleAr} • Sabqi
        </button>

        <button
          onClick={() => {
            setActiveTierFilter('manzil');
            setCurrentIndex(0);
          }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
            activeTierFilter === 'manzil'
              ? 'bg-surface-muted text-foreground border border-border'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {HIFZ_TIER_META.manzil.titleAr} • Manzil
        </button>
      </div>

      {/* Flashcard Container */}
      <div className="p-6 sm:p-8 rounded-3xl bg-card border border-border shadow-xl space-y-6">
        {/* Ayah target banner */}
        <div className="text-center pb-4 border-b border-border">
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-surface border border-border text-foreground">
            Surah {currentItem?.surah} • Ayah {currentItem?.ayah}
          </span>
          <p className="text-xs text-muted-foreground mt-2">
            Recite this Ayah mentally or aloud, then tap Reveal to verify.
          </p>
        </div>

        {/* Hidden / Revealed Area */}
        <div className="min-h-[160px] flex flex-col items-center justify-center text-center p-4 bg-surface rounded-2xl border border-border">
          {!isRevealed ? (
            <button
              onClick={() => setRevealedKey(currentVerseKey)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground font-bold text-xs shadow-md active:scale-95 transition-all"
            >
              <Eye className="w-4 h-4" />
              <span>Reveal Ayah</span>
            </button>
          ) : isVerseLoading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="text-xs">Loading verse…</span>
            </div>
          ) : verseForCurrentCard ? (
            <div className="space-y-4 animate-in fade-in w-full">
              <p className="font-arabic text-3xl sm:text-4xl text-foreground leading-loose select-text dir-rtl" dir="rtl" lang="ar">
                {verseForCurrentCard.textUthmani}
              </p>

              <div className="space-y-1.5 text-xs text-left max-w-lg mx-auto pt-2 border-t border-border">
                <p className="text-foreground">
                  <span className="font-bold text-muted-foreground mr-1.5 uppercase">EN:</span>
                  {verseForCurrentCard.translationEn}
                </p>
                {verseForCurrentCard.translationTa && (
                  <p className="text-primary-strong font-tamil">
                    <span className="font-bold text-primary mr-1.5">தமிழ்:</span>
                    {verseForCurrentCard.translationTa}
                  </p>
                )}
              </div>

              {verseForCurrentCard.audioUrl && (
                <div className="pt-2">
                  <button
                    onClick={() =>
                      void playAudio(verseForCurrentCard.audioUrl, verseForCurrentCard.textUthmani)
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-subtle text-primary-strong hover:bg-primary/20 text-xs font-semibold transition-colors"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Listen Verification</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-6 space-y-3">
              <p className="text-xs text-danger font-semibold">
                This Ayah could not be loaded, so nothing is shown. Check your connection,
                then retry.
              </p>
              <button
                onClick={handleRetryLoadVerse}
                className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-surface border border-border text-foreground hover:bg-surface-hover text-xs font-bold transition-colors"
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
            <div className="flex justify-between text-xs text-muted-foreground font-semibold px-1">
              <span>How well did you remember?</span>
              <span className="text-primary-strong font-bold">FSRS scheduler</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {(() => {
                // Interval preview per grade, computed from the same FSRS path grading uses.
                const p = previewGrades(currentItem ?? { surah: 0, ayah: 0 } as VerseProgress);
                const label = (days: number): string => (days < 1 ? '<1 day' : `${days}d`);
                return (
                  <>
                    <button
                      onClick={() => void handleGrade(1)}
                      disabled={isGrading}
                      className="p-3.5 rounded-2xl bg-danger-subtle border border-danger/30 text-danger-strong text-xs font-bold hover:bg-danger/20 disabled:opacity-60 disabled:pointer-events-none flex flex-col items-center gap-1 transition-colors"
                    >
                      <span>Again (1)</span>
                      <span className="text-[10px] font-normal opacity-80">{label(p.again)}</span>
                    </button>

                    <button
                      onClick={() => void handleGrade(3)}
                      disabled={isGrading}
                      className="p-3.5 rounded-2xl bg-secondary-subtle border border-secondary/30 text-secondary-strong text-xs font-bold hover:bg-secondary/20 disabled:opacity-60 disabled:pointer-events-none flex flex-col items-center gap-1 transition-colors"
                    >
                      <span>Hard (3)</span>
                      <span className="text-[10px] font-normal opacity-80">{label(p.hard)}</span>
                    </button>

                    <button
                      onClick={() => void handleGrade(4)}
                      disabled={isGrading}
                      className="p-3.5 rounded-2xl bg-primary-subtle border border-primary/30 text-primary-strong text-xs font-bold hover:bg-primary/20 disabled:opacity-60 disabled:pointer-events-none flex flex-col items-center gap-1 transition-colors"
                    >
                      <span>Good (4)</span>
                      <span className="text-[10px] font-normal opacity-80">{label(p.good)}</span>
                    </button>

                    <button
                      onClick={() => void handleGrade(5)}
                      disabled={isGrading}
                      className="p-3.5 rounded-2xl bg-surface border border-border text-foreground text-xs font-bold hover:bg-surface-hover disabled:opacity-60 disabled:pointer-events-none flex flex-col items-center gap-1 transition-colors"
                    >
                      <span>Easy (5)</span>
                      <span className="text-[10px] font-normal opacity-80">{label(p.easy)}</span>
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
