import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpen, Languages, Mic, Sparkles } from 'lucide-react';
import { SURAHS } from '@/lib/quran/surahs';
import { LESSON_TRACKS, ENGLISH_EDITION, TAMIL_EDITION } from '@/lib/tafsir/editions';

export const metadata: Metadata = {
  title: 'Tafseer Lessons — NurulQuran',
  description:
    'Read authentic Quranic exegesis in English and Tamil, verse by verse, with a voice storyteller that explains each ayah as a story for young learners.',
};

const TRACK_ACCENT: Record<
  (typeof LESSON_TRACKS)[number]['accent'],
  { chip: string; border: string; icon: string }
> = {
  emerald: {
    chip: 'bg-primary-subtle text-primary-strong',
    border: 'hover:border-primary/50',
    icon: 'text-primary',
  },
  sky: {
    chip: 'bg-info-subtle text-info-strong',
    border: 'hover:border-info/50',
    icon: 'text-info',
  },
  amber: {
    chip: 'bg-secondary-subtle text-secondary-strong',
    border: 'hover:border-secondary/50',
    icon: 'text-secondary',
  },
};

/**
 * Lesson index.
 *
 * A Server Component: the tracks and sūrah metadata are static, so nothing here needs to be
 * shipped to the browser beyond the markup. Each card links straight into the first ayah of
 * the lesson, because a learner arriving here wants to start reading, not to pick a verse
 * number first.
 */
export default function TafsirLessonsPage() {
  return (
    <div className="space-y-8">
      <header className="relative overflow-hidden rounded-3xl bg-hero-bg text-hero-fg border border-hero-border p-6 sm:p-9 shadow-xl">
        <div className="absolute inset-0 opacity-10 bg-pattern-dots" aria-hidden="true" />

        <div className="relative z-10 space-y-4 max-w-3xl">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-hero-pill-bg text-hero-pill-fg text-[11px] font-bold">
            <Sparkles className="w-3 h-3" aria-hidden="true" />
            Tafseer · தஃப்ஸீர்
          </span>

          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
            Understand every ayah, in English and Tamil
          </h1>

          <p className="text-sm sm:text-base text-hero-muted leading-relaxed">
            Each lesson pairs the verified Uthmani verse with its English and Tamil commentary,
            and hands it to Ustadh Ameen — a voice storyteller who explains the meaning as a story
            a ten-year-old can retell, then asks what they understood.
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] font-semibold text-hero-muted">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-hero-card-bg border border-hero-border backdrop-blur-xs">
              <BookOpen className="w-3 h-3" aria-hidden="true" />
              {ENGLISH_EDITION.name}
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-hero-card-bg border border-hero-border backdrop-blur-xs">
              <Languages className="w-3 h-3" aria-hidden="true" />
              {TAMIL_EDITION.name}
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-hero-card-bg border border-hero-border backdrop-blur-xs">
              <Mic className="w-3 h-3" aria-hidden="true" />
              Live voice storyteller
            </span>
          </div>

          <div className="pt-2">
            <Link
              href="/lessons/tafsir/1/1"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-secondary hover:bg-secondary-hover text-secondary-foreground text-xs font-bold shadow-md transition-colors"
            >
              <span>Start with Al-Fatihah</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      {LESSON_TRACKS.map((track) => {
        const accent = TRACK_ACCENT[track.accent];
        const surahs = track.surahs
          .map((id) => SURAHS.find((surah) => surah.id === id))
          .filter((surah): surah is (typeof SURAHS)[number] => Boolean(surah));

        return (
          <section key={track.id} className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-foreground">{track.title}</h2>
                <p className="text-xs text-muted-foreground font-tamil">{track.titleTamil}</p>
              </div>
              <span
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${accent.chip}`}
              >
                {surahs.length} surahs
              </span>
            </div>

            <p className="text-xs text-muted-foreground max-w-3xl leading-relaxed">
              {track.description}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {surahs.map((surah) => (
                <Link
                  key={`${track.id}-${surah.id}`}
                  href={`/lessons/tafsir/${surah.id}/1`}
                  className={`group p-4 rounded-2xl bg-card border border-border ${accent.border} transition-all hover:shadow-sm flex items-center justify-between gap-3`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-9 h-9 rounded-xl bg-surface-muted text-foreground flex items-center justify-center font-bold text-xs shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      {surah.id}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">
                        {surah.nameSimple}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {surah.nameEnglish} · {surah.versesCount} ayahs
                      </p>
                    </div>
                  </div>

                  <span
                    lang="ar"
                    dir="rtl"
                    translate="no"
                    className="notranslate font-arabic text-xl text-primary-strong shrink-0"
                  >
                    {surah.nameArabic}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      <p className="text-[11px] text-muted-foreground text-center max-w-2xl mx-auto leading-relaxed">
        Commentary is shown exactly as published by its editors and is never generated. The
        Arabic verse and its translations come from the app&rsquo;s verified Quran corpus.
      </p>
    </div>
  );
}
