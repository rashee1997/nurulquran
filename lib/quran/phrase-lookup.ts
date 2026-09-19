/**
 * Locates an Arabic phrase inside the Mus'haf and returns the words it occupies.
 *
 * This exists so a lesson can play **authentic recitation** for the Arabic it quotes instead of
 * synthesizing it. A lesson's text is authored by hand, so it knows *what* it is quoting but not
 * *where* those words sit in a verse — and a word's recitation clip is addressed by verse and
 * word number, so the position is exactly what is missing. Two sources were used before this and
 * both left the learner with silence:
 *
 *  - The platform speech synthesizer, which has no Arabic voice on most desktops and so either
 *    errored immediately or read Uthmani script with an English voice.
 *  - Server Gemini TTS, which speaks Arabic correctly but is metered and returned 429 after the
 *    first call on the configured key.
 *
 * ## How a position is established (and why it can be trusted)
 *
 * The Quran.com text API is the same corpus the word-by-word clips are numbered from, and its
 * `words[].position` is the clip number: `2:255` returns 50 word entries at positions 1-50 and
 * `wbw/002_255_050.mp3` exists while `wbw/002_255_051.mp3` is a 404. (Note the same response's
 * `audio_url` field numbers *raw* tokens — it advertises `002_255_058.mp3`, which does not exist —
 * so this module numbers from `position` and never from `audio_url`.) Verses full of pause marks
 * are therefore the case that proves the numbering, which is why the check below is not a
 * text-length guess.
 *
 * A match is only accepted when the phrase's words equal a **contiguous run** of the verse's words
 * under `normalizeForSearch` (diacritics, alef/ya/ta-marbuta variants and hamza all ignored). A
 * fuzzy or partial match is rejected rather than approximated: playing the wrong verse's words
 * would teach the wrong pronunciation, which is worse than reporting that no recording exists.
 *
 * Results are cached for the session, so practising the same lesson twice costs one lookup.
 */

import { isMarkOnlyToken, normalizeForSearch } from './arabic-text';
import type { RecitationSpan } from './word-audio';

const API_BASE = 'https://api.quran.com/api/v4';
/** Candidates inspected per lookup; the search service ranks them, and the first verified run wins. */
const SEARCH_RESULTS = 5;
/** A lesson quotes a phrase, not a passage. Longer text is refused rather than sent to search. */
const MAX_PHRASE_WORDS = 12;
/** A verse cannot exceed 128 words (2:282), which also bounds the loop that hunts for the run. */
const MAX_VERSE_WORDS = 128;
const REQUEST_TIMEOUT_MS = 8_000;

/**
 * Quranic stop signs that are *written* with letters but read as symbols, never as words.
 *
 * Level 9 of the curriculum teaches them, and they are abbreviations: "قلى" is "الوقف أولى" and
 * "صلى" is "الوصل أولى". They also normalise onto real words — "قلى" is قَلَىٰ in 93:3 — so without
 * this list a lesson about the symbol "قلى" would play the word "qalaa" and teach the learner to
 * read a stop sign aloud. Refusing them is the honest answer: there is no recitation of a symbol.
 */
const WAQF_SYMBOLS = new Set(['قلى', 'صلى', 'وقف', 'سكتة', 'لا'].map((sign) => normalizeForSearch(sign)));

export interface PhraseWord {
  /** The word as the text edition spells it, keeping its diacritics. */
  text: string;
  /** 1-based clip number within the ayah — the value the word-by-word CDN is numbered by. */
  position: number;
}

export interface PhraseMatch {
  surah: number;
  ayah: number;
  /** `surah:ayah`, e.g. `113:2`. */
  verseKey: string;
  /** The matched words, in recitation order. */
  words: PhraseWord[];
  /** The same run as a playable span. */
  span: RecitationSpan;
}

export type PhraseLookup =
  | { status: 'found'; match: PhraseMatch }
  | { status: 'not-found'; reason: string }
  | { status: 'unavailable'; reason: string };

const lookupCache = new Map<string, PhraseLookup>();

/** Splits text into words, dropping the standalone pause and annotation marks. */
function wordsOf(text: string): string[] {
  return text
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0 && !isMarkOnlyToken(word));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Fetches JSON with a bounded wait, so a hang cannot leave a lesson waiting on a spinner. */
async function fetchJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The words of one verse with their clip numbers, or an empty list when the shape is unexpected. */
async function verseWords(verseKey: string): Promise<PhraseWord[]> {
  const payload = await fetchJson(
    `${API_BASE}/verses/by_key/${encodeURIComponent(verseKey)}?words=true&word_fields=text_uthmani`
  );
  const verse = asRecord(asRecord(payload)?.verse);
  if (!verse) return [];

  const words: PhraseWord[] = [];
  for (const entry of asArray(verse.words)) {
    const word = asRecord(entry);
    if (!word) continue;
    const position = word.position;
    if (typeof position !== 'number' || !Number.isInteger(position) || position < 1) continue;
    // The closing verse number ("end") carries a position but is not a recited word, and it has no
    // clip. Skipping it is what keeps `position` aligned with the audio numbering.
    if (asString(word.char_type_name) === 'end') continue;
    const text = asString(word.text_uthmani) ?? asString(word.text);
    if (!text) continue;
    words.push({ text, position });
  }

  if (words.length > MAX_VERSE_WORDS) return [];
  // Positions must ascend; a verse whose numbering skips or repeats cannot be addressed by index.
  for (let index = 1; index < words.length; index += 1) {
    const current = words[index];
    const previous = words[index - 1];
    if (!current || !previous || current.position <= previous.position) return [];
  }
  return words;
}

/** Index of the first contiguous run of `phrase` inside `verse`, or -1. */
function findRun(verse: readonly PhraseWord[], phrase: readonly string[]): number {
  const target = phrase.map((word) => normalizeForSearch(word));
  const haystack = verse.map((word) => normalizeForSearch(word.text));
  const last = haystack.length - target.length;

  for (let start = 0; start <= last; start += 1) {
    let matched = true;
    for (let offset = 0; offset < target.length; offset += 1) {
      const targetWord = target[offset];
      if (targetWord === undefined || targetWord.length === 0 || haystack[start + offset] !== targetWord) {
        matched = false;
        break;
      }
    }
    if (matched) return start;
  }
  return -1;
}

/**
 * Candidate verses for a phrase, best-ranked first.
 *
 * Returns `null` when the service could not be reached, and an empty list when it answered that
 * nothing matches. The two are different verdicts — the first is worth retrying and the second
 * means the text simply is not Quranic — and collapsing them is what made a mnemonic like
 * "يَرْمَلُون" report as a network failure.
 */
async function searchVerseKeys(phrase: string): Promise<string[] | null> {
  const payload = await fetchJson(
    `${API_BASE}/search?q=${encodeURIComponent(phrase)}&size=${SEARCH_RESULTS}&page=1&language=en`
  );
  const search = asRecord(asRecord(payload)?.search);
  if (!search) return null;

  const keys: string[] = [];
  for (const entry of asArray(search.results)) {
    const key = asString(asRecord(entry)?.verse_key);
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

function parseVerseKey(verseKey: string): { surah: number; ayah: number } | null {
  const [surahText, ayahText] = verseKey.split(':');
  const surah = Number.parseInt(surahText ?? '', 10);
  const ayah = Number.parseInt(ayahText ?? '', 10);
  if (!Number.isInteger(surah) || !Number.isInteger(ayah)) return null;
  if (surah < 1 || surah > 114 || ayah < 1) return null;
  return { surah, ayah };
}

/**
 * Where this Arabic phrase appears in the Quran, verified word by word.
 *
 * Resolves `not-found` for text that simply is not Quranic (a mnemonic, a rule name, a
 * transliteration) and `unavailable` when the text service cannot be reached — callers show those
 * as different messages, because only one of them is worth retrying.
 */
export async function lookupQuranPhrase(arabic: string): Promise<PhraseLookup> {
  const words = wordsOf(arabic);
  if (words.length === 0) {
    return { status: 'not-found', reason: 'There is no Arabic text to locate.' };
  }
  if (words.length > MAX_PHRASE_WORDS) {
    return {
      status: 'not-found',
      reason: `A phrase of ${words.length} words is too long to locate exactly.`,
    };
  }

  const cacheKey = normalizeForSearch(words.join(' '));
  if (WAQF_SYMBOLS.has(cacheKey)) {
    return {
      status: 'not-found',
      reason: `"${words.join(' ')}" is a Quranic stop sign, not recited words, so it has no recording.`,
    };
  }

  const cached = lookupCache.get(cacheKey);
  if (cached) return cached;

  const ranked = await searchVerseKeys(words.join(' '));
  if (ranked === null) {
    return {
      status: 'unavailable',
      reason: 'The Quran text service could not be reached, so this text has no verified recording.',
    };
  }

  let sawVerse = false;

  for (const verseKey of ranked) {
    const parsed = parseVerseKey(verseKey);
    if (!parsed) continue;
    const verse = await verseWords(verseKey);
    if (verse.length === 0) continue;
    sawVerse = true;

    const start = findRun(verse, words);
    if (start === -1) continue;

    const matched = verse.slice(start, start + words.length);
    const firstMatched = matched[0];
    const lastMatched = matched[matched.length - 1];
    if (!firstMatched || !lastMatched) continue;
    const endWord = lastMatched.position;
    const span: RecitationSpan = {
      surah: parsed.surah,
      ayah: parsed.ayah,
      startWord: firstMatched.position,
      endWord,
    };
    const result: PhraseLookup = {
      status: 'found',
      match: { surah: parsed.surah, ayah: parsed.ayah, verseKey, words: matched, span },
    };
    lookupCache.set(cacheKey, result);
    return result;
  }

  // The search ranked verses but not one of them could be read: a service failure, worth retrying.
  if (!sawVerse && ranked.length > 0) {
    return {
      status: 'unavailable',
      reason: 'The Quran text service could not be reached, so this text has no verified recording.',
    };
  }

  const result: PhraseLookup = {
    status: 'not-found',
    reason: 'This text is not a run of words from an ayah, so there is no recitation recording.',
  };
  lookupCache.set(cacheKey, result);
  return result;
}
