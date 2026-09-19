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
 * Options for the lesson assembly.
 *
 * `deferAsbab` exists because the occasion-of-revelation lookup is the one part of the lesson that
 * can only be answered per ayah (the edition is sparse), so awaiting it put a CDN round trip on the
 * critical path of *every* reader interaction: stepping to the next ayah showed a loading skeleton
 * until that request — 8 s timeout, two attempts, three CDN tiers — settled, even when both the
 * English and Tamil commentaries were already in memory. When deferred, the two commentaries
 * resolve the segment immediately and the optional historical note arrives in a second update.
 */
export interface LoadLessonOptions {
  /** Called with the occasion of revelation when a deferred lookup settles. */
  onAsbab?: (entry: TafsirAsbabEntry | null) => void;
  /** Resolve the segment without waiting for the sparse asbab edition. Server callers want false. */
  deferAsbab?: boolean;
}

/** Best-effort occasion-of-revelation lookup. No recorded occasion is the common case. */
async function lookupAsbab(verse: LessonVerse): Promise<TafsirAsbabEntry | null> {
  try {
    const found = await getAyahTafsir(ASBAB_EDITION, verse.surah, verse.ayah);
    if (found.text && found.text.trim().length > 0) {
      return { text: found.text, editionSlug: ASBAB_EDITION.slug, editionName: ASBAB_EDITION.name };
    }
    return null;
  } catch (error) {
    if (!(error instanceof TafsirUnavailableError)) throw error;
    console.warn(`Occasion-of-revelation lookup failed for ${verse.surah}:${verse.ayah}.`);
    return null;
  }
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
  verse: LessonVerse,
  options: LoadLessonOptions = {}
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

  /*
   * The asbab lookup is fired either way; `deferAsbab` only decides whether it is awaited.
   *
   * Both the English and Tamil commentaries above are already resolved (and, for a warm chapter,
   * in memory) before this point, so awaiting a sparse per-ayah request here would hold the whole
   * segment behind the slowest and least important of its three sources.
   */
  let asbab: TafsirAsbabEntry | null = null;
  if (options.deferAsbab) {
    void lookupAsbab(verse).then(
      (entry) => options.onAsbab?.(entry),
      () => options.onAsbab?.(null)
    );
  } else {
    asbab = await lookupAsbab(verse);
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
export async function buildLessonSegment(
  verse: LessonVerse,
  options: LoadLessonOptions = {}
): Promise<LoadedLesson> {
  const { exegesis, asbab, failedEditions } = await loadLessonExegesis(verse, options);

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
