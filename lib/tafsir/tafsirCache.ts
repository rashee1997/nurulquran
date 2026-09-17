/**
 * Tafseer lesson module — cache-first persistent store.
 *
 * Strategy: **cache-first, network-fallback**, keyed per chapter because the CDN serves a
 * whole sūrah per request. Consequences:
 *
 *  - Reading ayah N, then N+1, then N+2 for the same sūrah costs **one** network request
 *    in total, so "prefetch the next two verses" is a cache lookup rather than extra I/O.
 *  - Re-opening a chapter after a reload issues **zero** network requests.
 *  - Only the sparse occasion-of-revelation edition still needs per-ayah requests, and it
 *    is prefetched the same way.
 *
 * A layer of care that mirrors `lib/quran/alquran-cloud.ts`: IndexedDB rows are untrusted
 * input. A browser profile, an extension, or an older build may have written that key, so
 * every cached chapter is shape- and identity-checked against the request before a single
 * character is rendered. A row that does not describe the chapter it was asked for is
 * discarded and re-fetched, never displayed.
 */

import { db } from '@/lib/db';
import { LESSON_EDITIONS, type TafsirEditionDefinition } from './editions';
import { fetchSurahTafsir, fetchTafsirAyah } from './tafsirClient';
import type { TafsirAyahRecord } from './types';

/** Bounded in-memory mirror so a language toggle does not touch IndexedDB. */
const MEMORY_LIMIT = 24;
const memory = new Map<string, CachedChapter>();

/**
 * In-flight de-duplication.
 *
 * Two effects that both mount on load — the reader and the neighbour prefetch — would
 * otherwise issue two identical chapter requests. Keyed by cache key, cleared on settle.
 */
const inflight = new Map<string, Promise<CachedChapter>>();

/**
 * Counters for verification.
 *
 * `network` is the number of CDN calls that actually left the browser. It exists so the
 * "no network activity once a chapter is cached" guarantee can be asserted in a test or
 * read off the runtime rather than taken on trust.
 */
const counters = { network: 0, cacheHits: 0, cacheMisses: 0 };

export interface TafsirNetworkStats {
  network: number;
  cacheHits: number;
  cacheMisses: number;
  memoryEntries: number;
}

export function getTafsirNetworkStats(): TafsirNetworkStats {
  return { ...counters, memoryEntries: memory.size };
}

export function resetTafsirNetworkStats(): void {
  counters.network = 0;
  counters.cacheHits = 0;
  counters.cacheMisses = 0;
}

/** A whole chapter of exegesis, normalized to a lookup by ayah number. */
export interface CachedChapter {
  editionSlug: string;
  surah: number;
  /** Ayah number → exegesis text. */
  byAyah: Map<number, string>;
  provenance: 'network' | 'cache';
  cachedAt: number;
}

function chapterKey(slug: string, surah: number): string {
  return `tafsir:${slug}:${surah}`;
}

function rememberInMemory(key: string, chapter: CachedChapter): void {
  if (memory.size >= MEMORY_LIMIT) {
    const oldest = memory.keys().next();
    if (!oldest.done) memory.delete(oldest.value);
  }
  // Re-insert so the most recently used entry is not the first evicted.
  memory.delete(key);
  memory.set(key, chapter);
}

/**
 * Shape + identity check for a cached chapter.
 *
 * Rejects a row whose `data` is not a list of `{ ayah, text }` objects, whose edition slug
 * or sūrah number does not match the key it was stored under, or that carries no usable
 * text at all. Returning it unchecked would show one sūrah's commentary beside another
 * sūrah's verse.
 */
function isCachedChapterFor(
  payload: unknown,
  slug: string,
  surah: number
): payload is { rows: TafsirAyahRecord[] } {
  if (typeof payload !== 'object' || payload === null) return false;
  const candidate = payload as { rows?: unknown; editionSlug?: unknown; surah?: unknown };
  if (candidate.editionSlug !== slug || candidate.surah !== surah) return false;
  if (!Array.isArray(candidate.rows)) return false;

  let usable = 0;
  for (const row of candidate.rows) {
    if (typeof row !== 'object' || row === null) return false;
    const record = row as { ayah?: unknown; text?: unknown };
    if (typeof record.ayah !== 'number' || !Number.isInteger(record.ayah)) return false;
    if (typeof record.text !== 'string') return false;
    if (record.text.trim().length > 0) usable += 1;
  }
  return usable > 0 || candidate.rows.length === 0;
}

function toChapter(
  slug: string,
  surah: number,
  rows: readonly TafsirAyahRecord[],
  provenance: CachedChapter['provenance'],
  cachedAt: number
): CachedChapter {
  const byAyah = new Map<number, string>();
  for (const row of rows) {
    // A row with no ayah number cannot be addressed by the reader, so it is dropped rather
    // than stored under `undefined`.
    if (typeof row.ayah !== 'number') continue;
    if (row.text.trim().length > 0) byAyah.set(row.ayah, row.text);
  }
  return { editionSlug: slug, surah, byAyah, provenance, cachedAt };
}

async function readFromDisk(slug: string, surah: number): Promise<CachedChapter | null> {
  if (typeof window === 'undefined') return null;
  try {
    const row = await db.tafsirCache.get(chapterKey(slug, surah));
    if (!row) return null;
    if (!isCachedChapterFor(row.data, slug, surah)) {
      console.warn(
        `Discarded a cached tafseer entry for ${slug} ${surah} because it does not describe that chapter.`
      );
      await db.tafsirCache.delete(chapterKey(slug, surah));
      return null;
    }
    const stored = row.data as { rows: TafsirAyahRecord[] };
    return toChapter(slug, surah, stored.rows, 'cache', row.cachedAt);
  } catch (error) {
    console.warn('Tafseer cache lookup failed:', error);
    return null;
  }
}

async function writeToDisk(chapter: CachedChapter): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    await db.tafsirCache.put({
      key: chapterKey(chapter.editionSlug, chapter.surah),
      data: {
        editionSlug: chapter.editionSlug,
        surah: chapter.surah,
        rows: [...chapter.byAyah.entries()].map(([ayah, text]) => ({
          surah: chapter.surah,
          ayah,
          text,
        })),
      },
      cachedAt: chapter.cachedAt,
    });
  } catch (error) {
    // A full or unavailable IndexedDB must not break the lesson: the in-memory copy and
    // the network still work, so this degrades to "no persistence" rather than a failure.
    console.warn('Tafseer cache store failed:', error);
  }
}

/**
 * Returns a chapter of exegesis, serving from memory, then IndexedDB, then the network.
 *
 * Concurrent callers for the same chapter share one request.
 */
export async function getChapterTafsir(
  edition: TafsirEditionDefinition,
  surah: number,
  options: { forceNetwork?: boolean } = {}
): Promise<CachedChapter> {
  const key = chapterKey(edition.slug, surah);

  if (options.forceNetwork) {
    counters.cacheMisses += 1;
    counters.network += 1;
    const rows = await fetchSurahTafsir(edition, surah);
    const chapter = toChapter(edition.slug, surah, rows, 'network', Date.now());
    rememberInMemory(key, chapter);
    await writeToDisk(chapter);
    return chapter;
  }

  const inMemory = memory.get(key);
  if (inMemory) {
    counters.cacheHits += 1;
    return inMemory;
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  /*
   * The in-flight slot is claimed **synchronously**, in the same tick as the check above.
   *
   * The obvious implementation — `await readFromDisk(...)`, then decide whether to fetch —
   * leaves an await between the check and the claim. Every caller that arrives while the disk
   * read is pending then sees an empty slot and starts its own request, so the reader and the
   * neighbour prefetch would each pull the same chapter. Registering the promise before the
   * first await makes concurrent callers share one request.
   */
  const pending = (async (): Promise<CachedChapter> => {
    const fromDisk = await readFromDisk(edition.slug, surah);
    if (fromDisk) {
      counters.cacheHits += 1;
      rememberInMemory(key, fromDisk);
      return fromDisk;
    }

    counters.cacheMisses += 1;
    counters.network += 1;
    const rows = await fetchSurahTafsir(edition, surah);
    const chapter = toChapter(edition.slug, surah, rows, 'network', Date.now());
    rememberInMemory(key, chapter);
    await writeToDisk(chapter);
    return chapter;
  })();

  inflight.set(key, pending);
  try {
    return await pending;
  } finally {
    // Only the caller that registered the promise clears the slot, and only once it settles.
    inflight.delete(key);
  }
}

/**
 * Reads one ayah from an edition.
 *
 * For a sparse edition this degrades to a single per-ayah request, which is the only case
 * where one verse costs one request. A `null` entry means upstream has no commentary for
 * that verse — distinct from a failure, which throws.
 */
export async function getAyahTafsir(
  edition: TafsirEditionDefinition,
  surah: number,
  ayah: number
): Promise<{ text: string | null; provenance: 'network' | 'cache' }> {
  if (edition.sparse) {
    // Sparse editions cannot be cached as a chapter: the upstream chapter file is absent
    // entirely for many sūrahs, so "cached absence" would look identical to "not fetched".
    counters.network += 1;
    const record = await fetchTafsirAyah(edition, surah, ayah);
    return { text: record?.text ?? null, provenance: 'network' };
  }

  const chapter = await getChapterTafsir(edition, surah);
  return { text: chapter.byAyah.get(ayah) ?? null, provenance: chapter.provenance };
}

/**
 * Warms the next verses of the sūrah.
 *
 * With chapter-level caching this is effectively free, but it is still called explicitly
 * on every navigation so that the *first* open of a chapter issues one request while the
 * learner is still reading ayah N, and not two requests in sequence as they advance.
 * Failures are swallowed: a prefetch must never surface an error the learner did not ask
 * for.
 */
export async function prefetchUpcomingAyahs(surah: number, ayah: number, versesCount: number): Promise<void> {
  const upcoming = [ayah + 1, ayah + 2].filter((n) => n >= 1 && n <= versesCount);
  if (upcoming.length === 0) return;

  await Promise.all(
    LESSON_EDITIONS.map(async (edition) => {
      if (!edition.sparse) {
        try {
          await getChapterTafsir(edition, surah);
        } catch (error) {
          console.warn(`Tafseer prefetch for ${edition.slug} ${surah} failed:`, error);
        }
        return;
      }
      await Promise.all(
        upcoming.map(async (neighbour) => {
          try {
            await getAyahTafsir(edition, surah, neighbour);
          } catch (error) {
            console.warn(`Sparse tafseer prefetch for ${edition.slug} ${surah}:${neighbour} failed:`, error);
          }
        })
      );
    })
  );
}

/** Drops every cached chapter, in memory and on disk. */
export async function clearTafsirCache(): Promise<void> {
  memory.clear();
  inflight.clear();
  if (typeof window === 'undefined') return;
  try {
    await db.tafsirCache.clear();
  } catch (error) {
    console.warn('Tafseer cache could not be cleared:', error);
  }
}
