import type { QuranWord } from './types';
import { stripTashkeel } from './arabic-text';
import { getReciter } from './reciters';
import { db } from '../db';

/**
 * Word-level timing for ayah recitations.
 *
 * Three sources, in order:
 *
 *  1. **A configured timing source** (`NEXT_PUBLIC_WORD_TIMINGS_URL`), fetched per surah and
 *     reciter and used as-is. The expected JSON shape is documented on `TimingSource`.
 *
 *  2. **Measured timestamps from the Quran.com API** (`?fields=segments`), the alignment the
 *     same recordings ship with. `lib/quran/reciters.ts` records which recitation id matches
 *     which audio file, and the two were verified to be the same file. This is what makes the
 *     word highlight follow the Qari instead of trailing him: the previous proportional
 *     estimate put the first word at the very start of the clip even when the file opens with
 *     half a second of silence (Abdul Basit's 112:1 begins at 500 ms), and it spaced words by
 *     letter count rather than by how long the reciter actually dwells on them.
 *
 *     Two properties of that response are load-bearing, and both were handled wrongly at first:
 *     the numbers are sometimes serialised as strings (every segment of Sudais is), and about 1%
 *     of ayahs have an alignment that omits a word. Neither may throw the whole ayah back to the
 *     estimate — that is exactly the lag the alignment exists to remove. See
 *     `alignSegmentsToWords` for what is done instead.
 *
 *  3. **Proportional estimate.** Without measured data the ayah's duration is split across
 *     its words in proportion to their letter count. This is an estimate and the UI labels it
 *     as one; it is still far more useful for following along than no highlight at all.
 *
 * Measured timings are cached (memory + IndexedDB) because the text and the audio they describe
 * are immutable, and they are read per surah rather than per ayah.
 */

/** `[wordIndex (1-based), startMs, endMs]`, as the Quran Foundation API returns segments. */
export type WordSegment = [number, number, number];

export interface TimingSource {
  /** Keyed by `surah:ayah`. */
  [verseKey: string]: WordSegment[];
}

const QURAN_COM_API = 'https://api.quran.com/api/v4';
/** The longest surah is 286 ayahs, so one page covers any chapter in a single request. */
const TIMINGS_PAGE_SIZE = 300;
const TIMINGS_FETCH_TIMEOUT_MS = 8_000;
/** Scripture and its alignment are immutable; a month is a conservative revalidation window. */
const TIMINGS_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const TIMINGS_CACHE_PREFIX = 'word-timings';

const timingCache = new Map<string, Promise<TimingSource | null>>();

function configuredTimingsUrl(reciterId: string, surah: number): string | null {
  const base = process.env.NEXT_PUBLIC_WORD_TIMINGS_URL?.trim();
  if (!base) return null;
  return `${base.replace(/\/$/, '')}/${encodeURIComponent(reciterId)}/${surah}.json`;
}

function isTimingSource(payload: unknown): payload is TimingSource {
  if (typeof payload !== 'object' || payload === null) return false;
  return Object.values(payload as Record<string, unknown>).every(
    (segments) =>
      Array.isArray(segments) &&
      segments.every(
        (segment) =>
          Array.isArray(segment) && segment.length === 3 && segment.every((n) => typeof n === 'number')
      )
  );
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMINGS_FETCH_TIMEOUT_MS) });
  if (!response.ok) return null;
  return response.json();
}

/**
 * Measured timings for a surah, or null when no source is configured, reachable or known for
 * this reciter. Cached per `reciter:surah` so switching ayahs does not re-request the chapter.
 */
export function loadMeasuredTimings(reciterId: string, surah: number): Promise<TimingSource | null> {
  const key = `${reciterId}:${surah}`;
  const cached = timingCache.get(key);
  if (cached) return cached;

  const request = resolveTimings(reciterId, surah).catch(() => null);
  timingCache.set(key, request);
  return request;
}

async function resolveTimings(reciterId: string, surah: number): Promise<TimingSource | null> {
  const configured = configuredTimingsUrl(reciterId, surah);
  if (configured) {
    const payload = await fetchJson(configured);
    if (isTimingSource(payload)) return payload;
  }

  const recitationId = getReciter(reciterId)?.recitationId;
  if (recitationId === undefined) return null;

  const stored = await readStoredTimings(recitationId, surah);
  if (stored) return stored;

  const fetched = await fetchQuranComTimings(recitationId, surah);
  if (fetched) await storeTimings(recitationId, surah, fetched);
  return fetched;
}

/** One entry of the Quran.com `by_chapter` response, narrowed to the fields used here. */
interface QuranComAudioFile {
  verse_key?: unknown;
  segments?: unknown;
}

/**
 * A number the API may have serialised as a JSON string.
 *
 * Most recitations return `[0, 1, 30, 390]`, but several — Sudais, and Abdul Basit's Mujawwad
 * edition — return `["0", "1", "100", "500"]`. Accepting only real `number`s silently discarded
 * every segment of those recitations, so their word highlight fell back to the estimate across the
 * whole Mushaf while the alignment describing their exact recording sat unused in the response.
 */
function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Fetches the measured word timings Quran.com publishes for a recitation.
 *
 * Each segment arrives as `[segment index, word index (1-based), start ms, end ms]`, timed
 * against that ayah's own audio file — the same file the player loads. Ayahs without segments
 * are simply absent from the result, and the caller falls back to the estimate for them.
 */
async function fetchQuranComTimings(recitationId: number, surah: number): Promise<TimingSource | null> {
  const payload = await fetchJson(
    `${QURAN_COM_API}/recitations/${recitationId}/by_chapter/${surah}?per_page=${TIMINGS_PAGE_SIZE}&fields=segments`
  );
  if (typeof payload !== 'object' || payload === null) return null;

  const files = (payload as { audio_files?: unknown }).audio_files;
  if (!Array.isArray(files)) return null;

  const source: TimingSource = {};
  for (const file of files as QuranComAudioFile[]) {
    const verseKey = file?.verse_key;
    if (typeof verseKey !== 'string') continue;
    const words = parseSegments(file?.segments);
    if (words.length > 0) source[verseKey] = words;
  }

  return Object.keys(source).length > 0 ? source : null;
}

/**
 * One ayah's segment array, read as `WordSegment`s.
 *
 * Exported because it is the one place that knows what the alignment's numbers may look like —
 * including the string-serialised variant `toFiniteNumber` accepts — and `scripts/verify-reciter-timings.ts`
 * checks that against the live API for every reciter that ships timings.
 */
export function parseSegments(segments: unknown): WordSegment[] {
  if (!Array.isArray(segments)) return [];

  const words: WordSegment[] = [];
  for (const segment of segments) {
    if (!Array.isArray(segment) || segment.length < 4) continue;
    const wordIndex = toFiniteNumber(segment[1]);
    const start = toFiniteNumber(segment[2]);
    const end = toFiniteNumber(segment[3]);
    if (wordIndex === null || start === null || end === null) continue;
    // A zero-length or inverted span carries no timing; the word is treated as omitted, and
    // `alignSegmentsToWords` gives it the interval between its neighbours.
    if (end <= start) continue;
    words.push([wordIndex, Math.round(start), Math.round(end)]);
  }

  return words.sort((a, b) => a[0] - b[0]);
}

function timingsCacheKey(recitationId: number, surah: number): string {
  return `${TIMINGS_CACHE_PREFIX}:${recitationId}:${surah}`;
}

async function readStoredTimings(recitationId: number, surah: number): Promise<TimingSource | null> {
  if (typeof window === 'undefined') return null;
  try {
    const row = await db.quranCache.get(timingsCacheKey(recitationId, surah));
    if (!row || Date.now() - row.cachedAt > TIMINGS_CACHE_TTL_MS) return null;
    // The row is read back as `unknown`: it may have been written by an older version.
    return isTimingSource(row.data) ? row.data : null;
  } catch (error) {
    console.warn('Word timing cache lookup failed:', error);
    return null;
  }
}

async function storeTimings(recitationId: number, surah: number, source: TimingSource): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    await db.quranCache.put({
      key: timingsCacheKey(recitationId, surah),
      data: source,
      cachedAt: Date.now(),
    });
  } catch (error) {
    console.warn('Word timing cache store failed:', error);
  }
}

/**
 * Measured timings expanded to cover exactly the words the reader renders, or `null` when the
 * alignment cannot be trusted.
 *
 * The timings come from a different tokenisation of the ayah than the one that builds the
 * `QuranWord` list, so the two can disagree — and a disagreement that is waved through would
 * highlight the wrong word for the rest of the ayah. This is therefore the gate, and it is strict
 * about the things that would mean misalignment:
 *
 *  - an index that addresses no word of this ayah (the tokenisations differ by a token, so every
 *    index after the divergence would be off by one),
 *  - a repeated index, or spans that overlap once sorted.
 *
 * A missing index is *not* one of those. About 1% of ayahs have an alignment that omits a word
 * (the aligner merged it into a neighbour — Hani ar-Rifai's 1:1 has no segment for "بِسْمِ"), and
 * rejecting the whole ayah for it meant falling back to the letter-count estimate, which lags
 * behind the recitation. The words the alignment *does* cover keep their measured span exactly;
 * the omitted ones are given the interval in which they must have been recited:
 *
 *  - between two known spans: the time from the previous span's end to the next span's start;
 *  - before the first known span: an even share of the clip's opening silence;
 *  - after the last: an average-length span apiece (bounded by the clip, which the player knows).
 *
 * A word that lands on a zero-length interval simply never highlights, which is honest: nothing in
 * the alignment says when it sounded.
 */
export function alignSegmentsToWords(
  segments: readonly WordSegment[],
  wordCount: number
): WordSegment[] | null {
  if (wordCount <= 0 || segments.length === 0) return null;

  const byIndex = new Map<number, WordSegment>();
  for (const segment of segments) {
    const [wordIndex, start, end] = segment;
    if (!Number.isInteger(wordIndex) || wordIndex < 1 || wordIndex > wordCount) return null;
    if (byIndex.has(wordIndex)) return null;
    // A span that says nothing about when the word sounded (`[6, 6180, 6180]` is Alafasy's 18:42
    // word 7) is treated as an omission and filled in below, rather than handed to the highlighter
    // as an invisible word.
    if (end <= start) continue;
    byIndex.set(wordIndex, segment);
  }

  // Every span was zero-length or dropped: there is nothing measured to follow.
  if (byIndex.size === 0) return null;

  const known = [...byIndex.values()].sort((a, b) => a[0] - b[0]);
  for (let index = 1; index < known.length; index += 1) {
    if (known[index][1] < known[index - 1][2]) return null;
  }

  const averageSpan =
    known.reduce((total, [, start, end]) => total + (end - start), 0) / known.length;

  const aligned: WordSegment[] = [];
  let cursor = 1;

  for (const [wordIndex, start, end] of known) {
    if (wordIndex > cursor) {
      const gapStart = aligned.length > 0 ? aligned[aligned.length - 1][2] : 0;
      aligned.push(...distribute(cursor, wordIndex - 1, gapStart, Math.max(gapStart, start)));
    }
    aligned.push([wordIndex, start, end]);
    cursor = wordIndex + 1;
  }

  if (cursor <= wordCount) {
    const tailStart = known[known.length - 1][2];
    aligned.push(...distribute(cursor, wordCount, tailStart, tailStart + averageSpan * (wordCount - cursor + 1)));
  }

  return aligned;
}

/** Splits `[start, end)` evenly across the word indexes `first..last`, inclusive. */
function distribute(
  first: number,
  last: number,
  start: number,
  end: number
): WordSegment[] {
  const count = last - first + 1;
  const step = end > start ? (end - start) / count : 0;
  return Array.from({ length: count }, (_, offset) => {
    const from = Math.round(start + step * offset);
    const to = Math.round(start + step * (offset + 1));
    return [first + offset, from, to];
  });
}

/** Weight of a word for the proportional estimate: letters only, with a floor per word. */
function wordWeight(word: QuranWord): number {
  const letters = stripTashkeel(word.arabic).replace(/\s/g, '').length;
  return Math.max(1.5, letters);
}

/**
 * Estimated segments for an ayah of `durationMs`, allocating time by letter count. The
 * first and last 3% are treated as lead-in and tail silence.
 */
export function estimateSegments(words: readonly QuranWord[], durationMs: number): WordSegment[] {
  if (words.length === 0 || !Number.isFinite(durationMs) || durationMs <= 0) return [];
  const lead = durationMs * 0.03;
  const usable = durationMs - lead * 2;
  const weights = words.map(wordWeight);
  const total = weights.reduce((sum, weight) => sum + weight, 0);

  let cursor = lead;
  return words.map((word, index) => {
    const span = (weights[index] / total) * usable;
    const start = cursor;
    cursor += span;
    return [word.wordIndex, Math.round(start), Math.round(cursor)];
  });
}

/** The 1-based word index active at `positionMs`, or null outside every segment. */
export function activeWordAt(segments: readonly WordSegment[], positionMs: number): number | null {
  for (const [wordIndex, start, end] of segments) {
    if (positionMs >= start && positionMs < end) return wordIndex;
  }
  return null;
}
