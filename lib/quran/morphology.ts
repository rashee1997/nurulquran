import { db } from '@/lib/db';

/**
 * Word morphology (root, lemma, part of speech, gloss) for every word of the Mushaf.
 *
 * The bundled map in `alquran-cloud.ts` covers a dozen words. This module loads a
 * per-surah morphology file from a CDN, validates it, and caches it in `quranCache`
 * under `morph:<surah>` so a surah's roots are fetched once per device.
 *
 * Source: the open Quranic Arabic Corpus morphology (GPL) republished per surah as JSON.
 * The URL is configured with `NEXT_PUBLIC_MORPHOLOGY_URL` (base) and the file for surah
 * N is `<base>/<N>.json`. The expected shape is `MorphologyFile` below. When no source
 * is configured, or the fetch fails, `null` is returned and the popover says the root
 * is unavailable rather than guessing one.
 */

export interface WordMorphology {
  /** Root letters, e.g. "ر-ح-م". */
  root?: string;
  lemma?: string;
  /** Part of speech and features, e.g. "Noun (Genitive)". */
  morphology?: string;
  transliteration?: string;
  en?: string;
  ta?: string;
}

/** Keyed by 1-based `ayah:word`. */
export type MorphologyFile = Record<string, WordMorphology>;

const memory = new Map<number, Promise<MorphologyFile | null>>();
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 90;

function sourceUrl(surah: number): string | null {
  const base = process.env.NEXT_PUBLIC_MORPHOLOGY_URL?.trim();
  if (!base) return null;
  return `${base.replace(/\/$/, '')}/${surah}.json`;
}

function isMorphologyFile(payload: unknown): payload is MorphologyFile {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return false;
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (!/^\d+:\d+$/.test(key)) return false;
    if (typeof value !== 'object' || value === null) return false;
    for (const field of Object.values(value as Record<string, unknown>)) {
      if (field !== undefined && typeof field !== 'string') return false;
    }
  }
  return true;
}

/** Loads morphology for a surah: memory → IndexedDB → CDN. */
export function loadSurahMorphology(surah: number): Promise<MorphologyFile | null> {
  const existing = memory.get(surah);
  if (existing) return existing;

  const request = (async (): Promise<MorphologyFile | null> => {
    const cacheKey = `morph:${surah}`;
    if (typeof window !== 'undefined') {
      try {
        const cached = await db.quranCache.get(cacheKey);
        if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS && isMorphologyFile(cached.data)) {
          return cached.data;
        }
      } catch {
        // Cache miss; fall through to the network.
      }
    }

    const url = sourceUrl(surah);
    if (!url) return null;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (!response.ok) return null;
      const payload: unknown = await response.json();
      if (!isMorphologyFile(payload)) return null;
      if (typeof window !== 'undefined') {
        await db.quranCache.put({ key: cacheKey, data: payload, cachedAt: Date.now() }).catch(() => undefined);
      }
      return payload;
    } catch {
      return null;
    }
  })();

  memory.set(surah, request);
  return request;
}

/** Morphology for one word, or null when unknown. */
export async function lookupWordMorphology(
  surah: number,
  ayah: number,
  wordIndex: number
): Promise<WordMorphology | null> {
  const file = await loadSurahMorphology(surah);
  return file?.[`${ayah}:${wordIndex}`] ?? null;
}

/** True when a morphology source is configured for this build. */
export function hasMorphologySource(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_MORPHOLOGY_URL?.trim());
}
