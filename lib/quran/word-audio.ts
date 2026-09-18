import { normalizeForSearch } from './arabic-text';

/**
 * Word-by-word recitation audio resolution.
 *
 * Tapping a word has to play *that* word as a Qari recites it — that is the whole point of
 * a Tajweed reader. Two other sources were used before this existed and both were rejected
 * on evidence rather than preference:
 *
 *  - **The browser speech synthesizer cannot do it.** It has no Arabic voice on most
 *    desktop and Linux systems, and `lib/audio/preview-audio` never even selected a voice,
 *    so `speechSynthesis` either fired `error` immediately or read Uthmani script with an
 *    English voice. The learner heard nothing useful and got no explanation.
 *
 *  - **Server-side Gemini TTS is metered.** `/api/tajweed/voice-preview` does synthesize
 *    Arabic correctly — the first call for a single word returned 84480 bytes of 24 kHz
 *    mono PCM — but every call after it returned HTTP 429 on the configured key. A feature
 *    that fires once per word tap cannot depend on a quota that small.
 *
 * The CDN below serves the audited word-by-word recitation of the Quran, is keyless, and
 * needs no server round trip beyond the clip itself.
 *
 * ## Verified shape (probed against the live CDN)
 *
 * File name: `{surah:3}_{ayah:3}_{word:3}.mp3`, all three zero-padded.
 *
 * | Request              | Result                                  |
 * | -------------------- | --------------------------------------- |
 * | `001_001_001.mp3`    | 200, 44 975 B, real MP3 (`ID3\x03`)     |
 * | `001_001_004.mp3`    | 200 — Al-Fatihah 1:1 is four words      |
 * | `001_001_005.mp3`    | 404 — correctly past the end of the ayah |
 * | `002_001_001.mp3`    | 200 — Al-Baqarah 2:1 (`الم`) is one word  |
 * | `002_001_002.mp3`    | 404 — correctly past the end of the ayah |
 * | `112_001_004.mp3`    | 200 — Al-Ikhlas 112:1 is four words     |
 * | `112_001_005.mp3`    | 404                                     |
 * | `108_003_002.mp3`    | 200 — Al-Kawthar 108:3 is two words     |
 * | `114_006_003.mp3`    | 200 on the fallback host                |
 *
 * Two conclusions follow, and both matter:
 *
 *  1. The word index is **1-based and matches `QuranWord.wordIndex`**, which
 *     `AlQuranCloudProvider.buildWords` also numbers from 1. A word that exists always
 *     returns audio and the first word that does not exist returns 404, so the index can be
 *     trusted directly with no offset arithmetic.
 *  2. A 404 returns an HTML error page, so a failed lookup must be treated as "no audio for
 *     this word" and never handed to an `<audio>` element expecting MP3.
 */

/** Hosts that serve the word-by-word corpus, tried in order. */
export const WORD_AUDIO_CDNS = [
  'https://audio.qurancdn.com/wbw',
  'https://verses.quran.com/wbw',
] as const;

const MIN_SURAH = 1;
const MAX_SURAH = 114;

function pad3(value: number): string {
  return String(value).padStart(3, '0');
}

/**
 * Every URL that may hold this word's recitation, in preference order.
 *
 * Returns an empty list for a reference that cannot exist, so a caller never requests a
 * malformed path or renders a play control that is known to be dead.
 */
export function wordAudioCandidates(surah: number, ayah: number, wordIndex: number): string[] {
  const valid =
    Number.isInteger(surah) &&
    surah >= MIN_SURAH &&
    surah <= MAX_SURAH &&
    Number.isInteger(ayah) &&
    ayah >= 1 &&
    Number.isInteger(wordIndex) &&
    wordIndex >= 1;
  if (!valid) return [];

  const file = `${pad3(surah)}_${pad3(ayah)}_${pad3(wordIndex)}.mp3`;
  return WORD_AUDIO_CDNS.map((base) => `${base}/${file}`);
}

/** The primary URL for a word, or `undefined` when the reference cannot exist. */
export function wordAudioUrl(surah: number, ayah: number, wordIndex: number): string | undefined {
  return wordAudioCandidates(surah, ayah, wordIndex)[0];
}

/**
 * A run of words inside one ayah, 1-based and inclusive on both ends.
 *
 * This is what lets a lesson play the *authentic* recitation of its example. A lesson used to
 * synthesize its Quranic examples through the platform speech engine and then through server
 * Gemini TTS, which is metered and in practice returned 429 — so "Hear Pronunciation" on an
 * ayah example produced silence or an English-accented reading of the Uthmani script. An
 * anchor turns the same tap into the same Qari clips the reader plays.
 */
export interface RecitationSpan {
  surah: number;
  ayah: number;
  /** 1-based index of the first word, matching `QuranWord.wordIndex`. */
  startWord: number;
  /** 1-based index of the last word, inclusive. */
  endWord: number;
}

/**
 * Expands a span into one candidate-URL group per word, ready for a sequence player.
 *
 * Order is preserved and no fetching is involved: the word index addresses the clip directly,
 * which is the property verified above. An empty result means the span itself is impossible
 * (inverted, non-integer, or outside the Quran), so a caller can fall back instead of
 * requesting a path that cannot exist.
 */
export function spanAudioGroups(span: RecitationSpan): string[][] {
  const { surah, ayah, startWord, endWord } = span;
  if (!Number.isInteger(startWord) || !Number.isInteger(endWord)) return [];
  if (startWord < 1 || endWord < startWord) return [];
  // One ayah cannot exceed 128 words (2:282, the longest in the Quran); a span longer than that
  // is a data error rather than a request worth issuing.
  if (endWord - startWord + 1 > 128) return [];

  const groups: string[][] = [];
  for (let wordIndex = startWord; wordIndex <= endWord; wordIndex += 1) {
    const candidates = wordAudioCandidates(surah, ayah, wordIndex);
    if (candidates.length === 0) return [];
    groups.push(candidates);
  }
  return groups;
}

/**
 * A stable playback key for a span.
 *
 * Derived from the reference rather than from the text: two lessons that quote the same ayah
 * are the same recording, and a fragment is distinguished by its word range. Keying on the
 * text (as one caller did with a 24-character prefix) collides across verses that open with
 * the same words. `r` marks a range, `w` a single word, so the two can never collide.
 */
/**
 * Position of `token` within the ordered words of an answer, as a 1-based word index.
 *
 * A word-order activity holds its words as separate tokens and its ordered answer is the span
 * itself, so a tapped token maps to a word index by text. Comparison uses the app's normaliser:
 * the curriculum is hand-authored with precomposed alef forms while the clips are numbered from
 * the Uthmani edition.
 *
 * Returns `null` when the token is not in the answer, so a caller falls back rather than
 * playing whichever word happens to sit at a guessed index.
 */
export function spanWordIndexForToken(orderedAnswer: string, token: string): number | null {
  const words = orderedAnswer.split(/\s+/).filter((word) => word.length > 0);
  const needle = normalizeForSearch(token);
  if (needle.length === 0) return null;
  const position = words.findIndex((word) => normalizeForSearch(word) === needle);
  return position === -1 ? null : position + 1;
}

export function spanPlaybackKey(span: RecitationSpan): string {
  const { surah, ayah, startWord, endWord } = span;
  return startWord === endWord
    ? `quran:w:${surah}:${ayah}:${startWord}`
    : `quran:r:${surah}:${ayah}:${startWord}-${endWord}`;
}
