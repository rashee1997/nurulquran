import { quranProvider } from '@/lib/quran/alquran-cloud';
import { SURAHS } from '@/lib/quran/surahs';
import type { Verse } from '@/lib/quran/types';

/**
 * Shape the game canvases render. Verse already carries every field except the
 * surah's names, so this is a thin projection rather than a parallel data model.
 */
export interface GameVerse {
  surahNumber: number;
  surahName: string;
  surahNameArabic: string;
  ayahNumber: number;
  textUthmani: string;
  textSimple: string;
  translationEn: string;
  translationTa: string;
  words: Array<{
    wordIndex: number;
    arabic: string;
    transliteration: string;
    translationEn: string;
  }>;
  audioUrl: string;
}

export interface AvailableSurah {
  surahNumber: number;
  surahName: string;
  surahNameArabic: string;
  totalAyahs: number;
}

/** Every surah in the mushaf, for the games' surah picker — not just a hardcoded subset. */
export function getAvailableSurahs(): AvailableSurah[] {
  return SURAHS.map((s) => ({
    surahNumber: s.id,
    surahName: s.nameSimple,
    surahNameArabic: s.nameArabic,
    totalAyahs: s.versesCount,
  }));
}

function toGameVerse(verse: Verse, surahName: string, surahNameArabic: string): GameVerse {
  return {
    surahNumber: verse.surah,
    surahName,
    surahNameArabic,
    ayahNumber: verse.numberInSurah,
    textUthmani: verse.textUthmani,
    textSimple: verse.textSimple,
    translationEn: verse.translationEn,
    translationTa: verse.translationTa,
    words: verse.words.map((w) => ({
      wordIndex: w.wordIndex,
      arabic: w.arabic,
      transliteration: w.transliteration,
      translationEn: w.translationEn,
    })),
    audioUrl: verse.audioUrl,
  };
}

const cache = new Map<number, Promise<GameVerse[]>>();

/**
 * Every ayah of a surah, drawn live from the same verified provider the reader uses —
 * so a game can be played on any of the 114 surahs, not only a hand-curated subset.
 * Memory-cached per surah for the lifetime of the tab.
 */
export function getSurahGameVerses(surahId: number): Promise<GameVerse[]> {
  const cached = cache.get(surahId);
  if (cached) return cached;

  const meta = SURAHS.find((s) => s.id === surahId);
  const promise = quranProvider
    .getChapterVerses(surahId)
    .then((verses) => verses.map((v) => toGameVerse(v, meta?.nameSimple ?? `Surah ${surahId}`, meta?.nameArabic ?? '')));
  cache.set(surahId, promise);
  return promise;
}

/** A handful of random ayahs (from anywhere in the mushaf) for games that need a varied pool. */
export async function getRandomGameVerses(count: number): Promise<GameVerse[]> {
  const picked: GameVerse[] = [];
  const seenSurahs = new Set<number>();
  while (picked.length < count && seenSurahs.size < SURAHS.length) {
    const surahId = 1 + Math.floor(Math.random() * SURAHS.length);
    if (seenSurahs.has(surahId)) continue;
    seenSurahs.add(surahId);
    const verses = await getSurahGameVerses(surahId);
    if (verses.length === 0) continue;
    const verse = verses[Math.floor(Math.random() * verses.length)];
    if (verse && verse.words.length >= 2) picked.push(verse);
  }
  return picked;
}
