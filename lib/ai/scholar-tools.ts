/**
 * Scholar tools for the AI study assistant.
 *
 * Every function here returns only data retrieved from a verified source — the in-repo
 * surah metadata, the app's own Quran provider, or the tafsir CDN client that already
 * backs the lesson module. Nothing synthesises scripture or exegesis, and each result
 * carries the source label the assistant must cite.
 *
 * The tafsir client (`lib/tafsir/tafsirClient`) is deliberately reused rather than
 * reimplemented: it already owns the CDN tier fallbacks, the 404-is-missing semantics,
 * the schema validation and the caching strategy for the spa5k/tafsir_api datasets.
 */

import { getChapterMetadata } from '@/lib/quran/surahs';
import {
  ENGLISH_EDITION,
  SCHOLARLY_EDITION,
  TAMIL_EDITION,
  type TafsirEditionDefinition,
} from '@/lib/tafsir/editions';
import { fetchTafsirAyah } from '@/lib/tafsir/tafsirClient';

/* -------------------------------------------------------------------------- */
/* Surah context                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Chapter intro source. The Quran.com v4 `/chapters/{id}/info` endpoint serves Sayyid
 * Abul Ala Maududi's introduction (name, period of revelation, themes) per language.
 * Verified live: `language=en` returns the English text; other languages fall back to
 * the English record rather than guessing.
 */
const QURAN_COM_INFO_BASE = 'https://api.quran.com/api/v4';
const INFO_FETCH_TIMEOUT_MS = 9_000;

interface ChapterInfoPayload {
  chapter_info?: {
    short_text?: unknown;
    text?: unknown;
    source?: unknown;
  } | null;
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** Strips the HTML the info endpoint embeds (headings, links, emphasis). */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface SurahContextResult {
  surah: number;
  nameSimple: string;
  nameArabic: string;
  nameEnglish: string;
  revelationPlace: 'makkah' | 'madinah';
  versesCount: number;
  /** Short intro line, from Maududi's chapter info when retrievable. */
  shortText: string | null;
  /** Full introduction (period of revelation, themes), HTML stripped. */
  introText: string | null;
  source: string;
  note?: string;
}

export async function getSurahContext(surah: number): Promise<SurahContextResult> {
  const chapter = getChapterMetadata(surah);

  try {
    const response = await fetch(`${QURAN_COM_INFO_BASE}/chapters/${surah}/info?language=en`, {
      signal: AbortSignal.timeout(INFO_FETCH_TIMEOUT_MS),
      next: { revalidate: 60 * 60 * 24 * 7 },
    });
    if (response.ok) {
      const payload = (await response.json()) as ChapterInfoPayload;
      const info = payload.chapter_info ?? null;
      const shortText = asText(info?.short_text);
      const introRaw = asText(info?.text);
      const source = asText(info?.source) ?? "Sayyid Abul Ala Maududi — Tafhim al-Qur'an";
      return {
        surah,
        nameSimple: chapter.nameSimple,
        nameArabic: chapter.nameArabic,
        nameEnglish: chapter.nameEnglish,
        revelationPlace: chapter.revelationPlace,
        versesCount: chapter.versesCount,
        shortText,
        introText: introRaw ? stripHtml(introRaw) : null,
        source,
      };
    }
  } catch {
    // Handled below: metadata-only answer is still verified, the intro is simply absent.
  }

  return {
    surah,
    nameSimple: chapter.nameSimple,
    nameArabic: chapter.nameArabic,
    nameEnglish: chapter.nameEnglish,
    revelationPlace: chapter.revelationPlace,
    versesCount: chapter.versesCount,
    shortText: null,
    introText: null,
    source: 'In-app verified surah metadata',
    note: 'The chapter introduction service was unreachable. Only the local metadata (names, revelation place, verse count) is verified — do not invent period-of-revelation details.',
  };
}

/* -------------------------------------------------------------------------- */
/* Tafsir retrieval                                                           */
/* -------------------------------------------------------------------------- */

export const TAFSIR_TOOL_EDITIONS: Record<string, TafsirEditionDefinition> = {
  'en-mukhtasar': ENGLISH_EDITION,
  'ta-mokhtasar': TAMIL_EDITION,
  'en-ibn-kathir': SCHOLARLY_EDITION,
};

export type TafsirToolEditionKey = keyof typeof TAFSIR_TOOL_EDITIONS;

export interface AyahTafsirResult {
  surah: number;
  ayah: number;
  edition: string;
  editionName: string;
  author: string;
  language: string;
  text: string;
  source: string;
}

/**
 * Fetches one ayah's exegesis from a named edition through the existing tafsir client.
 * Returns `null` for an edition that has no entry for the verse — a fact the assistant
 * must state, not paper over.
 */
export async function getAyahTafsir(
  surah: number,
  ayah: number,
  editionKey: string
): Promise<AyahTafsirResult | null> {
  const edition = TAFSIR_TOOL_EDITIONS[editionKey];
  if (!edition) return null;

  const record = await fetchTafsirAyah(edition, surah, ayah);
  if (!record) return null;

  return {
    surah,
    ayah,
    edition: edition.slug,
    editionName: edition.name,
    author: edition.author,
    language: edition.language,
    text: record.text,
    source: `spa5k/tafsir_api — ${edition.name}`,
  };
}
