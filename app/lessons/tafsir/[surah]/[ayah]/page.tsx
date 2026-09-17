import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { quranProvider } from '@/lib/quran/alquran-cloud';
import { SURAHS } from '@/lib/quran/surahs';
import { TafsirLessonShell } from '@/components/tafsir/TafsirLessonShell';
import type { LessonVerse } from '@/lib/tafsir/lesson';

interface TafsirLessonPageProps {
  params: Promise<{ surah: string; ayah: string }>;
}

/**
 * Resolves and validates the route parameters.
 *
 * Digits-only is enforced rather than parsed loosely, because `parseInt('7abc')` returns 7
 * and would quietly open a different lesson than the URL claims. Both bounds are then checked
 * against the sūrah's real ayah count, so `/lessons/tafsir/112/9` is a 404 rather than an
 * ayat that does not exist.
 */
function resolveParams(
  surahParam: string,
  ayahParam: string
): { surah: number; ayah: number } | null {
  if (!/^\d{1,3}$/.test(surahParam) || !/^\d{1,3}$/.test(ayahParam)) return null;

  const surah = Number(surahParam);
  const ayah = Number(ayahParam);

  const meta = SURAHS.find((entry) => entry.id === surah);
  if (!meta) return null;
  if (ayah < 1 || ayah > meta.versesCount) return null;

  return { surah, ayah };
}

export async function generateMetadata({ params }: TafsirLessonPageProps): Promise<Metadata> {
  const { surah, ayah } = await params;
  const resolved = resolveParams(surah, ayah);
  if (!resolved) return { title: 'Lesson not found — NurulQuran' };

  const meta = SURAHS.find((entry) => entry.id === resolved.surah);
  return {
    title: `${meta?.nameSimple ?? 'Surah'} ${resolved.surah}:${resolved.ayah} — Tafseer Lesson`,
    description: `English and Tamil tafsir for ${meta?.nameSimple ?? 'this surah'} ${resolved.surah}:${resolved.ayah}, with a voice storyteller that explains the ayah as a story for young learners.`,
  };
}

/**
 * Tafseer lesson page.
 *
 * The verified Arabic verse is resolved here, on the server, and only its serialisable fields
 * cross into the Client Component. The exegesis is deliberately *not* fetched here: it is
 * loaded cache-first in the browser so that a second visit to a chapter issues no network
 * request at all, which a server render would defeat.
 *
 * A failure to resolve the verse is not caught. The provider throws rather than substituting
 * text, and letting that reach `error.tsx` shows a retryable panel, whereas catching it would
 * render a lesson whose Arabic has silently gone missing.
 */
export default async function TafsirLessonPage({ params }: TafsirLessonPageProps) {
  const { surah, ayah } = await params;
  const resolved = resolveParams(surah, ayah);
  if (!resolved) notFound();

  const meta = SURAHS.find((entry) => entry.id === resolved.surah);
  if (!meta) notFound();

  const verse = await quranProvider.getVerse({ surah: resolved.surah, ayah: resolved.ayah });

  const lessonVerse: LessonVerse = {
    surah: resolved.surah,
    ayah: resolved.ayah,
    versesCount: meta.versesCount,
    surahNameSimple: meta.nameSimple,
    surahNameArabic: meta.nameArabic,
    surahNameEnglish: meta.nameEnglish,
    textUthmani: verse.textUthmani,
    textSimple: verse.textSimple,
    translationEn: verse.translationEn,
    translationTa: verse.translationTa,
    audioUrl: verse.audioUrl,
    provenance: verse.provenance ?? 'network',
  };

  return (
    <div className="w-full">
      <TafsirLessonShell verse={lessonVerse} />
    </div>
  );
}
