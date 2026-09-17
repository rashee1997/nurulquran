import React from 'react';
import { notFound } from 'next/navigation';
import { quranProvider } from '@/lib/quran/alquran-cloud';
import { SURAHS } from '@/lib/quran/surahs';
import { QuranReader } from '@/components/quran/QuranReader';
import { Chapter, Verse } from '@/lib/quran/types';

interface SurahPageProps {
  params: Promise<{ surah: string }>;
}

export default async function SurahReaderPage({ params }: SurahPageProps) {
  const { surah: surahParam } = await params;
  const surahId = parseInt(surahParam, 10);

  if (isNaN(surahId) || surahId < 1 || surahId > 114) {
    notFound();
  }

  const surahMeta = SURAHS.find(s => s.id === surahId);
  if (!surahMeta) {
    notFound();
  }

  // Fetch verified verses with Tajweed, English, and Tamil
  let verses: Verse[] = [];
  try {
    verses = await quranProvider.getChapterVerses(surahId);
  } catch (err) {
    console.error(`Failed to fetch verses for surah ${surahId}:`, err);
  }

  const chapter: Chapter = {
    id: surahMeta.id,
    nameSimple: surahMeta.nameSimple,
    nameArabic: surahMeta.nameArabic,
    nameEnglish: surahMeta.nameEnglish,
    revelationPlace: surahMeta.revelationPlace,
    versesCount: surahMeta.versesCount,
    bismillahPre: surahMeta.bismillahPre,
  };

  return (
    <div className="w-full">
      <QuranReader chapter={chapter} verses={verses} />
    </div>
  );
}
