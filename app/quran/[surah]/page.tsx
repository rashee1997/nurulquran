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

  // Strict route param: `parseInt` accepted "7abc" as surah 7, so a malformed link
  // silently opened a different surah than the URL claimed.
  if (!/^\d{1,3}$/.test(surahParam)) {
    notFound();
  }
  const surahId = Number(surahParam);

  if (surahId < 1 || surahId > 114) {
    notFound();
  }

  const surahMeta = SURAHS.find(s => s.id === surahId);
  if (!surahMeta) {
    notFound();
  }

  // Fetch verified verses with Tajweed, English, and Tamil.
  //
  // A failure is deliberately NOT caught here. The provider throws
  // `QuranUnavailableError` rather than substituting text, and swallowing it rendered
  // the reader's empty state — a dead end with no way to retry. Letting it reach
  // `error.tsx` shows the reader-scoped "could not be loaded" panel with Retry and a
  // link to another surah, while no scripture is displayed either way.
  const verses: Verse[] = await quranProvider.getChapterVerses(surahId);

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
