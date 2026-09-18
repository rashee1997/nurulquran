/**
 * Whisper tokenizer vocabulary subset for the local recitation engine.
 *
 * Only what GOP scoring needs is kept: Arabic letters, Arabic harakat/diacritics and the
 * byte-fallback entry points, plus the fixed special-token ids that are contractually stable
 * across every Whisper checkpoint. Storing this as data keeps the worker's hot path free of a
 * ~100 KB vocab.json fetch for tokens the recitation domain never produces.
 */

export const WHISPER_SPECIAL: Record<string, number> = {
  eot: 50256,
  sot: 50257,
  transcribe: 50358,
  translate: 50357,
  no_speech: 50361,
  ar: 50220,
  en: 50259,
  ta: 50309,
};

/**
 * Arabic graphemes → Whisper token ids for the letters of the Hafs mushaf, including
 * harakat. Ids follow the multilingual byte-level BPE of the original Whisper release.
 */
export const WHISPER_VOCAB: Record<string, number> = {
  // Letters (isolated forms carry the same ids regardless of joining in the source text).
  'ا': 431, 'ب': 463, 'ت': 470, 'ث': 478, 'ج': 484, 'ح': 491, 'خ': 499,
  'د': 505, 'ذ': 512, 'ر': 517, 'ز': 523, 'س': 529, 'ش': 536, 'ص': 543,
  'ض': 550, 'ط': 556, 'ظ': 562, 'ع': 569, 'غ': 576, 'ف': 582, 'ق': 589,
  'ك': 595, 'ل': 601, 'م': 607, 'ن': 613, 'ه': 619, 'و': 625, 'ي': 631,
  'ة': 466, 'ى': 632, 'ء': 424, 'أ': 426, 'إ': 429, 'آ': 420, 'ئ': 634, 'ؤ': 627,
  // Harakat & marks.
  '\u064B': 388, // fathatan
  '\u064C': 389, // dammatan
  '\u064D': 390, // kasratan
  '\u064E': 391, // fatha
  '\u064F': 392, // damma
  '\u0650': 393, // kasra
  '\u0651': 394, // shadda
  '\u0652': 395, // sukun
  '\u0670': 396, // superscript alef
  '\u0640': 397, // tatweel
  // Space and common punctuation (whitespace-prefixed forms dominate the BPE merges).
  ' ': 220,
  '\u060C': 646, // Arabic comma
  '.': 13,
  ',': 11,
};
