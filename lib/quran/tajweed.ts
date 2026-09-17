import { TajweedData, TajweedRule, TajweedSegment } from './types';

// Arabic unicode codepoints
// Qalqalah letters: ق ط ب ج د
const QALQALAH_LETTERS = new Set(['ق', 'ط', 'ب', 'ج', 'د']);
// Noon with shaddah or Meem with shaddah -> Ghunnah
// Madd letters: ا و ي with maddah ~
const MADDAH = '\u0653'; // superscript maddah ~
const SHADDAH = '\u0651'; // shaddah ّ
const SUKOON = '\u0652'; // sukoon ْ
const TANWEEN = ['\u064B', '\u064C', '\u064D']; // fathan, dammatan, kasratan

export interface TajweedRuleMeta {
  colorClass: string;
  name: string;
  nameTa: string;
  description: string;
}

export const TAJWEED_META: Record<TajweedRule, TajweedRuleMeta> = {
  ghunnah: {
    colorClass: 'text-amber-600 dark:text-amber-400 font-semibold',
    name: 'Ghunnah (Nasalization)',
    nameTa: 'குன்னா (மூக்கொலி)',
    description: 'Nasalization sound held for 2 counts on Noon or Meem with Shaddah.',
  },
  qalqalah: {
    colorClass: 'text-blue-600 dark:text-blue-400 font-semibold',
    name: 'Qalqalah (Echo / Bouncing)',
    nameTa: 'கல்கலா (எதிரொலித்தல்)',
    description: 'Echoing or bouncing sound on letters: ق ط ب ج د with Sukoon or stopping.',
  },
  idgham_with_ghunnah: {
    colorClass: 'text-emerald-600 dark:text-emerald-400 font-semibold',
    name: 'Idgham with Ghunnah',
    nameTa: 'இட்காம் (மூக்கொலியுடன் கலத்தல்)',
    description: 'Merging Noon Sakinah or Tanween into ي ن م و with nasal sound for 2 counts.',
  },
  idgham_without_ghunnah: {
    colorClass: 'text-teal-700 dark:text-teal-300 font-semibold',
    name: 'Idgham without Ghunnah',
    nameTa: 'இட்காம் (மூக்கொலி இன்றி கலத்தல்)',
    description: 'Merging Noon Sakinah or Tanween completely into ل or ر with no nasal sound.',
  },
  ikhfa: {
    colorClass: 'text-rose-600 dark:text-rose-400 font-semibold',
    name: 'Ikhfa (Concealment)',
    nameTa: 'இக்ஃபா (மறைத்து ஓதுதல்)',
    description: 'Concealing Noon Sakinah or Tanween when followed by the 15 Ikhfa letters with nasalization.',
  },
  iqlab: {
    colorClass: 'text-purple-600 dark:text-purple-400 font-semibold',
    name: 'Iqlab (Conversion)',
    nameTa: 'இக்லாப் (மாற்றுதல்)',
    description: 'Converting Noon Sakinah or Tanween into Meem when followed by Baa (ب).',
  },
  madd_normal: {
    colorClass: 'text-indigo-600 dark:text-indigo-400 font-semibold',
    name: 'Madd Asli (Natural Elongation)',
    nameTa: 'மத்து அஸ்லி (இயற்கை நீட்டல்)',
    description: 'Natural elongation of 2 harakat on Alif, Waw, or Yaa.',
  },
  madd_obligatory: {
    colorClass: 'text-red-600 dark:text-red-400 font-bold',
    name: 'Madd Lazim / Wajib (Long Elongation)',
    nameTa: 'மத்து வாஜிப் / லாஸிம் (4-6 நீட்டல்)',
    description: 'Extended elongation of 4 to 6 counts due to Hamzah or Sukoon after Madd letter.',
  },
  silent: {
    colorClass: 'text-slate-400 dark:text-slate-500 line-through opacity-75',
    name: 'Silent Letter',
    nameTa: 'ஓதப்படாத எழுத்து',
    description: 'Unpronounced letter during continuous recitation (e.g., Hamzatul Wasl, silent Alif).',
  },
};

/**
 * Parses Arabic verse text into segmented tokens with Tajweed classification
 */
export function analyzeTajweed(surah: number, ayah: number, textUthmani: string): TajweedData {
  const segments: TajweedSegment[] = [];
  const words = textUthmani.split(' ');

  for (let w = 0; w < words.length; w++) {
    const word = words[w];
    let i = 0;

    while (i < word.length) {
      const char = word[i];
      const nextChar = word[i + 1] || '';
      const thirdChar = word[i + 2] || '';

      // Check for Madd Obligatory (maddah ~)
      if (char === MADDAH || nextChar === MADDAH) {
        const seg = char === MADDAH ? char : char + nextChar;
        segments.push({
          text: seg,
          rule: 'madd_obligatory',
          ruleName: TAJWEED_META.madd_obligatory.name,
          description: TAJWEED_META.madd_obligatory.description,
        });
        i += seg.length;
        continue;
      }

      // Check for Ghunnah (Noon/Meem + Shaddah)
      if ((char === 'ن' || char === 'م') && nextChar === SHADDAH) {
        segments.push({
          text: char + nextChar,
          rule: 'ghunnah',
          ruleName: TAJWEED_META.ghunnah.name,
          description: TAJWEED_META.ghunnah.description,
        });
        i += 2;
        continue;
      }

      // Check for Qalqalah: Qalqalah letter + Sukoon
      if (QALQALAH_LETTERS.has(char) && (nextChar === SUKOON || nextChar === '\u06DF')) {
        segments.push({
          text: char + nextChar,
          rule: 'qalqalah',
          ruleName: TAJWEED_META.qalqalah.name,
          description: TAJWEED_META.qalqalah.description,
        });
        i += 2;
        continue;
      }

      // Check for Iqlab small meem symbol (\u06E2 or \u06ED)
      if (char === '\u06E2' || nextChar === '\u06E2' || char === '\u06ED' || nextChar === '\u06ED') {
        const token = char + (nextChar === '\u06E2' || nextChar === '\u06ED' ? nextChar : '');
        segments.push({
          text: token,
          rule: 'iqlab',
          ruleName: TAJWEED_META.iqlab.name,
          description: TAJWEED_META.iqlab.description,
        });
        i += token.length;
        continue;
      }

      // Fallback: normal letter or harakah
      // Group normal characters until next potential tajweed marker
      let normalChunk = char;
      let j = i + 1;
      while (j < word.length) {
        const c = word[j];
        const nc = word[j + 1] || '';
        if (
          c === MADDAH ||
          nc === MADDAH ||
          ((c === 'ن' || c === 'م') && nc === SHADDAH) ||
          (QALQALAH_LETTERS.has(c) && (nc === SUKOON || nc === '\u06DF')) ||
          c === '\u06E2' || nc === '\u06E2'
        ) {
          break;
        }
        normalChunk += c;
        j++;
      }

      segments.push({
        text: normalChunk,
      });
      i = j;
    }

    // Add word spacing
    if (w < words.length - 1) {
      segments.push({ text: ' ' });
    }
  }

  return { surah, ayah, segments };
}
