import type { QuranWord } from './types';
import { stripTashkeel } from './arabic-text';

/**
 * Word-level timing for ayah recitations.
 *
 * Two sources, in order:
 *
 *  1. **Measured timestamps** from an aligned dataset (the Quran Foundation audio API with
 *     `segments=true`, or the open `quran-align` word timestamps). When one is configured
 *     via `NEXT_PUBLIC_WORD_TIMINGS_URL`, it is fetched per surah and reciter, cached in
 *     memory, and used as-is. The expected JSON shape is documented on `TimingSource`.
 *
 *  2. **Proportional estimate.** Without measured data the ayah's duration is split across
 *     its words in proportion to their letter count. This is an estimate and the UI labels
 *     it as one; it is still far more useful for following along than no highlight at all.
 */

/** `[wordIndex (1-based), startMs, endMs]`, as the Quran Foundation API returns segments. */
export type WordSegment = [number, number, number];

export interface TimingSource {
  /** Keyed by `surah:ayah`. */
  [verseKey: string]: WordSegment[];
}

const timingCache = new Map<string, Promise<TimingSource | null>>();

function timingsUrl(reciterId: string, surah: number): string | null {
  const base = process.env.NEXT_PUBLIC_WORD_TIMINGS_URL?.trim();
  if (!base) return null;
  return `${base.replace(/\/$/, '')}/${encodeURIComponent(reciterId)}/${surah}.json`;
}

/** Loads measured timings for a surah, or null when no source is configured/reachable. */
export function loadMeasuredTimings(reciterId: string, surah: number): Promise<TimingSource | null> {
  const url = timingsUrl(reciterId, surah);
  if (!url) return Promise.resolve(null);
  const key = `${reciterId}:${surah}`;
  const cached = timingCache.get(key);
  if (cached) return cached;

  const request = fetch(url, { signal: AbortSignal.timeout(6_000) })
    .then(async (response) => {
      if (!response.ok) return null;
      const payload: unknown = await response.json();
      return isTimingSource(payload) ? payload : null;
    })
    .catch(() => null);
  timingCache.set(key, request);
  return request;
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
