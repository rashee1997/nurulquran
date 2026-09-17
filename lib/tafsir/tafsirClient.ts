/**
 * Tafseer lesson module — typed CDN client.
 *
 * Design notes, each driven by a verified property of the upstream CDN:
 *
 *  - **One request per chapter, not per verse.** `/tafsir/{slug}/{surah}.json` returns the
 *    whole sūrah (159 KiB for Tamil Sūrah 2), so fetching a single ayah issues one request
 *    per *chapter* and N+2 prefetching becomes free. `fetchSurahTafsir` is therefore the
 *    primary entry point and `fetchTafsirAyah` is the sparse-commentary case.
 *
 *  - **Two payload shapes.** Most editions return a top-level array; `en-al-jalalayn`
 *    returns `{ ayahs: [...] }`. `surahTafsirPayloadSchema` accepts both.
 *
 *  - **404 is data, not failure.** A missing ayah file (or a whole sūrah in the sparse
 *    Asbab al-Nuzul edition) answers `404` with an empty body. That is a definitive
 *    "upstream has no entry" and is reported as `null`. Anything else — timeout, 5xx,
 *    unparsable body, or a request that fails on every CDN tier — throws
 *    `TafsirUnavailableError` so the UI can offer a retry instead of silently rendering
 *    an empty exegesis as though the verse had no commentary.
 */

import { parseWithSchema } from '@/lib/api/schemas';
import {
  TAFSIR_CDN_BASES,
  ayahTafsirUrl,
  editionsIndexUrl,
  surahTafsirUrl,
  type TafsirEditionDefinition,
} from './editions';
import {
  surahTafsirPayloadSchema,
  tafsirAyahRecordSchema,
  tafsirEditionIndexSchema,
  type TafsirAyahRecord,
  type TafsirEdition,
} from './types';

const FETCH_TIMEOUT_MS = 9_000;
/** Attempts *per* CDN tier before moving to the next one. */
const ATTEMPTS_PER_TIER = 2;
/** Exegesis is immutable upstream, so a long server-side revalidation window is safe. */
const TAFSIR_REVALIDATE_SECONDS = 60 * 60 * 24 * 30;

/** Raised when no CDN tier could serve the request. Never raised for a 404. */
export class TafsirUnavailableError extends Error {
  readonly slug: string;
  readonly surah: number;
  readonly ayah?: number;

  constructor(slug: string, surah: number, ayah: number | undefined, cause?: unknown) {
    const reference = typeof ayah === 'number' ? `${surah}:${ayah}` : `Surah ${surah}`;
    super(
      `Tafseer for ${reference} (${slug}) could not be retrieved from any CDN, or the response was not a usable payload.`
    );
    this.name = 'TafsirUnavailableError';
    this.slug = slug;
    this.surah = surah;
    this.ayah = ayah;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

type GuardedInit = RequestInit & { next?: { revalidate: number } };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Outcome of a single-tier attempt. `missing` is a definitive upstream 404. */
type ProbeResult<T> = { kind: 'ok'; value: T } | { kind: 'missing' } | { kind: 'failed' };

/**
 * Fetches one URL and hands the decoded JSON to `parse`.
 *
 * JSON decoding happens here, once, so a parser never has to parse text itself. `parse`
 * returns `null` for a payload that is valid JSON but not a usable shape, which is treated as
 * a soft failure: the tier is retried and then skipped rather than surfacing a half-empty
 * lesson.
 */
async function probeTier<T>(
  url: string,
  parse: (raw: unknown) => T | null
): Promise<ProbeResult<T>> {
  for (let attempt = 1; attempt <= ATTEMPTS_PER_TIER; attempt += 1) {
    try {
      const init: GuardedInit = {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        next: { revalidate: TAFSIR_REVALIDATE_SECONDS },
      };
      const response = await fetch(url, init);

      // The file paths are identical on every tier, so a 404 is authoritative upstream
      // data: the edition genuinely has no entry here. Stop and report it.
      if (response.status === 404) return { kind: 'missing' };
      if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);

      const body = await response.text();
      if (body.trim().length === 0) return { kind: 'missing' };

      let raw: unknown;
      try {
        raw = JSON.parse(body);
      } catch {
        throw new Error(`Response from ${url} was not valid JSON.`);
      }

      const parsed = parse(raw);
      if (parsed === null) {
        console.warn(`Tafseer payload from ${url} did not match any known schema.`);
        throw new Error('unexpected payload shape');
      }
      return { kind: 'ok', value: parsed };
    } catch (error) {
      if (attempt < ATTEMPTS_PER_TIER) {
        await delay(200 * 2 ** (attempt - 1));
      } else {
        console.warn(`Tafseer CDN tier failed for ${url}:`, error);
      }
    }
  }
  return { kind: 'failed' };
}

/** Walks every CDN tier, returning the first usable answer. */
async function fetchAcrossTiers<T>(
  buildUrl: (cdnBase: string) => string,
  parse: (raw: unknown) => T | null,
  onExhausted: (cause: unknown) => never
): Promise<T | null> {
  let lastFailure: unknown;
  for (const cdnBase of TAFSIR_CDN_BASES) {
    const result = await probeTier(buildUrl(cdnBase), parse);
    if (result.kind === 'ok') return result.value;
    if (result.kind === 'missing') return null;
    lastFailure = new Error(`All attempts failed for ${cdnBase}`);
  }
  return onExhausted(lastFailure);
}

function normalizeSurahPayload(raw: unknown): TafsirAyahRecord[] | null {
  const parsed = parseWithSchema(surahTafsirPayloadSchema, raw);
  if (!parsed.ok) return null;

  const rows = Array.isArray(parsed.data) ? parsed.data : parsed.data.ayahs;
  return rows.map((row, index) => ({
    // Some editions omit `surah`; position in the chapter file is the only other signal,
    // and it is only trusted for the sūrah field, never for the ayah number.
    surah: row.surah ?? 0,
    ayah: row.ayah ?? index + 1,
    text: row.text,
  }));
}

/**
 * Reads the global edition index (122 editions, 28 KB).
 *
 * The lesson module itself uses the hard-coded, verified slugs in `editions.ts`, so a renamed
 * upstream slug cannot silently change which commentary a child is taught. This exists as the
 * way to check that those slugs are still present upstream — the one failure mode the
 * hard-coded catalogue would otherwise hide.
 */
export async function fetchEditionsIndex(): Promise<TafsirEdition[]> {
  return fetchAcrossTiers(
    editionsIndexUrl,
    (raw) => {
      const parsed = parseWithSchema(tafsirEditionIndexSchema, raw);
      return parsed.ok ? parsed.data : null;
    },
    (cause) => {
      throw new TafsirUnavailableError('editions-index', 0, undefined, cause);
    }
  ) as Promise<TafsirEdition[]>;
}

/**
 * Fetches every ayah's exegesis for one sūrah in a single request per edition.
 * Throws `TafsirUnavailableError` when no tier can serve the chapter.
 */
export async function fetchSurahTafsir(
  edition: TafsirEditionDefinition,
  surah: number
): Promise<TafsirAyahRecord[]> {
  const rows = await fetchAcrossTiers(
    (cdnBase) => surahTafsirUrl(cdnBase, edition.slug, surah),
    normalizeSurahPayload,
    () => {
      throw new TafsirUnavailableError(edition.slug, surah, undefined);
    }
  );

  // A definitive 404 for a whole chapter is only legitimate for a sparse edition.
  if (rows === null) {
    if (edition.sparse) return [];
    throw new TafsirUnavailableError(edition.slug, surah, undefined);
  }
  return rows;
}

/**
 * Fetches one ayah.
 *
 * Returns `null` — not an error — when the edition has no entry for that verse, which is
 * the normal case for the sparse occasion-of-revelation edition.
 */
export async function fetchTafsirAyah(
  edition: TafsirEditionDefinition,
  surah: number,
  ayah: number
): Promise<TafsirAyahRecord | null> {
  return fetchAcrossTiers(
    (cdnBase) => ayahTafsirUrl(cdnBase, edition.slug, surah, ayah),
    (raw) => {
      // `surah`/`ayah` are optional in the schema: not every edition echoes them back.
      const parsed = parseWithSchema(tafsirAyahRecordSchema, raw);
      if (!parsed.ok || parsed.data.text.trim().length === 0) return null;
      return {
        // The caller already knows the verse it asked for, so the request path wins over
        // an echoed body. A response describing a different verse cannot be relabelled.
        surah,
        ayah,
        text: parsed.data.text,
      };
    },
    (cause) => {
      throw new TafsirUnavailableError(edition.slug, surah, ayah, cause);
    }
  );
}
