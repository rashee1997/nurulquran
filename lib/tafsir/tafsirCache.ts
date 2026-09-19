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
import { ASBAB_EDITION, LESSON_EDITIONS, type TafsirEditionDefinition } from './editions';
import { fetchSurahTafsir, fetchTafsirAyah } from './tafsirClient';
import type { TafsirAyahRecord } from './types';

/** Bounded in-memory mirror so a language toggle does not touch IndexedDB. */
const MEMORY_LIMIT = 24;
const memory = new Map<string, CachedChapter>();

/**
 * Sparse-edition ayah cache.
 *
 * The chapter files do not cover sparse editions — whole sūrahs 404 and others carry only the
 * verses that have an entry — so `getAyahTafsir` issued one request per ayah and **never stored
 * the result**. Reading the occasion-of-revelation panel therefore cost a fresh round trip every
 * time it was opened, and `prefetchUpcomingAyahs`, which fetches the next two ayahs on every
 * navigation, was pure waste: the answer it paid for was discarded. A negative result is cached
 * too, because "this verse has no recorded occasion" is upstream data worth remembering.
 */
const AYAH_MEMORY_LIMIT = 64;
const ayahMemory = new Map<string, string | null>();
const ayahInflight = new Map<string, Promise<{ text: string | null; provenance: 'network' | 'cache' }>>();

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
  return { ...counters, memoryEntries: memory.size + ayahMemory.size };
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
  if (!memory.has(key) && memory.size >= MEMORY_LIMIT) {
    const oldest = memory.keys().next();
    if (!oldest.done) memory.delete(oldest.value);
  }
  // Re-insert so the most recently used entry is not the first evicted.
  memory.delete(key);
  memory.set(key, chapter);
}

/**
 * Moves an already-cached entry to the most-recent end of the map.
 *
 * Without this, insertion order was FIFO rather than LRU: a chapter the learner reads constantly
 * kept its original position and was evicted before a chapter touched once and never reopened,
 * which is the opposite of what the bound is for. Re-inserting on read is what makes the eviction
 * order actually mean "least recently used".
 */
function touchInMemory(key: string, chapter: CachedChapter): void {
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
    touchInMemory(key, inMemory);
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

function ayahKey(slug: string, surah: number, ayah: number): string {
  return `tafsirAyah:${slug}:${surah}:${ayah}`;
}

/**
 * Shape + identity check for a cached ayah row.
 *
 * Same rule as the chapter cache: the row must name the edition and verse it was stored under,
 * and a `null` text is legitimate cached data (upstream has no entry) rather than a miss.
 */
function isCachedAyahFor(
  payload: unknown,
  slug: string,
  surah: number,
  ayah: number
): payload is { text: string | null } {
  if (typeof payload !== 'object' || payload === null) return false;
  const candidate = payload as { slug?: unknown; surah?: unknown; ayah?: unknown; text?: unknown };
  if (candidate.slug !== slug || candidate.surah !== surah || candidate.ayah !== ayah) return false;
  return candidate.text === null || typeof candidate.text === 'string';
}

function rememberAyahInMemory(key: string, text: string | null): void {
  if (!ayahMemory.has(key) && ayahMemory.size >= AYAH_MEMORY_LIMIT) {
    const oldest = ayahMemory.keys().next();
    if (!oldest.done) ayahMemory.delete(oldest.value);
  }
  ayahMemory.delete(key);
  ayahMemory.set(key, text);
}

async function readAyahFromDisk(
  slug: string,
  surah: number,
  ayah: number
): Promise<string | null | undefined> {
  if (typeof window === 'undefined') return undefined;
  try {
    const row = await db.tafsirCache.get(ayahKey(slug, surah, ayah));
    if (!row) return undefined;
    if (!isCachedAyahFor(row.data, slug, surah, ayah)) {
      await db.tafsirCache.delete(ayahKey(slug, surah, ayah));
      return undefined;
    }
    return row.data.text;
  } catch (error) {
    console.warn('Sparse tafseer cache lookup failed:', error);
    return undefined;
  }
}

async function writeAyahToDisk(slug: string, surah: number, ayah: number, text: string | null): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    await db.tafsirCache.put({
      key: ayahKey(slug, surah, ayah),
      data: { slug, surah, ayah, text },
      cachedAt: Date.now(),
    });
  } catch (error) {
    console.warn('Sparse tafseer cache store failed:', error);
  }
}

/**
 * Reads one ayah from an edition.
 *
 * For a sparse edition this is a per-ayah read, cache-first, deduplicated in flight, and with a
 * negative result cached as well — which is what makes both the occasion-of-revelation panel and
 * the neighbour prefetch cheap on every visit after the first. A `null` text means upstream has no
 * commentary for that verse, distinct from a failure, which throws.
 */
export async function getAyahTafsir(
  edition: TafsirEditionDefinition,
  surah: number,
  ayah: number
): Promise<{ text: string | null; provenance: 'network' | 'cache' }> {
  if (edition.sparse) {
    const key = ayahKey(edition.slug, surah, ayah);

    if (ayahMemory.has(key)) {
      counters.cacheHits += 1;
      const cached = ayahMemory.get(key) ?? null;
      // Re-inserted so eviction is least-*recently*-used, matching the chapter map. Without this
      // the ayah a learner keeps reopening held its original position and was evicted before one
      // touched once and never revisited — the opposite of what the bound is for.
      rememberAyahInMemory(key, cached);
      return { text: cached, provenance: 'cache' };
    }

    const existing = ayahInflight.get(key);
    if (existing) return existing;

    const pending = (async (): Promise<{ text: string | null; provenance: 'network' | 'cache' }> => {
      const fromDisk = await readAyahFromDisk(edition.slug, surah, ayah);
      if (fromDisk !== undefined) {
        counters.cacheHits += 1;
        rememberAyahInMemory(key, fromDisk);
        return { text: fromDisk, provenance: 'cache' };
      }

      counters.cacheMisses += 1;
      counters.network += 1;
      const record = await fetchTafsirAyah(edition, surah, ayah);
      const text = record?.text ?? null;
      rememberAyahInMemory(key, text);
      await writeAyahToDisk(edition.slug, surah, ayah, text);
      return { text, provenance: 'network' };
    })();

    ayahInflight.set(key, pending);
    try {
      return await pending;
    } finally {
      ayahInflight.delete(key);
    }
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
 *
 * The sparse occasion-of-revelation edition is included deliberately: it is the *only* edition
 * with no chapter file, so it is the only one that genuinely needs a request per verse, and it
 * was previously left out of this loop (the sparse branch below was unreachable, since
 * `LESSON_EDITIONS` holds just the two abridged chapter editions). Every ayah change therefore
 * paid a per-ayah asbab round trip that this function exists to absorb.
 *
 * Failures are swallowed: a prefetch must never surface an error the learner did not ask for.
 */
export async function prefetchUpcomingAyahs(surah: number, ayah: number, versesCount: number): Promise<void> {
  const upcoming = [ayah + 1, ayah + 2].filter((n) => n >= 1 && n <= versesCount);
  if (upcoming.length === 0) return;

  await Promise.all(
    [...LESSON_EDITIONS, ASBAB_EDITION].map(async (edition) => {
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

/** Drops every cached chapter and ayah, in memory and on disk. */
export async function clearTafsirCache(): Promise<void> {
  memory.clear();
  inflight.clear();
  ayahMemory.clear();
  ayahInflight.clear();
  if (typeof window === 'undefined') return;
  try {
    await db.tafsirCache.clear();
  } catch (error) {
    console.warn('Tafseer cache could not be cleared:', error);
  }
}
