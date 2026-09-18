import { isMarkOnlyToken } from './arabic-text';
import { TajweedData, TajweedRule, TajweedSegment } from './types';

/**
 * Deterministic Tajweed highlighting derived from the Uthmani script (Hafs).
 *
 * This is a *study aid*: every rule below is decided from explicit Quranic
 * codepoints in the text, never from guessed phonetics, and a rule is only asserted
 * when the script unambiguously supports it. Where the script is ambiguous the
 * segment is left unclassified rather than coloured with a rule that may be wrong.
 */

/** Quranic codepoints referenced by the rules below. */
export const TAJWEED_CODEPOINTS = {
  FATHA: '\u064E',
  DAMMA: '\u064F',
  KASRA: '\u0650',
  SHADDA: '\u0651',
  SUKUN: '\u0652',
  MADDAH: '\u0653',
  SUPERSCRIPT_ALEF: '\u0670', // dagger alif — the common Uthmani long-vowel marker
  FATHATAN: '\u064B',
  DAMMATAN: '\u064C',
  KASRATAN: '\u064D',
  OPEN_FATHATAN: '\u08F0',
  OPEN_DAMMATAN: '\u08F1',
  OPEN_KASRATAN: '\u08F2',
  SMALL_HIGH_ROUNDED_ZERO: '\u06DF', // letter written but not recited
  SMALL_HIGH_MEEM: '\u06E2', // iqlab sign
  SMALL_LOW_MEEM: '\u06ED', // iqlab sign (alternate)
  SMALL_WAW: '\u06E5', // silent
  SMALL_YEH: '\u06E6', // silent
} as const;

const {
  FATHA,
  DAMMA,
  KASRA,
  SHADDA,
  SUKUN,
  MADDAH,
  SUPERSCRIPT_ALEF,
  FATHATAN,
  DAMMATAN,
  KASRATAN,
  OPEN_FATHATAN,
  OPEN_DAMMATAN,
  OPEN_KASRATAN,
  SMALL_HIGH_ROUNDED_ZERO,
  SMALL_HIGH_MEEM,
  SMALL_LOW_MEEM,
  SMALL_WAW,
  SMALL_YEH,
} = TAJWEED_CODEPOINTS;

/** ق ط ب ج د */
const QALQALAH_LETTERS = new Set(['\u0642', '\u0637', '\u0628', '\u062C', '\u062F']);
/** ي ن م و — Idgham with Ghunnah */
const IDGHAM_WITH_GHUNNAH = new Set(['\u064A', '\u0646', '\u0645', '\u0648']);
/** ل ر — Idgham without Ghunnah */
const IDGHAM_WITHOUT_GHUNNAH = new Set(['\u0644', '\u0631']);
/** The 15 Ikhfa letters: ص ذ ث ك ج ش ق س د ط ز ف ت ض ظ */
const IKHFA_LETTERS = new Set([
  '\u0635', '\u0630', '\u062B', '\u0643', '\u062C', '\u0634', '\u0642',
  '\u0633', '\u062F', '\u0637', '\u0632', '\u0641', '\u062A', '\u0636', '\u0638',
]);
/** Letters that leave Noon Sakinah/Tanween fully pronounced: ء ه ع ح غ خ */
const IZHAR_LETTERS = new Set([
  '\u0621', '\u0647', '\u0639', '\u062D', '\u063A', '\u062E',
]);
/** Hamza-bearing letters that extend a preceding Madd. */
const HAMZA_LETTERS = new Set([
  '\u0621', '\u0622', '\u0623', '\u0624', '\u0625', '\u0626',
]);
const TANWEEN_MARKS = [FATHATAN, DAMMATAN, KASRATAN, OPEN_FATHATAN, OPEN_DAMMATAN, OPEN_KASRATAN];

const MARK_PATTERN = /[\u064B-\u0655\u0670\u06D6-\u06ED\u08D3-\u08FF]/;
const AYAH_MARKER_PATTERN = /[\u06DD\u06DE][\u0660-\u0669\u06F0-\u06F9]*/g;

export interface TajweedRuleMeta {
  colorClass: string;
  name: string;
  nameTa: string;
  description: string;
}

export const TAJWEED_META: Record<TajweedRule, TajweedRuleMeta> = {
  ghunnah: {
    colorClass: 'text-tajweed-ghunnah font-semibold',
    name: 'Ghunnah (Nasalization)',
    nameTa: 'குன்னா (மூக்கொலி)',
    description: 'Nasal resonance held for two counts on Noon or Meem carrying Shaddah.',
  },
  qalqalah: {
    colorClass: 'text-tajweed-qalqalah font-semibold',
    name: 'Qalqalah (Echo)',
    nameTa: 'கல்கலா (எதிரொலித்தல்)',
    // Scoped to what the engine actually detects. It requires an explicit Sukoon, so the
    // echo produced by *stopping* on one of these letters is not highlighted; claiming it here
    // would tell the learner a rule is shown that never appears.
    description: 'Bouncing echo when ق ط ب ج د carries an explicit Sukoon in the script.',
  },
  idgham_with_ghunnah: {
    colorClass: 'text-tajweed-idgham font-semibold',
    name: 'Idgham with Ghunnah',
    nameTa: 'இட்காம் (மூக்கொலியுடன் கலத்தல்)',
    description: 'Noon Sakinah or Tanween merges into a following ي ن م و with two counts of nasalization.',
  },
  idgham_without_ghunnah: {
    // No opacity modifier: reducing the alpha of scripture text lowers its effective contrast
    // against the page and pushes an otherwise legible colour below the WCAG floor.
    colorClass: 'text-tajweed-idgham font-semibold',
    name: 'Idgham without Ghunnah',
    nameTa: 'இட்காம் (மூக்கொலி இன்றி கலத்தல்)',
    description: 'Noon Sakinah or Tanween merges completely into a following ل or ر, with no nasalization.',
  },
  ikhfa: {
    colorClass: 'text-tajweed-ikhfa font-semibold',
    name: 'Ikhfa (Concealment)',
    nameTa: 'இக்ஃபா (மறைத்து ஓதுதல்)',
    description: 'Noon Sakinah or Tanween is concealed with nasalization before one of the 15 Ikhfa letters.',
  },
  iqlab: {
    colorClass: 'text-tajweed-iqlab font-semibold',
    name: 'Iqlab (Conversion)',
    nameTa: 'இக்லாப் (மாற்றுதல்)',
    description: 'Noon Sakinah or Tanween converts into a Meem sound before Baa, marked by the small Meem sign.',
  },
  izhar: {
    colorClass: 'text-tajweed-izhar font-semibold',
    name: 'Izhar Halqi (Clear Pronunciation)',
    nameTa: 'இழ்ஹார் ஹல்கி (தெளிவாக ஓதுதல்)',
    description: 'Noon Sakinah or Tanween is pronounced clearly, with no nasalization, before a throat letter.',
  },
  madd_normal: {
    colorClass: 'text-tajweed-madd font-semibold',
    name: 'Madd Asli (Natural Elongation)',
    nameTa: 'மத்து அஸ்லி (இயற்கை நீட்டல்)',
    description: 'Natural elongation held for exactly two counts.',
  },
  madd_obligatory: {
    colorClass: 'text-tajweed-madd-long font-bold',
    name: 'Madd Muttasil / Munfasil / Lazim',
    nameTa: 'மத்து முத்தஸில் / முன்ஃபஸில் / லாஸிம்',
    description: 'Extended elongation of 4-5 counts before a Hamzah, or 6 counts before a Sukoon/Shaddah.',
  },
  silent: {
    colorClass: 'text-tajweed-silent',
    name: 'Silent Letter',
    nameTa: 'ஓதப்படாத எழுத்து',
    description: 'Written in the Mushaf but not pronounced in continuous recitation.',
  },
};

/** Every rule with a name, for a legend that carries the meaning without relying on colour. */
export const TAJWEED_LEGEND: Array<{
  rule: TajweedRule;
  name: string;
  nameTa: string;
  colorClass: string;
}> = (Object.keys(TAJWEED_META) as TajweedRule[]).map((rule) => ({
  rule,
  name: TAJWEED_META[rule].name,
  nameTa: TAJWEED_META[rule].nameTa,
  colorClass: TAJWEED_META[rule].colorClass,
}));

interface Unit {
  /** Exact substring of the verse for this letter and its attached marks. */
  text: string;
  base: string;
  marks: string[];
  wordIndex: number;
}

interface FlatUnit extends Unit {
  /** Position within the flattened unit list. */
  position: number;
}

function isMark(character: string): boolean {
  return MARK_PATTERN.test(character);
}

/** Splits verse text into whitespace-separated word tokens, keeping separators. */
function tokenizeVerse(text: string): Array<{ kind: 'space' | 'word'; text: string }> {
  const tokens: Array<{ kind: 'space' | 'word'; text: string }> = [];
  const pattern = /\s+|\S+/g;
  for (const match of text.matchAll(pattern)) {
    const value = match[0];
    tokens.push({ kind: /^\s+$/.test(value) ? 'space' : 'word', text: value });
  }
  return tokens;
}

function buildUnits(wordText: string, wordIndex: number): Unit[] {
  const units: Unit[] = [];

  for (const character of wordText) {
    if (units.length === 0) {
      units.push({ text: character, base: isMark(character) ? '' : character, marks: isMark(character) ? [character] : [], wordIndex });
      continue;
    }
    const current = units[units.length - 1];
    if (isMark(character)) {
      current.text += character;
      current.marks.push(character);
    } else {
      units.push({ text: character, base: character, marks: [], wordIndex });
    }
  }

  return units;
}

function nextUnit(flat: FlatUnit[], position: number): FlatUnit | undefined {
  for (let index = position + 1; index < flat.length; index++) {
    if (flat[index].base.length > 0) return flat[index];
  }
  return undefined;
}

function previousUnit(flat: FlatUnit[], position: number): FlatUnit | undefined {
  for (let index = position - 1; index >= 0; index--) {
    if (flat[index].base.length > 0) return flat[index];
  }
  return undefined;
}

function has(unit: Unit, mark: string): boolean {
  return unit.marks.includes(mark);
}

function hasTanween(unit: Unit): boolean {
  return TANWEEN_MARKS.some((mark) => unit.marks.includes(mark));
}

function isHamzaBearing(unit: FlatUnit): boolean {
  return (
    HAMZA_LETTERS.has(unit.base) ||
    has(unit, '\u0654') ||
    has(unit, '\u0655') ||
    (unit.base === '\u0627' && has(unit, MADDAH))
  );
}

/** Decides the rule for a single letter unit, or `undefined` when unclassified. */
function classify(flat: FlatUnit[], position: number): TajweedRule | undefined {
  const unit = flat[position];
  if (!unit || unit.base.length === 0) return undefined;

  const following = nextUnit(flat, position);
  const preceding = previousUnit(flat, position);

  // Iqlab is explicitly marked in the Uthmani script.
  if (has(unit, SMALL_HIGH_MEEM) || has(unit, SMALL_LOW_MEEM)) return 'iqlab';

  // Letters the Mushaf marks as written-but-not-recited.
  if (has(unit, SMALL_HIGH_ROUNDED_ZERO) || has(unit, SMALL_WAW) || has(unit, SMALL_YEH)) {
    return 'silent';
  }

  // Ghunnah: Noon or Meem carrying Shaddah.
  if ((unit.base === '\u0646' || unit.base === '\u0645') && has(unit, SHADDA)) {
    return 'ghunnah';
  }

  // Noon Sakinah / Tanween before another letter.
  const noonSakinah = unit.base === '\u0646' && has(unit, SUKUN);
  if ((noonSakinah || hasTanween(unit)) && following) {
    if (IDGHAM_WITH_GHUNNAH.has(following.base)) return 'idgham_with_ghunnah';
    if (IDGHAM_WITHOUT_GHUNNAH.has(following.base)) return 'idgham_without_ghunnah';
    if (IKHFA_LETTERS.has(following.base)) return 'ikhfa';
    if (IZHAR_LETTERS.has(following.base)) return 'izhar';
    return undefined;
  }

  // Qalqalah: one of ق ط ب ج د carrying Sukoon.
  if (QALQALAH_LETTERS.has(unit.base) && has(unit, SUKUN)) return 'qalqalah';

  // Madd: a long-vowel carrier or the Superscript (dagger) Alef.
  const carriesOwnHarakah =
    has(unit, FATHA) || has(unit, DAMMA) || has(unit, KASRA) || hasTanween(unit);

  const isMaddCarrier =
    has(unit, SUPERSCRIPT_ALEF) ||
    (unit.base === '\u0627' && !has(unit, SUKUN)) ||
    (unit.base === '\u0648' && !carriesOwnHarakah && previousUnitHas(preceding, DAMMA)) ||
    ((unit.base === '\u064A' || unit.base === '\u0649') &&
      !carriesOwnHarakah &&
      previousUnitHas(preceding, KASRA));

  if (!isMaddCarrier) return undefined;

  if (following) {
    if (isHamzaBearing(following)) return 'madd_obligatory';
    if (has(following, SUKUN) || has(following, SHADDA)) return 'madd_obligatory';
  }
  return 'madd_normal';
}

function previousUnitHas(unit: FlatUnit | undefined, mark: string): boolean {
  if (!unit) return false;
  return unit.marks.includes(mark);
}

/**
 * Parses Arabic verse text into Tajweed-classified segments.
 *
 * Segments concatenate back to the input exactly, and each carries its word index
 * so callers can colour individual words without splitting them into `inline-block`
 * boxes (which would break Arabic letter joining).
 */
export function analyzeTajweed(surah: number, ayah: number, textUthmani: string): TajweedData {
  const tokens = tokenizeVerse(textUthmani);
  const segments: TajweedSegment[] = [];

  // Build the flat unit list first: Idgham and Madd rules look across word bounds.
  const words: Array<{ tokenIndex: number; units: Unit[] }> = [];
  const flat: FlatUnit[] = [];
  let wordCounter = 0;

  tokens.forEach((token, tokenIndex) => {
    if (token.kind !== 'word') return;
    // Two kinds of token are not words and must not consume a word index: an end-of-ayah
    // marker, and a standalone waqf/annotation sign such as `ۚ`.
    //
    // The second check has to be byte-for-byte the same rule `AlQuranCloudProvider.buildWords`
    // applies. The index minted here is used by the reader to look up the Nth entry of
    // `Verse.words`, so if one tokenizer counts a pause mark and the other does not, every
    // Tajweed colour after that mark is painted onto the wrong word — measured at +8 words of
    // drift in Ayat al-Kursi when only `buildWords` filtered them.
    if (token.text.replace(AYAH_MARKER_PATTERN, '').trim().length === 0) return;
    if (isMarkOnlyToken(token.text)) return;
    const units = buildUnits(token.text, wordCounter);
    words.push({ tokenIndex, units });
    for (const unit of units) {
      flat.push({ ...unit, position: flat.length });
    }
    wordCounter += 1;
  });

  const rulesByUnit = flat.map((_, position) => classify(flat, position));

  let flatCursor = 0;
  let wordCursor = 0;

  tokens.forEach((token, tokenIndex) => {
    if (token.kind === 'space') {
      segments.push({ text: token.text });
      return;
    }

    const word = words[wordCursor];
    if (!word || word.tokenIndex !== tokenIndex) {
      // Neutral token (an isolated ayah marker, for instance).
      segments.push({ text: token.text });
      return;
    }

    word.units.forEach((unit) => {
      const rule = rulesByUnit[flatCursor] ?? undefined;
      flatCursor += 1;
      segments.push({
        text: unit.text,
        rule,
        ruleName: rule ? TAJWEED_META[rule].name : undefined,
        description: rule ? TAJWEED_META[rule].description : undefined,
        wordIndex: unit.wordIndex,
      });
    });

    wordCursor += 1;
  });

  return { surah, ayah, segments };
}

/**
 * Groups segments by word index for per-word rendering (word 0 = first word).
 *
 * The index is **positional within `Verse.words`**, not `QuranWord.wordIndex` (which is
 * 1-based). `AyahItem` therefore indexes the group with the array position of the rendered
 * word, which is exactly what `analyzeTajweed` numbers. `wordIndexFromSegments` below asserts
 * that correspondence at runtime so a future divergence is reported instead of silently
 * mis-colouring.
 */
export function groupSegmentsByWord(segments: readonly TajweedSegment[]): TajweedSegment[][] {
  const grouped: TajweedSegment[][] = [];
  for (const segment of segments) {
    const wordIndex = segment.wordIndex;
    if (typeof wordIndex !== 'number') continue;
    if (!grouped[wordIndex]) grouped[wordIndex] = [];
    grouped[wordIndex].push(segment);
  }
  return grouped;
}

/** True when any segment in the group carries a rule. */
export function wordHasTajweedRule(segments: readonly TajweedSegment[] | undefined): boolean {
  return Boolean(segments?.some((segment) => Boolean(segment.rule)));
}

/**
 * How many words the segment list describes.
 *
 * A caller that also has the verse's word list can compare this to `words.length`; the two
 * disagreeing means script text and segment indices were tokenized differently, which is the
 * only way Tajweed colouring can silently land on the wrong word.
 */
export function countSegmentWords(segments: readonly TajweedSegment[]): number {
  let highest = -1;
  for (const segment of segments) {
    if (typeof segment.wordIndex === 'number' && segment.wordIndex > highest) {
      highest = segment.wordIndex;
    }
  }
  return highest + 1;
}
