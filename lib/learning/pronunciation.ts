/**
 * Resolves the Arabic shown in a lesson to **real recordings**, with no AI in the path.
 *
 * The lessons used to depend on the AI Recitation Guide for every bit of pronunciation practice:
 * the only audio on an activity was one "Hear Pronunciation" button that fell through to the
 * platform synthesizer (no Arabic voice on most desktops) and then to server Gemini TTS (metered,
 * and in practice 429 after the first call). So a learner who wanted to *hear* a letter or an ayah
 * before reciting it — the one thing the Quran reader does well, word by word — could not, and the
 * only feedback loop left was an AI service that may be unconfigured or rate-limited.
 *
 * Every source below is a recording, and each one is established by evidence rather than by a
 * hopeful URL:
 *
 *  1. **A verified anchor.** Some activities carry the exact verse and word range of their example
 *     (`Activity.quranAnchor`). That is the word-by-word corpus the reader plays, cached by the
 *     service worker, and it is used as-is.
 *  2. **A looked-up phrase.** Everything else that is Quranic is located in the Mus'haf first
 *     (`lib/quran/phrase-lookup`), which verifies the phrase against the verse text and reports the
 *     clip numbers. Text that is not a run of ayah words is *never* guessed at.
 *  3. **The isolated-letter recordings.** A letter, or a list of letters (mnemonics such as
 *     "ء ، هـ ، ع ، ح ، غ ، خ" are taught as letters, so they are *played* as letters) resolves to
 *     the same 28 recordings the alphabet page uses.
 *
 * When none of the three applies, the answer is an explicit `none` with a reason — the learner is
 * told there is no recording instead of being handed a synthesized voice and left to assume it is
 * the Quran.
 */

import { ARABIC_ALPHABET, type ArabicLetterMeta } from '@/lib/audio/alphabet-audio';
import { isMarkOnlyToken, normalizeForSearch, stripTashkeel } from '@/lib/quran/arabic-text';
import { lookupQuranPhrase } from '@/lib/quran/phrase-lookup';
import { wordAudioCandidates, type RecitationSpan } from '@/lib/quran/word-audio';

/** Arabic script block plus the supplementary ranges the Quranic text uses. */
const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export function containsArabicScript(text: string): boolean {
  return ARABIC_SCRIPT.test(text);
}

/** One playable item: a piece of text and the recordings that can voice it. */
export interface PronunciationItem {
  /** Stable playback key, unique within a resolution. */
  key: string;
  /** The text shown on the item's chip, as the lesson wrote it. */
  text: string;
  /** Interchangeable recording URLs, best first. Never empty. */
  sources: readonly string[];
}

export interface QuranPronunciation {
  kind: 'quran';
  /** `anchor` when the activity already knew the position; `verified` when it was looked up. */
  route: 'anchor' | 'verified';
  surah: number;
  ayah: number;
  verseKey: string;
  /** Words in recitation order. */
  words: string[];
  /** Clip number per word, aligned with `words`. */
  positions: number[];
}

export interface LettersPronunciation {
  kind: 'letters';
  letters: ArabicLetterMeta[];
  /** The tokens the learner wrote, aligned with `letters`. */
  words: string[];
  /** True when these are several letters being spelled out, rather than one letter. */
  spelled: boolean;
  /**
   * Letter tokens this library has no isolated recording for (hamza, most often).
   *
   * Reported rather than silently dropped: the six throat letters of Izhar begin with hamza, and a
   * learner who heard five of them with no explanation would assume the first had played.
   */
  missing: string[];
}

export type Pronunciation =
  | QuranPronunciation
  | LettersPronunciation
  | { kind: 'none'; reason: string };

/** Words of a phrase, without the standalone pause and annotation marks. */
function wordsOf(text: string): string[] {
  return text
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0 && !isMarkOnlyToken(word));
}

/**
 * Letter metadata by normalized glyph, English name, Arabic name and id.
 *
 * Normalising both sides is what lets a lesson write "هـ" while the alphabet entry holds "هـ" with
 * a tatweel, or "أ" where the text edition writes a bare alif.
 */
const LETTER_INDEX: Map<string, ArabicLetterMeta> = (() => {
  const index = new Map<string, ArabicLetterMeta>();
  const add = (key: string, meta: ArabicLetterMeta): void => {
    const normalized = normalizeForSearch(key);
    if (normalized.length > 0 && !index.has(normalized)) index.set(normalized, meta);
  };
  for (const meta of ARABIC_ALPHABET) {
    add(meta.letter, meta);
    add(meta.nameEn, meta);
    add(meta.nameArabic, meta);
    add(meta.id, meta);
  }
  return index;
})();

/** The alphabet entry for a single written letter, e.g. "هـ" or "تَ". */
export function resolveLetter(token: string): ArabicLetterMeta | undefined {
  return LETTER_INDEX.get(normalizeForSearch(token));
}

/** The token with its diacritics, punctuation and digits removed — its bare letters. */
function bareLetters(token: string): string {
  return stripTashkeel(token).replace(/[^\p{L}]/gu, '');
}

/**
 * The letters of a mnemonic or letter list, in order, or `null` when the text is ordinary words.
 *
 * Only a token whose bare letters are a *single* Arabic letter counts as a letter here, so a word
 * like "قُطْبُ" is a word and not four letters. Tokens with no Arabic letters at all — the commas
 * in a list, or a transliteration in brackets such as "(Yanmoo)" — are ignored, which is what makes
 * the mnemonics in the curriculum play as the letters they name instead of failing outright.
 */
function resolveLetterSequence(words: readonly string[]): {
  letters: ArabicLetterMeta[];
  tokens: string[];
  missing: string[];
} | null {
  const letters: ArabicLetterMeta[] = [];
  const tokens: string[] = [];
  const missing: string[] = [];

  for (const word of words) {
    const bare = bareLetters(word);
    if (bare.length === 0) continue;
    // A Latin annotation ("(Qutb Jadd)") is a gloss on the Arabic, not part of it.
    if (!containsArabicScript(bare)) continue;
    if (bare.length !== 1) return null;

    const meta = resolveLetter(bare);
    if (!meta) {
      missing.push(word);
      continue;
    }
    letters.push(meta);
    tokens.push(word);
  }

  return letters.length > 0 || missing.length > 0 ? { letters, tokens, missing } : null;
}

/**
 * The most substantial Arabic phrase quoted inside prose, or `null`.
 *
 * Lessons quote the verse they are teaching in the instruction ("like in 'تَرْمِيهِم بِحِجَارَةٍ'"),
 * and that quote is what a learner wants to hear. Arabic punctuation is dropped rather than kept,
 * because a list written as "رَبَّنَا، قُرْءَان" is two quotes and not one phrase.
 */
export function firstArabicPhrase(text: string): string | null {
  const runs = text.match(/[\u0600-\u06FF][\u0600-\u06FF\s]*[\u0600-\u06FF]|[\u0600-\u06FF]/g) ?? [];
  const phrases = runs
    .map((run) =>
      run
        // Keep letters, Quranic marks and tatweel; drop Arabic punctuation such as "،".
        .replace(/[\u060C\u061B\u061F\u066A-\u066D\u06D4]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter((phrase) => phrase.length > 0 && wordsOf(phrase).length > 0)
    .sort((left, right) => right.length - left.length);

  return phrases[0] ?? null;
}

/**
 * The distinct recorded letters of any text, in order of first appearance.
 *
 * The fallback for Arabic that is not Quranic and not a letter list — a mnemonic such as
 * "فَحَثَّهُ شَخْصٌ سَكَتَ", whose whole teaching point is its ten letters. It is offered as
 * *letters*, never as a reading of the word, because that is what it honestly is.
 */
export function lettersOfText(text: string): ArabicLetterMeta[] {
  const found: ArabicLetterMeta[] = [];
  for (const token of wordsOf(text)) {
    for (const character of bareLetters(token)) {
      const meta = resolveLetter(character);
      if (meta && !found.some((entry) => entry.id === meta.id)) found.push(meta);
    }
  }
  return found;
}

export interface ResolveOptions {
  /** Verified position of this text, when the activity knows it. */
  anchor?: RecitationSpan;
  /** Skip the network lookup — used where a lookup would only delay a locally answerable text. */
  offline?: boolean;
}

/**
 * How this Arabic should be voiced: a verified verse run, isolated letters, or nothing.
 *
 * The anchor is tried first because it is exact and needs no network. A phrase that the anchor
 * cannot cover (a count mismatch against the lesson's own words) falls through to the lookup
 * rather than playing a run of the wrong length.
 */
export async function resolvePronunciation(
  arabic: string,
  options: ResolveOptions = {}
): Promise<Pronunciation> {
  const words = wordsOf(arabic);
  if (words.length === 0) {
    return { kind: 'none', reason: 'There is no Arabic text to pronounce here.' };
  }

  const { anchor } = options;
  if (anchor) {
    const spanLength = anchor.endWord - anchor.startWord + 1;
    if (spanLength === words.length && spanLength > 0) {
      return {
        kind: 'quran',
        route: 'anchor',
        surah: anchor.surah,
        ayah: anchor.ayah,
        verseKey: `${anchor.surah}:${anchor.ayah}`,
        words,
        positions: words.map((_, index) => anchor.startWord + index),
      };
    }
  }

  const letters = resolveLetterSequence(words);
  if (letters && letters.letters.length > 0) {
    return {
      kind: 'letters',
      letters: letters.letters,
      words: letters.tokens,
      spelled: letters.letters.length + letters.missing.length > 1,
      missing: letters.missing,
    };
  }
  if (letters && letters.missing.length > 0) {
    return {
      kind: 'none',
      reason: `There is no isolated-letter recording for ${letters.missing.join(', ')}.`,
    };
  }

  if (!options.offline) {
    const lookup = await lookupQuranPhrase(arabic);
    if (lookup.status === 'found') {
      return {
        kind: 'quran',
        route: 'verified',
        surah: lookup.match.surah,
        ayah: lookup.match.ayah,
        verseKey: lookup.match.verseKey,
        words: lookup.match.words.map((word) => word.text),
        positions: lookup.match.words.map((word) => word.position),
      };
    }
    if (lookup.status === 'unavailable') {
      return { kind: 'none', reason: lookup.reason };
    }
    return { kind: 'none', reason: lookup.reason };
  }

  return {
    kind: 'none',
    reason: 'This text has no recitation recording and the Quran text service was not consulted.',
  };
}

/**
 * The playable items of a resolution, in order — one per word, or one per letter.
 *
 * A word with no clip is dropped rather than faked: `wordAudioCandidates` returns an empty list for
 * a reference that cannot exist, and a caller that played something else in its place would be
 * teaching a different word.
 */
export function pronunciationItems(resolution: Pronunciation): PronunciationItem[] {
  if (resolution.kind === 'quran') {
    const items: PronunciationItem[] = [];
    resolution.words.forEach((text, index) => {
      const position = resolution.positions[index] ?? 0;
      const sources = wordAudioCandidates(resolution.surah, resolution.ayah, position);
      if (sources.length === 0) return;
      items.push({
        key: `quran:w:${resolution.surah}:${resolution.ayah}:${position}`,
        text,
        sources,
      });
    });
    return items;
  }

  if (resolution.kind === 'letters') {
    return resolution.letters.map((meta, index) => ({
      key: `letter:${meta.id}`,
      text: resolution.words[index] ?? meta.letter,
      sources: [meta.audioUrl],
    }));
  }

  return [];
}

/** One-line description of where the audio comes from, for the learner to see. */
export function pronunciationSource(resolution: Pronunciation): {
  /** Short badge text. */
  label: string;
  /** Longer explanation, or the reason there is nothing to play. */
  detail: string;
  /** True when a recording (not a synthesizer) is available. */
  recorded: boolean;
} {
  if (resolution.kind === 'quran') {
    return {
      label: resolution.route === 'anchor' ? 'Recorded recitation' : 'Verified recitation',
      detail: `Word by word, as recited in ${resolution.verseKey}.`,
      recorded: true,
    };
  }
  if (resolution.kind === 'letters') {
    const single = resolution.letters.length === 1;
    const missing = resolution.missing.length > 0 ? ` No isolated recording for ${resolution.missing.join(', ')}.` : '';
    return {
      label: single ? 'Letter recording' : 'Letter recordings',
      detail:
        (single
          ? `The recorded pronunciation of ${resolution.letters[0]?.nameEn ?? 'the letter'}.`
          : `Each letter recorded separately: ${resolution.letters.map((meta) => meta.nameEn).join(', ')}.`) + missing,
      recorded: true,
    };
  }
  return { label: 'No recording', detail: resolution.reason, recorded: false };
}
