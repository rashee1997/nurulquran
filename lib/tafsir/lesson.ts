/**
 * Tafseer lesson module — lesson assembly.
 *
 * Joins the app's verified Arabic verse with the bilingual exegesis into one
 * `TafsirLessonSegment`. The Arabic text and its translations come from the Quran
 * provider (alquran.cloud `quran-uthmani` with a verified-offline fallback); this module
 * only ever adds *human explanation* around it, and it labels each piece by provenance so
 * the reader can tell a network fetch from a cached copy from an edition that genuinely
 * has no entry for the verse.
 */

import { ASBAB_EDITION, ENGLISH_EDITION, TAMIL_EDITION } from './editions';
import { getAyahTafsir } from './tafsirCache';
import { TafsirUnavailableError } from './tafsirClient';
import type {
  TafsirAsbabEntry,
  TafsirEntry,
  TafsirLanguage,
  TafsirLessonSegment,
  TafsirProvenance,
} from './types';

/**
 * The serializable verse payload a Server Component hands to the reader.
 *
 * Deliberately a narrow subset of the provider's `Verse`: the reader needs the text, the
 * two translations, the audio URL and the provenance, and nothing else should cross the
 * server/client boundary.
 */
export interface LessonVerse {
  surah: number;
  ayah: number;
  versesCount: number;
  surahNameSimple: string;
  surahNameArabic: string;
  surahNameEnglish: string;
  textUthmani: string;
  textSimple: string;
  translationEn: string;
  translationTa: string;
  audioUrl: string;
  provenance: 'network' | 'verified-offline';
}

export type LessonExegesis = Record<TafsirLanguage, TafsirEntry>;

export interface LoadedLesson {
  segment: TafsirLessonSegment;
  /** Editions that could not be retrieved. Empty on a fully successful load. */
  failedEditions: string[];
}

/**
 * Builds one language's entry.
 *
 * A `null` text — whether the edition has no entry for this verse or could not be reached
 * — is reported as `provenance: 'unavailable'` with an empty string, never as an empty
 * commentary that reads like a real (but blank) answer.
 */
function entryFor(
  language: TafsirLanguage,
  text: string | null,
  provenance: TafsirProvenance
): TafsirEntry {
  const edition = language === 'en' ? ENGLISH_EDITION : TAMIL_EDITION;
  return {
    language,
    text: text ?? '',
    editionSlug: edition.slug,
    editionName: edition.name,
    editionAuthor: edition.author,
    provenance: text === null ? 'unavailable' : provenance,
  };
}

/**
 * Loads both exegeses (and the optional occasion of revelation) for one ayah.
 *
 * One edition failing must not blank the lesson: the other language, the Arabic verse and
 * the translations are all still valid teaching material. A failure therefore degrades to
 * `TafsirProvenance: 'unavailable'` for that language and is reported in `failedEditions`,
 * which the UI shows as a labelled notice rather than an empty box.
 */
export async function loadLessonExegesis(
  verse: LessonVerse
): Promise<{ exegesis: LessonExegesis; asbab: TafsirAsbabEntry | null; failedEditions: string[] }> {
  const failedEditions: string[] = [];

  const [english, tamil] = await Promise.all([
    (async (): Promise<{ text: string | null; provenance: TafsirProvenance }> => {
      try {
        return await getAyahTafsir(ENGLISH_EDITION, verse.surah, verse.ayah);
      } catch (error) {
        if (!(error instanceof TafsirUnavailableError)) throw error;
        failedEditions.push(ENGLISH_EDITION.slug);
        return { text: null, provenance: 'unavailable' };
      }
    })(),
    (async (): Promise<{ text: string | null; provenance: TafsirProvenance }> => {
      try {
        return await getAyahTafsir(TAMIL_EDITION, verse.surah, verse.ayah);
      } catch (error) {
        if (!(error instanceof TafsirUnavailableError)) throw error;
        failedEditions.push(TAMIL_EDITION.slug);
        return { text: null, provenance: 'unavailable' };
      }
    })(),
  ]);

  // Best-effort: no recorded occasion of revelation is the common case, not a failure.
  let asbab: TafsirAsbabEntry | null = null;
  try {
    const found = await getAyahTafsir(ASBAB_EDITION, verse.surah, verse.ayah);
    if (found.text && found.text.trim().length > 0) {
      asbab = { text: found.text, editionSlug: ASBAB_EDITION.slug, editionName: ASBAB_EDITION.name };
    }
  } catch (error) {
    if (!(error instanceof TafsirUnavailableError)) throw error;
    console.warn(`Occasion-of-revelation lookup failed for ${verse.surah}:${verse.ayah}.`);
  }

  return {
    exegesis: {
      en: entryFor('en', english.text, english.provenance),
      ta: entryFor('ta', tamil.text, tamil.provenance),
    },
    asbab,
    failedEditions,
  };
}

/** Assembles the complete, prompt-ready lesson segment. */
export async function buildLessonSegment(verse: LessonVerse): Promise<LoadedLesson> {
  const { exegesis, asbab, failedEditions } = await loadLessonExegesis(verse);

  return {
    failedEditions,
    segment: {
      surah: verse.surah,
      ayah: verse.ayah,
      versesCount: verse.versesCount,
      surahNameSimple: verse.surahNameSimple,
      surahNameArabic: verse.surahNameArabic,
      surahNameEnglish: verse.surahNameEnglish,
      textUthmani: verse.textUthmani,
      textSimple: verse.textSimple,
      translationEn: verse.translationEn,
      translationTa: verse.translationTa,
      audioUrl: verse.audioUrl,
      verseProvenance: verse.provenance,
      tafsir: exegesis,
      asbab,
    },
  };
}
