/**
 * Arabic Lab — register bridge projection.
 *
 * Turns a lexical entry into exactly what the UI renders, with three guarantees:
 *  1. the classical and spoken registers are separate rows, never merged;
 *  2. English and Tamil glosses are filtered by the app-wide FeedbackLanguage
 *     preference ('both' | 'en' | 'ta') instead of a second i18n system;
 *  3. no DOM / Dexie / network — pure functions, safe on server and client.
 */

import { normalizeFeedbackLanguage, type FeedbackLanguage } from '@/lib/i18n/language';
import { WAZN_ARABIC } from './types';
import type {
  ArabicEntry,
  IrabCase,
  IrabRole,
  IrabSign,
  RegisterRelationship,
  SpokenCaseBehavior,
} from './types';

export interface BilingualText {
  en: string;
  ta: string;
}

/** Arabic + both target languages for one grammar label. */
export interface LabeledText {
  arabic: string;
  en: string;
  ta: string;
}

export interface RenderedGloss {
  language: 'en' | 'ta';
  text: string;
}

export const IRAB_CASE_LABELS: Record<IrabCase, LabeledText> = {
  rafʿ: { arabic: 'رَفْع', en: 'Rafʿ (nominative)', ta: 'ரஃப் (எழுவாய் நிலை)' },
  nasb: { arabic: 'نَصْب', en: 'Naṣb (accusative)', ta: 'நஸ்ப் (பொருள் நிலை)' },
  jarr: { arabic: 'جَرّ', en: 'Jarr (genitive)', ta: 'ஜர் (உடைமை நிலை)' },
  jazm: { arabic: 'جَزْم', en: 'Jazm (jussive)', ta: 'ஜஸ்ம் (வினை மறுப்பு நிலை)' },
  mabnī: { arabic: 'مَبْنِيّ', en: 'Mabnī (indeclinable)', ta: 'மப்னீ (மாற்றமில்லாதது)' },
};

export const IRAB_SIGN_LABELS: Record<IrabSign, LabeledText> = {
  damma: { arabic: 'الضَّمَّة', en: 'Damma (-u)', ta: 'தம்மா (-உ)' },
  fatha: { arabic: 'الْفَتْحَة', en: 'Fatha (-a)', ta: 'ஃபத்ஹா (-அ)' },
  kasra: { arabic: 'الْكَسْرَة', en: 'Kasra (-i)', ta: 'கஸ்ரா (-இ)' },
  sukun: { arabic: 'السُّكُون', en: 'Sukūn (no vowel)', ta: 'சுகூன் (உயிரொலி இல்லை)' },
  alif: { arabic: 'الْأَلِف', en: 'Alif (dual)', ta: 'அலிஃப் (இரட்டை)' },
  waw: { arabic: 'الْوَاو', en: 'Wāw (sound plural)', ta: 'வாவ் (ஒலிப் பன்மை)' },
  ya: { arabic: 'الْيَاء', en: 'Yāʾ (sound plural)', ta: 'யா (ஒலிப் பன்மை)' },
  none: { arabic: 'لَا عَلَامَة', en: 'No ending (fixed form)', ta: 'முடிவு இல்லை (நிலையான வடிவம்)' },
};

export const IRAB_ROLE_LABELS: Record<IrabRole, LabeledText> = {
  'mubtadaʾ': { arabic: 'مُبْتَدَأ', en: 'Mubtadaʾ (subject of a nominal sentence)', ta: 'முப்ததா (பெயர் வாக்கிய எழுவாய்)' },
  khabar: { arabic: 'خَبَر', en: 'Khabar (predicate)', ta: 'கபர் (பயனிலை)' },
  'fāʿil': { arabic: 'فَاعِل', en: 'Fāʿil (doer of the verb)', ta: 'ஃபாஇல் (வினை செய்பவர்)' },
  'mafʿūl bihi': { arabic: 'مَفْعُول بِهِ', en: 'Mafʿūl bihi (direct object)', ta: 'மஃப்ஊல் பிஹி (நேரடிப் பொருள்)' },
  'majrūr': { arabic: 'مَجْرُور', en: 'Majrūr (governed by a preposition)', ta: 'மஜ்ரூர் (முன்னிடையால் ஆளப்படுவது)' },
  'mudāf': { arabic: 'مُضَاف', en: 'Muḍāf (first term of iḍāfa)', ta: 'முழாஃப் (இளாஃபாவின் முதல் சொல்)' },
  'mudāf ilayhi': { arabic: 'مُضَاف إِلَيْه', en: 'Muḍāf ilayhi (second term of iḍāfa)', ta: 'முழாஃப் இலைஹி (இளாஃபாவின் இரண்டாம் சொல்)' },
  'naʿt': { arabic: 'نَعْت', en: 'Naʿt (adjective)', ta: 'நஃத் (பெயரடை)' },
  badal: { arabic: 'بَدَل', en: 'Badal (appositive)', ta: 'பதல் (விளக்கும் சொல்)' },
  'hāl': { arabic: 'حَال', en: 'Ḥāl (circumstantial)', ta: 'ஹால் (நிலை விவரிப்பு)' },
  'ism inna': { arabic: 'اسْم إِنَّ', en: 'Ism of إِنَّ (its subject)', ta: 'இஸ்ம் இன்ன (إِنَّ இன் எழுவாய்)' },
  'khabar inna': { arabic: 'خَبَر إِنَّ', en: 'Khabar of إِنَّ (its predicate)', ta: 'கபர் இன்ன (إِنَّ இன் பயனிலை)' },
  'fīl': { arabic: 'فِعْل', en: 'Fiʿl (verb form)', ta: 'ஃபிஃல் (வினை வடிவம்)' },
};

export const SPOKEN_BEHAVIOR_LABELS: Record<SpokenCaseBehavior, LabeledText> = {
  retained: { arabic: 'يَبْقَى فِي الْكَلَام', en: 'Retained in speech', ta: 'பேச்சில் நிலைக்கும்' },
  neutralized: { arabic: 'يُخْفَى فِي الْكَلَام', en: 'Silenced in speech', ta: 'பேச்சில் அமைதியாகும்' },
  absorbed: { arabic: 'يَنْدَمِجُ فِيمَا بَعْدَه', en: 'Absorbed into the next word', ta: 'அடுத்த சொல்லில் கலக்கும்' },
  'replaced-by-pronoun': { arabic: 'يُسْتَبْدَلُ بِضَمِير', en: 'Replaced by a pronoun suffix', ta: 'பிரதிப்பெயரால் மாற்றப்படும்' },
};

export const REGISTER_RELATIONSHIP_LABELS: Record<RegisterRelationship, LabeledText> = {
  identical: { arabic: 'مُتَطَابِق', en: 'Identical in both registers', ta: 'இரு நிலைகளிலும் ஒன்றே' },
  'ending-dropped': { arabic: 'تَسْقُطُ الْحَرَكَة', en: 'Ending dropped', ta: 'முடிவு விழும்' },
  'ending-retained': { arabic: 'تَبْقَى الْحَرَكَة', en: 'Ending retained', ta: 'முடிவு நிலைக்கும்' },
  'case-changed': { arabic: 'يَتَغَيَّرُ الْإِعْرَاب', en: 'Case changes with the governing word', ta: 'ஆளும் சொல்லைப் பொறுத்து இஃராப் மாறும்' },
  'replaced-by-preposition': { arabic: 'يُسْتَبْدَلُ بِحَرْفِ جَرّ', en: 'Replaced by a prepositional phrase', ta: 'முன்னிடைத் தொடரால் மாற்றப்படும்' },
  'replaced-by-pronoun': { arabic: 'يُسْتَبْدَلُ بِضَمِير', en: 'Replaced by a pronoun', ta: 'பிரதிப்பெயரால் மாற்றப்படும்' },
  'word-order-shift': { arabic: 'تَتَغَيَّرُ الْجُمْلَة', en: 'Word order shifts', ta: 'சொல் வரிசை மாறும்' },
  'lexical-shift': { arabic: 'يُسْتَخْدَمُ لَفْظٌ قَرِيب', en: 'A related word is used instead', ta: 'நெருங்கிய வேறொரு சொல் பயன்படும்' },
  'root-derived': { arabic: 'مُشْتَقّ مِنَ الْجَذْرِ', en: 'Derived from an anchored root (no Quranic occurrence)', ta: 'குர்ஆன் வேரிலிருந்து பிறந்தது (குர்ஆனில் இல்லை)' },
};

/** Filters a bilingual string pair down to what the learner asked to see. */
export function pickBilingual(text: BilingualText, language?: FeedbackLanguage | null): RenderedGloss[] {
  const preference = normalizeFeedbackLanguage(language);
  const glosses: RenderedGloss[] = [];

  if (preference !== 'ta' && text.en) {
    glosses.push({ language: 'en', text: text.en });
  }
  if (preference !== 'en' && text.ta) {
    glosses.push({ language: 'ta', text: text.ta });
  }
  // Never render an empty card: fall back to whichever language exists.
  if (glosses.length === 0) {
    const fallback = text.en || text.ta;
    if (fallback) {
      glosses.push({ language: text.en ? 'en' : 'ta', text: fallback });
    }
  }

  return glosses;
}

export interface RegisterBridgeView {
  entryId: string;
  lemma: string;
  transliteration: string;
  /** Classical row — present only when the entry is anchored to the mushaf. */
  classical?: {
    label: LabeledText;
    arabic: string;
    ayahRef: { surah: number; ayah: number };
    ayahTextUthmani: string;
    lemma: string;
    tajweedRule?: string;
  };
  /** Spoken row — always present, always MSA. */
  spoken: {
    label: LabeledText;
    arabic: string;
    transliteration: string;
    glosses: RenderedGloss[];
    dialectNote?: { variety: string; text: string; glossTa: string };
  };
  irab?: {
    case: LabeledText;
    sign: LabeledText;
    role: LabeledText;
    /** Free prose, not a grammar label — English + Tamil only. */
    explanation: BilingualText;
    spokenBehavior: LabeledText;
    spokenNote: BilingualText;
  };
  bridge: {
    relationship: LabeledText;
    note: BilingualText;
    derivedFromEntryId?: string;
    waznArabic?: string;
    rootDisplay?: string;
    rootMeaning: BilingualText;
  };
}

const CLASSICAL_LABEL: LabeledText = {
  arabic: 'النَّصُّ الْقُرْآنِيّ',
  en: 'Classical (Uthmani)',
  ta: 'குர்ஆன் நடை (உத்மானி)',
};

const SPOKEN_LABEL: LabeledText = {
  arabic: 'الْعَرَبِيَّةُ الْمُعَاصِرَة',
  en: 'Spoken (Modern Standard Arabic)',
  ta: 'பேச்சு நடை (நவீன நிலையான அரபி)',
};

/**
 * Builds the two-row register bridge the lesson UI renders for one entry,
 * honouring the learner's English / Tamil / bilingual preference.
 */
export function buildRegisterBridgeView(
  entry: ArabicEntry,
  language?: FeedbackLanguage | null
): RegisterBridgeView {
  const preference = normalizeFeedbackLanguage(language);
  const bilingual = (en: string, ta: string): BilingualText => ({ en, ta });

  const view: RegisterBridgeView = {
    entryId: entry.id,
    lemma: entry.lemma,
    transliteration: entry.transliteration,
    spoken: {
      label: SPOKEN_LABEL,
      arabic: entry.spoken.msa,
      transliteration: entry.spoken.transliteration,
      glosses: pickBilingual(
        bilingual(entry.spoken.glossEn, entry.spoken.glossTa),
        preference
      ),
      dialectNote: entry.spoken.dialectNote,
    },
    bridge: {
      relationship: REGISTER_RELATIONSHIP_LABELS[entry.bridge.relationship],
      note: bilingual(entry.bridge.noteEn, entry.bridge.noteTa),
      derivedFromEntryId: entry.derivedFromEntryId,
      waznArabic: entry.wazn ? WAZN_ARABIC[entry.wazn] : undefined,
      rootDisplay: entry.root?.display,
      rootMeaning: bilingual(entry.root?.meaningEn ?? '', entry.root?.meaningTa ?? ''),
    },
  };

  if (entry.quranic) {
    view.classical = {
      label: CLASSICAL_LABEL,
      arabic: entry.quranic.token,
      ayahRef: entry.quranic.ref,
      ayahTextUthmani: entry.quranic.ayahTextUthmani,
      lemma: entry.lemma,
      tajweedRule: entry.quranic.tajweedRule,
    };
    view.irab = {
      case: IRAB_CASE_LABELS[entry.quranic.irab.case],
      sign: IRAB_SIGN_LABELS[entry.quranic.irab.sign],
      role: IRAB_ROLE_LABELS[entry.quranic.irab.role],
      explanation: bilingual(entry.quranic.irab.explanationEn, entry.quranic.irab.explanationTa),
      spokenBehavior: SPOKEN_BEHAVIOR_LABELS[entry.quranic.irab.spokenBehavior],
      spokenNote: bilingual(entry.quranic.irab.spokenNoteEn, entry.quranic.irab.spokenNoteTa),
    };
  }

  return view;
}
