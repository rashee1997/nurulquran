/**
 * Arabic text helpers.
 *
 * These functions exist for *comparison only* — search and matching. Displayed
 * scripture always keeps its diacritics (Tashkeel); nothing here is ever rendered.
 */

/** Uthmani/Quranic marks: harakat, tanween, shadda, sukoon, maddah, waqf signs, small letters. */
const TASHKEEL_PATTERN =
  /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED\u08D3-\u08FF\uFEFF]/g;

/** Tatweel (kashida) is purely decorative elongation. */
const TATWEEL_PATTERN = /\u0640/g;

/** Removes diacritics and Quranic marks for comparison purposes. */
export function stripTashkeel(text: string): string {
  return text.replace(TASHKEEL_PATTERN, '').replace(TATWEEL_PATTERN, '');
}

/**
 * Normalizes Arabic for diacritic- and orthography-insensitive matching:
 * removes Tashkeel, unifies alef/ya/ta-marbuta variants, drops the standalone
 * hamza, and collapses whitespace. Latin text is lowercased instead.
 */
export function normalizeForSearch(text: string): string {
  const stripped = stripTashkeel(text);
  const unified = stripped
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627') // آ أ إ ٱ  → ا
    .replace(/\u0649/g, '\u064A') // ى → ي
    .replace(/\u0629/g, '\u0647') // ة → ه
    .replace(/\u0624/g, '\u0648') // ؤ → و
    .replace(/\u0626/g, '\u064A') // ئ → ي
    .replace(/[\u0621\u0654\u0655]/g, '') // standalone/marking hamza
    .replace(/\s+/g, ' ')
    .trim();

  return unified.toLocaleLowerCase('en');
}

/** True when `haystack` contains `needle`, ignoring diacritics and orthography variants. */
export function containsNormalized(haystack: string, needle: string): boolean {
  const normalizedNeedle = normalizeForSearch(needle);
  if (normalizedNeedle.length === 0) return false;
  return normalizeForSearch(haystack).includes(normalizedNeedle);
}
