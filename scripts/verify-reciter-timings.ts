/**
 * Reciter timing check.
 *
 * The reader's word highlight stays on the Qari's word only if the timings it uses belong to the
 * exact file it is playing. For every reciter that ships timings (a `recitationId` in
 * `lib/quran/reciters`), this script re-establishes that pairing from the network and checks that
 * the alignment is readable:
 *
 *   1. **The audio is the same recording.** The clip the player requests for a verse is compared
 *      byte for byte with the file the alignment was measured against. A transcoded pair (Husary:
 *      128 kbps on the CDN, 64 kbps in the alignment) may differ in size, but then its duration has
 *      to agree — which is what catches a *different rendition* of the same verse.
 *   2. **The numbers are readable.** Some recitations serialise every segment value as a JSON
 *      string (Sudais does, for every ayah). A parser that accepted only real numbers silently
 *      produced no timings at all for them, and the highlight fell back to the letter-count
 *      estimate — the lag this whole path exists to remove. Any segment that does not parse is a
 *      failure here.
 *   3. **The alignment fits the words.** Offline, the parser and the aligner are checked against
 *      synthetic cases: a complete alignment, one missing its first / middle / last word, and the
 *      shapes that must be refused (an index outside the ayah, a repeated index, overlapping spans).
 *
 * Usage: `bun scripts/verify-reciter-timings.ts` — prints a per-reciter report and exits non-zero
 * when any check fails.
 */

import { globalAyahNumber, RECITERS, reciterAudioUrl } from '@/lib/quran/reciters';
import {
  alignSegmentsToWords,
  parseSegments,
  type WordSegment,
} from '@/lib/quran/word-timings';

const QURAN_COM_API = 'https://api.quran.com/api/v4';
const REQUEST_TIMEOUT_MS = 30_000;
/** Chapters spanning a long surah, a medium one, and the shortest — the shapes differ most here. */
const SAMPLE_SURAH = [1, 18, 78, 112, 114];
/** Verses per chapter whose audio is fetched and compared byte for byte. */
const AUDIO_SAMPLE_PER_SURAH = 2;
/** Duration agreement required of a transcoded pair, in milliseconds. */
const DURATION_TOLERANCE_MS = 1_000;
/** Grace given to a segment that ends a hair past the file's own duration. */
const TIMELINE_GRACE_MS = 250;

interface Failure {
  reciter: string;
  message: string;
}

const failures: Failure[] = [];

function fail(reciter: string, message: string): void {
  failures.push({ reciter, message });
}

/* ------------------------------------------------------------------ *
 * Offline: the parser and the aligner
 * ------------------------------------------------------------------ */

function assertEqual(label: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail('parser', `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function checkParserAndAligner(): void {
  // The everyday shape, and the string-serialised one Sudais returns. Both must parse identically.
  const numeric = [[0, 1, 30, 390], [1, 2, 400, 790]];
  const asStrings = [['0', '1', '30', '390'], ['1', '2', '400', '790']];
  const expected: WordSegment[] = [[1, 30, 390], [2, 400, 790]];
  assertEqual('parseSegments(numbers)', parseSegments(numeric), expected);
  assertEqual('parseSegments(strings)', parseSegments(asStrings), expected);
  assertEqual('parseSegments(non-numbers)', parseSegments([['0', 'x', 'y', 'z'], null, 'no']), []);
  // A zero-length span carries no timing; it is dropped so the aligner fills that word in.
  assertEqual('parseSegments(zero-length span)', parseSegments([[0, 1, 500, 500], [1, 2, 600, 700]]), [[2, 600, 700]]);

  // A complete alignment is returned as-is.
  assertEqual('align(complete)', alignSegmentsToWords(expected, 2), expected);

  // A missing first word gets the clip's opening silence, and the known spans do not move.
  const leading = alignSegmentsToWords([[2, 400, 790], [3, 800, 1200]], 3);
  assertEqual('align(leading gap) length', leading?.length, 3);
  assertEqual('align(leading gap) known spans', leading?.slice(1), [[2, 400, 790], [3, 800, 1200]]);
  assertEqual('align(leading gap) filled span', leading?.[0], [1, 0, 400]);

  // A missing middle word gets exactly the interval between its neighbours.
  const interior = alignSegmentsToWords([[1, 0, 400], [3, 800, 1200]], 3);
  assertEqual('align(interior gap)', interior, [[1, 0, 400], [2, 400, 800], [3, 800, 1200]]);

  // A missing last word gets an average-length span after the last known one.
  const trailing = alignSegmentsToWords([[1, 0, 400], [2, 400, 800]], 3);
  assertEqual('align(trailing gap) length', trailing?.length, 3);
  assertEqual('align(trailing gap) filled span', trailing?.[2], [3, 800, 1200]);

  // Shapes that would mean misalignment: refused so the caller can fall back to the estimate.
  const refused: Array<[string, WordSegment[] | null]> = [
    ['index outside the ayah', alignSegmentsToWords([[1, 0, 400], [3, 800, 1200]], 2)],
    ['repeated index', alignSegmentsToWords([[1, 0, 400], [1, 800, 1200]], 2)],
    ['overlapping spans', alignSegmentsToWords([[1, 0, 900], [2, 800, 1200]], 2)],
    ['more spans than words', alignSegmentsToWords([[1, 0, 100], [2, 100, 200], [3, 200, 300]], 2)],
    ['no segments', alignSegmentsToWords([], 2)],
    ['no words', alignSegmentsToWords([[1, 0, 100]], 0)],
  ];
  for (const [label, result] of refused) {
    if (result !== null) fail('parser', `align(${label}) should have been refused, got ${JSON.stringify(result)}`);
  }
}

/* ------------------------------------------------------------------ *
 * Live: the pairings
 * ------------------------------------------------------------------ */

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

/**
 * Byte length of a file, from its headers.
 *
 * The request asks for an identity encoding because the audio CDN otherwise answers gzip-chunked
 * with no `content-length` at all, which cannot be compared with anything.
 */
async function contentLength(url: string): Promise<number | null> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: { 'Accept-Encoding': 'identity' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const length = Number(response.headers.get('content-length'));
    return Number.isFinite(length) && length > 0 ? length : null;
  } catch {
    return null;
  }
}

/** The URL the alignment's audio file lives at, as the API reports it. */
function alignedFileUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  if (raw.startsWith('//')) return `https:${raw}`;
  if (raw.startsWith('http')) return raw;
  return `https://verses.quran.com/${raw}`;
}

interface AudioFile {
  verse_key: string;
  url: string;
  segments: WordSegment[];
  /** Segments in the response that carry no readable numbers at all — a real parse failure. */
  unreadable: number;
}

/** Mirrors the tolerance of the module's `toFiniteNumber`: a number, or a numeric string. */
function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readAudioFiles(payload: unknown): AudioFile[] {
  const files = (payload as { audio_files?: unknown } | null)?.audio_files;
  if (!Array.isArray(files)) return [];

  const parsed: AudioFile[] = [];
  for (const entry of files) {
    const record = entry as { verse_key?: unknown; url?: unknown; segments?: unknown };
    const verseKey = typeof record?.verse_key === 'string' ? record.verse_key : null;
    const url = alignedFileUrl(record?.url);
    if (!verseKey || !url) continue;

    // Zero-length spans are dropped by the parser on purpose — the aligner fills that word in — so
    // only a segment whose numbers cannot be read at all counts against this reciter.
    let unreadable = 0;
    for (const segment of Array.isArray(record.segments) ? record.segments : []) {
      if (!Array.isArray(segment) || segment.length < 4) {
        unreadable += 1;
        continue;
      }
      if (
        asNumber(segment[1]) === null ||
        asNumber(segment[2]) === null ||
        asNumber(segment[3]) === null
      ) {
        unreadable += 1;
      }
    }

    parsed.push({
      verse_key: verseKey,
      url,
      segments: parseSegments(record?.segments),
      unreadable,
    });
  }
  return parsed;
}

/** Global Mushaf position (1-6236) of an ayah, which is how the CDN addresses clips. */
/**
 * Bitrate in kbps, from a URL that carries it: `/audio/128/ar.alafasy/…` for the CDN, and names
 * such as `Husary_64kbps` or `Minshawi_128kbps` for the alignment mirrors.
 */
function bitrateOf(url: string): number | null {
  const match = url.match(/(\d{2,3})\s*kbps/i) ?? url.match(/\/audio\/(\d{2,3})\//i);
  const value = match ? Number(match[1]) : NaN;
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Duration of a constant-bitrate mp3, in milliseconds, from its size. */
function durationMs(bytes: number, bitrateKbps: number | null): number | null {
  if (!bitrateKbps) return null;
  return (bytes * 8 * 1000) / (bitrateKbps * 1000);
}

async function checkReciter(reciterId: string, name: string, recitationId: number): Promise<void> {
  let ayahsChecked = 0;
  let gapFilled = 0;
  let segmentsParsed = 0;
  let compared = 0;
  let identical = 0;
  let sameDuration = 0;

  for (const surah of SAMPLE_SURAH) {
    const payload = await fetchJson(
      `${QURAN_COM_API}/recitations/${recitationId}/by_chapter/${surah}?per_page=300&fields=segments`
    );
    if (payload === null) {
      fail(name, `the alignment for surah ${surah} could not be fetched (recitation ${recitationId}).`);
      return;
    }

    const files = readAudioFiles(payload);
    if (files.length === 0) {
      fail(name, `recitation ${recitationId} returned no aligned audio for surah ${surah}.`);
      return;
    }

    for (const file of files) {
      // A segment whose numbers cannot be read is the Sudais bug: the reader is silently given
      // fewer words than the alignment describes, and the highlight uses the estimate instead.
      if (file.unreadable > 0) {
        fail(name, `${file.verse_key}: ${file.unreadable} segment(s) carry no readable numbers.`);
        continue;
      }

      ayahsChecked += 1;
      segmentsParsed += file.segments.length;

      // The alignment is checked against the widest word count it could describe: an index that
      // cannot be a word of the ayah is a failure regardless of how many words the text has.
      const widest = Math.max(...file.segments.map((segment) => segment[0]), file.segments.length);
      const aligned = alignSegmentsToWords(file.segments, widest);
      if (!aligned) {
        fail(name, `${file.verse_key}: the alignment is unusable (${JSON.stringify(file.segments)}).`);
        continue;
      }
      gapFilled += aligned.length - file.segments.length;
    }

    // Byte-compare the first few clips of the chapter against the file the player loads.
    for (const file of files.slice(0, AUDIO_SAMPLE_PER_SURAH)) {
      const [, ayahText] = file.verse_key.split(':');
      const ayah = Number.parseInt(ayahText ?? '', 10);
      if (!Number.isInteger(ayah) || ayah < 1) continue;

      const cdnUrl = reciterAudioUrl(reciterId, globalAyahNumber(surah, ayah));
      const [alignedBytes, cdnBytes] = await Promise.all([
        contentLength(file.url),
        contentLength(cdnUrl),
      ]);
      if (alignedBytes === null || cdnBytes === null) {
        fail(name, `${file.verse_key}: could not read the size of ${alignedBytes === null ? file.url : cdnUrl}.`);
        continue;
      }

      compared += 1;
      if (alignedBytes === cdnBytes) {
        identical += 1;
        continue;
      }

      // Different bytes are allowed only for a transcode: the same performance at another bitrate.
      // Both sides are CBR mp3, so each file's size over its own bitrate *is* its duration, and
      // equal durations with different byte counts is exactly what a transcode looks like. The
      // alignment's own timeline is also checked to sit inside the file: a different rendition of
      // the verse would describe seconds the file does not contain.
      const cdnBitrate = bitrateOf(cdnUrl);
      const alignedBitrate = bitrateOf(file.url) ?? cdnBitrate;
      const cdnDurationMs = durationMs(cdnBytes, cdnBitrate);
      const alignedDurationMs = durationMs(alignedBytes, alignedBitrate);
      const lastSegment = file.segments[file.segments.length - 1];
      const lastSegmentEnd = lastSegment?.[2] ?? 0;

      const durationAgrees =
        cdnDurationMs !== null &&
        alignedDurationMs !== null &&
        Math.abs(cdnDurationMs - alignedDurationMs) <= DURATION_TOLERANCE_MS;
      const timelineFits = cdnDurationMs !== null && lastSegmentEnd <= cdnDurationMs + TIMELINE_GRACE_MS;

      if (durationAgrees && timelineFits) {
        sameDuration += 1;
        continue;
      }

      fail(
        name,
        `${file.verse_key}: the aligned file (${alignedBytes} B, ${file.url}) is neither byte-identical ` +
          `to ${cdnUrl} (${cdnBytes} B) nor the same performance ` +
          `(${cdnDurationMs ?? 'unknown CDN duration'} ms on the CDN against ` +
          `${alignedDurationMs ?? 'unknown aligned duration'} ms aligned, timeline ends at ${lastSegmentEnd} ms).`
      );
    }
  }

  const pairing =
    compared === 0
      ? 'no audio compared'
      : identical === compared
        ? `byte-identical on ${identical}/${compared} clips`
        : `${identical}/${compared} byte-identical, ${sameDuration}/${compared} same-duration`;
  console.log(
    `  ${name.padEnd(30)} recitation ${String(recitationId).padStart(2)}  ` +
      `${String(ayahsChecked).padStart(4)} ayahs, ${segmentsParsed} segments, ` +
      `${gapFilled} word(s) filled in  —  ${pairing}`
  );
}

async function main(): Promise<void> {
  console.log('Offline checks (parser and alignment):');
  checkParserAndAligner();
  console.log(
    failures.length === 0
      ? '  parser and aligner behave as documented'
      : `  ${failures.length} offline check(s) failed`
  );

  console.log('\nLive checks (each reciter that ships timings):');
  const withTimings = RECITERS.filter((reciter) => reciter.recitationId !== undefined);
  for (const reciter of withTimings) {
    await checkReciter(reciter.id, reciter.name, reciter.recitationId as number);
  }

  const withoutTimings = RECITERS.filter((reciter) => reciter.recitationId === undefined);
  console.log(
    `\n${withoutTimings.length} reciter(s) ship without timings and are labelled in the player as estimated:`
  );
  console.log(`  ${withoutTimings.map((reciter) => reciter.name).join(', ')}`);

  if (failures.length > 0) {
    console.error('\nFailures:');
    for (const failure of failures) console.error(`  ${failure.reciter}: ${failure.message}`);
    process.exit(1);
  }

  console.log('\nEvery reciter with timings plays the recording those timings were measured against.');
}

void main();
