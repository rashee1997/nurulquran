'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { ArabicLabLesson, ArabicLabProgress, ArabicTrack } from '@/lib/arabic/types';
import { ARABIC_LAB_LEVELS, ARABIC_LAB_TOTAL_XP } from '@/lib/arabic/curriculum';
import { ARABIC_LEXICON } from '@/lib/arabic/lexicon';
import { ARABIC_DIALOGS } from '@/lib/arabic/dialogs';
import {
  emptyArabicLabProgress,
  loadArabicLabProgress,
  recordLessonCompletion,
  saveFeedbackLanguage,
} from '@/lib/arabic/progress';
import { initializeDatabase, type UserProfile } from '@/lib/db';
import {
  FEEDBACK_LANGUAGE_OPTIONS,
  isEnglishEnabled,
  isTamilEnabled,
  normalizeFeedbackLanguage,
  type FeedbackLanguage,
} from '@/lib/i18n/language';
import { ArabicLabRunner } from '@/components/arabic/ArabicLabRunner';
import { RegisterBridgePanel } from '@/components/arabic/RegisterBridgePanel';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  GitCompareArrows,
  Languages,
  Lock,
  PenLine,
  Play,
  Settings,
  Target,
  Trophy,
} from 'lucide-react';

const TRACK_CHIPS: Record<ArabicTrack, string> = {
  reading: 'bg-info-subtle text-info-strong',
  writing: 'bg-secondary-subtle text-secondary-strong',
  grammar: 'bg-primary-subtle text-primary-strong',
  register: 'bg-muted text-foreground',
};

export default function ArabicLabPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [progress, setProgress] = useState<ArabicLabProgress>(emptyArabicLabProgress());
  const [language, setLanguage] = useState<FeedbackLanguage>('both');
  const [selectedLevelId, setSelectedLevelId] = useState<string>('A1');
  const [activeLesson, setActiveLesson] = useState<ArabicLabLesson | null>(null);
  const [bridgeEntryId, setBridgeEntryId] = useState<string>(
    ARABIC_LEXICON.find((entry) => entry.quranic)?.id ?? ARABIC_LEXICON[0]?.id ?? ''
  );
  const [lastResult, setLastResult] = useState<{ lessonId: string; score: number; xp: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const loadedProfile = await initializeDatabase();
      const loadedProgress = await loadArabicLabProgress();
      if (cancelled) return;

      setProfile(loadedProfile);
      setProgress(loadedProgress);
      setLanguage(normalizeFeedbackLanguage(loadedProfile.aiFeedbackLanguage));

      const totalXp = loadedProfile.totalXp;
      const firstOpenLevel = ARABIC_LAB_LEVELS.find(
        (level) =>
          totalXp >= level.requiredXp &&
          level.lessons.some((lesson) => !loadedProgress.completedLessonIds.includes(lesson.id))
      );
      const fallbackLevel = ARABIC_LAB_LEVELS[0];
      const resolvedLevel = firstOpenLevel ?? fallbackLevel;
      if (resolvedLevel) {
        setSelectedLevelId(resolvedLevel.id);
      }
      setIsLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalXp = profile?.totalXp ?? 0;

  const stats = useMemo(
    () => ({
      levels: ARABIC_LAB_LEVELS.length,
      lessons: ARABIC_LAB_LEVELS.reduce((sum, level) => sum + level.lessons.length, 0),
      activities: ARABIC_LAB_LEVELS.reduce(
        (sum, level) => sum + level.lessons.reduce((inner, lesson) => inner + lesson.activities.length, 0),
        0
      ),
      anchored: ARABIC_LEXICON.filter((entry) => entry.quranic).length,
      entries: ARABIC_LEXICON.length,
      dialogs: ARABIC_DIALOGS.length,
    }),
    []
  );

  const handleLanguageChange = useCallback((next: FeedbackLanguage) => {
    setLanguage(next);
    void saveFeedbackLanguage(next);
  }, []);

  const handleLessonComplete = useCallback(
    async (lesson: ArabicLabLesson, score: number) => {
      const result = await recordLessonCompletion(lesson, score);
      setProgress(result.progress);
      setLastResult({ lessonId: lesson.id, score, xp: result.xpEarned });
      const refreshed = await initializeDatabase();
      setProfile(refreshed);
    },
    []
  );

  const selectedLevel = ARABIC_LAB_LEVELS.find((level) => level.id === selectedLevelId) ?? ARABIC_LAB_LEVELS[0];
  const bridgeEntry =
    ARABIC_LEXICON.find((entry) => entry.id === bridgeEntryId) ?? ARABIC_LEXICON[0];

  const languageNote = isTamilEnabled(language) && !isEnglishEnabled(language)
    ? 'விளக்கங்கள் தமிழில் மட்டும்'
    : isEnglishEnabled(language) && !isTamilEnabled(language)
      ? 'Explanations in English only'
      : 'Explanations in English + தமிழ்';

  return (
    <div className="min-h-screen bg-background pb-16">
      {/* Hero */}
      <section className="relative overflow-hidden bg-hero-bg text-hero-fg">
        <div
          className="absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 18% 22%, var(--hero-muted) 0, transparent 42%), radial-gradient(circle at 82% 78%, var(--primary) 0, transparent 40%)',
          }}
          aria-hidden="true"
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-10 pb-12 space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-hero-pill-bg text-hero-pill-fg text-[11px] font-bold">
              <Languages className="w-3.5 h-3.5" />
              Dual-track · Classical ↔ Spoken
            </span>
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-hero-card-bg border border-hero-border">
              {languageNote}
            </span>
          </div>

          <div className="space-y-3 max-w-3xl">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Arabic Lab
              <span className="font-arabic text-2xl sm:text-3xl font-normal text-hero-muted" lang="ar" dir="rtl"> · الْمُخْتَبَرُ الْعَرَبِيّ</span>
            </h1>
            <p className="text-sm text-hero-muted leading-relaxed">
              Read, write and parse Quranic Arabic, then say the same idea in Modern Standard Arabic.
              Every grammar rule is taught as a <strong className="text-hero-fg">rule pair</strong>: the
              Uthmani ending and the everyday sentence that keeps, drops or reroutes it — always glossed
              in English and Tamil.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Levels', value: stats.levels },
              { label: 'Lessons', value: stats.lessons },
              { label: 'Activities', value: stats.activities },
              { label: 'Quranic anchors', value: stats.anchored },
              { label: 'Lexicon entries', value: stats.entries },
              { label: 'Dialogs', value: stats.dialogs },
            ].map((item) => (
              <div key={item.label} className="p-3 rounded-2xl bg-hero-card-bg border border-hero-border">
                <p className="text-xl font-extrabold">{item.value}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-hero-muted">
                  {item.label}
                </p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-hero-muted">
              Lesson language
            </span>
            {FEEDBACK_LANGUAGE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => handleLanguageChange(option.id)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${
                  language === option.id
                    ? 'bg-hero-fg text-hero-bg border-hero-fg'
                    : 'bg-hero-card-bg text-hero-fg border-hero-border hover:bg-hero-pill-bg'
                }`}
              >
                {option.short}
              </button>
            ))}
            <Link
              href="/settings"
              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-hero-muted hover:text-hero-fg"
            >
              <Settings className="w-3 h-3" />
              <span>More language options</span>
            </Link>
            <span className="ml-auto text-[11px] font-bold px-2.5 py-1 rounded-lg bg-hero-card-bg border border-hero-border">
              {totalXp} XP · {ARABIC_LAB_TOTAL_XP} XP available in the lab
            </span>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((row) => (
              <div key={row} className="h-28 rounded-3xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : activeLesson ? (
          <div className="space-y-5">
            <button
              type="button"
              onClick={() => setActiveLesson(null)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground"
            >
              <ArrowRight className="w-3.5 h-3.5 rotate-180" />
              <span>Back to level map</span>
            </button>
            <ArabicLabRunner
              lesson={activeLesson}
              levelTitle={
                ARABIC_LAB_LEVELS.find((level) => level.id === activeLesson.level)?.title ?? activeLesson.level
              }
              language={language}
              onExit={() => setActiveLesson(null)}
              onCompleted={(score) => void handleLessonComplete(activeLesson, score)}
            />
          </div>
        ) : (
          <>
            {lastResult && (
              <div className="p-4 rounded-2xl bg-success-subtle border border-success/30 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Trophy className="w-5 h-5 text-success-strong shrink-0" />
                  <p className="text-xs font-bold text-success-strong">
                    {lastResult.lessonId} recorded · {lastResult.score}% accuracy · +{lastResult.xp} XP
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setLastResult(null)}
                  className="text-[11px] font-bold text-success-strong hover:underline"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Level map */}
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Target className="w-4 h-4 text-primary" />
                  Dual-track levels A1 → A8
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  Levels unlock with XP, exactly like the Tajweed ladder.
                </p>
              </div>

              <div className="grid lg:grid-cols-2 gap-4">
                {ARABIC_LAB_LEVELS.map((level) => {
                  const unlocked = totalXp >= level.requiredXp;
                  const completed = level.lessons.filter((lesson) =>
                    progress.completedLessonIds.includes(lesson.id)
                  ).length;
                  const isOpen = level.id === selectedLevel?.id;

                  return (
                    <div
                      key={level.id}
                      className={`rounded-3xl border bg-card shadow-xs overflow-hidden transition-colors ${
                        isOpen ? 'border-primary/50' : 'border-border hover:border-border-strong'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedLevelId(level.id)}
                        className="w-full text-left p-4 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0">
                            <div
                              className={`w-10 h-10 rounded-2xl flex items-center justify-center font-extrabold text-sm shrink-0 ${
                                unlocked ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {unlocked ? level.id : <Lock className="w-4 h-4" />}
                            </div>
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-bold text-foreground">{level.title}</h3>
                                {!unlocked && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                                    Needs {level.requiredXp} XP
                                  </span>
                                )}
                              </div>
                              <p className="font-arabic text-base text-muted-foreground leading-loose" dir="rtl" lang="ar">
                                {level.titleArabic}
                              </p>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground shrink-0">
                            {completed}/{level.lessons.length} done
                          </span>
                        </div>

                        <p className="text-[11px] text-muted-foreground leading-relaxed">{level.summaryEn}</p>
                        <p className="font-tamil text-[11px] text-muted-foreground leading-relaxed">
                          {level.summaryTa}
                        </p>

                        <div className="flex flex-wrap gap-1.5">
                          {level.tracks.map((track) => (
                            <span
                              key={track}
                              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${TRACK_CHIPS[track]}`}
                            >
                              {track}
                            </span>
                          ))}
                        </div>
                      </button>

                      {isOpen && (
                        <div className="border-t border-border divide-y divide-border">
                          {level.lessons.map((lesson) => {
                            const done = progress.completedLessonIds.includes(lesson.id);
                            const badge =
                              lesson.track === 'writing'
                                ? 'Trace'
                                : lesson.track === 'reading'
                                  ? 'Read'
                                  : lesson.track === 'grammar'
                                    ? 'Grammar'
                                    : 'Speak';

                            return (
                              <div
                                key={lesson.id}
                                className="p-3.5 flex flex-wrap items-center gap-3 hover:bg-muted/40 transition-colors"
                              >
                                <div className="flex-1 min-w-[200px] space-y-0.5">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-xs font-bold text-foreground">{lesson.title}</span>
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">
                                      {badge}
                                    </span>
                                    {done && <CheckCircle2 className="w-3.5 h-3.5 text-success-strong" />}
                                  </div>
                                  <p className="font-arabic text-sm text-muted-foreground" dir="rtl" lang="ar">
                                    {lesson.titleArabic}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {lesson.activities.length} activities · {lesson.estimatedMinutes} min ·{' '}
                                    {lesson.xpReward} XP
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  disabled={!unlocked}
                                  onClick={() => setActiveLesson(lesson)}
                                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-[11px] font-bold hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                                >
                                  <Play className="w-3 h-3" />
                                  <span>{done ? 'Replay' : 'Start'}</span>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Register bridge explorer */}
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <GitCompareArrows className="w-4 h-4 text-primary" />
                  Register bridge explorer
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  Pick a word: Uthmani token, iʿrāb parse, and its everyday MSA equivalent.
                </p>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                {ARABIC_LEXICON.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setBridgeEntryId(entry.id)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-semibold whitespace-nowrap transition-all ${
                      entry.id === bridgeEntry?.id
                        ? 'border-primary bg-primary-subtle text-primary-strong'
                        : 'border-border bg-card text-foreground hover:border-primary/40'
                    }`}
                  >
                    <span className="font-arabic text-base" dir="rtl" lang="ar">
                      {entry.lemma}
                    </span>
                    {entry.quranic && (
                      <span className="ml-2 text-[10px] text-muted-foreground">
                        {entry.quranic.ref.surah}:{entry.quranic.ref.ayah}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {bridgeEntry && (
                <RegisterBridgePanel entryIds={[bridgeEntry.id]} language={language} />
              )}
            </section>

            {/* Writing track notice */}
            <section className="p-5 rounded-3xl bg-card border border-border shadow-xs space-y-2">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                <PenLine className="w-4 h-4 text-secondary-strong" />
                Writing engine
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Tracing activities open a guided canvas: the letter form is drawn on the Arabic baseline
                and your pen/touch strokes are scored on coverage and spill. Best scores are stored per
                letter form. Stroke-order arrows arrive with the authored stroke models.
              </p>
              <p className="font-tamil text-xs text-muted-foreground leading-relaxed">
                வரைவுப் பயிற்சியில், எழுத்து வடிவம் அரபு அடிக்கோட்டில் காட்டப்படும்; உங்கள் கைவரைவு
                மூடுதல் அளவு மற்றும் வெளியேறல் அளவு மூலம் மதிப்பிடப்படும்.
              </p>
              <Link
                href="/learn"
                className="inline-flex items-center gap-1.5 text-[11px] font-bold text-primary hover:underline"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Compare with the Tajweed curriculum</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
