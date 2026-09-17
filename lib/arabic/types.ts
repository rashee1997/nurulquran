/**
 * Arabic Lab — typed domain schemas.
 *
 * Design contract (approved Phase 1–2 spec):
 *  1. Two registers are never mixed in one field. `classical` text is Quranic/Uthmani only;
 *     `spoken` text is Modern Standard Arabic (the taught spoken variety) only.
 *  2. Every learner-facing gloss carries BOTH English and Tamil (Tamil is the learner's bridge
 *     language for this app), and rendering filters through the existing FeedbackLanguage
 *     preference ('both' | 'en' | 'ta') — no second i18n system.
 *  3. No LLM-authored scripture: Quranic anchors carry the exact mushaf token plus a reference,
 *     and Phase 6 re-asserts them against the verified provider in `lib/quran`.
 *
 * This module is pure types + display tables: safe to import from server or client code.
 */

// ---------------------------------------------------------------------------
// Register & tracks
// ---------------------------------------------------------------------------

/** Which of the two Arabic registers a piece of text belongs to. */
export type ArabicRegister = 'classical' | 'msa';

/** Dual-track module groups. */
export type ArabicTrack = 'reading' | 'writing' | 'grammar' | 'register';

export type ArabicLabLevelId = 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6' | 'A7' | 'A8';

/** Contextual letter forms — the writing engine traces one of these at a time. */
export type LetterForm = 'isolated' | 'initial' | 'medial' | 'final';

// ---------------------------------------------------------------------------
// Sarf (morphology)
// ---------------------------------------------------------------------------

export interface ArabicRoot {
  /** The three root radicals, e.g. ['ك', 'ت', 'ب']. */
  letters: readonly [string, string, string];
  /** Display form with separators, e.g. 'ك-ت-ب'. */
  display: string;
  /** Semantic core (English). */
  meaningEn: string;
  /** Semantic core (Tamil bridge). */
  meaningTa: string;
}

/** Classical patterns (awzān) used by this curriculum. */
export type WaznId =
  | 'faʿala' // فَعَلَ  — form I verb
  | 'faʿila' // فَعِلَ
  | 'faʿʿala' // فَعَّلَ — form II (causative/intensive)
  | 'fāʿala' // فَاعَلَ — form III
  | 'tafāʿala' // تَفَاعَلَ — form V
  | 'iftaʿala' // اِفْتَعَلَ — form VIII
  | 'istafʿala' // اِسْتَفْعَلَ — form X
  | 'faʿal' // فَعَل — noun
  | 'faʿl' // فَعْل — verbal noun / noun
  | 'fiʿāl' // فِعَال — noun
  | 'fuʿūl' // فُعُول — plural
  | 'fāʿil' // فَاعِل — active participle
  | 'mafʿūl' // مَفْعُول — passive participle
  | 'mifʿal' // مِفْعَل
  | 'mafʿil' // مَفْعِل
  | 'mafʿala' // مَفْعَلَة — noun of place
  | 'mufʿil' // مُفْعِل — form IV active participle
  | 'mufaʿʿil' // مُفَعِّل — form II active participle
  | 'faʿʿāl' // فَعَّال — intensive
  | 'faʿlān' // فَعْلَان
  | 'faʿīl' // فَعِيل
  | 'fawʿal'; // فَوْعَل

/** Display table for awzān. */
export const WAZN_ARABIC: Record<WaznId, string> = {
  faʿala: 'فَعَلَ',
  faʿila: 'فَعِلَ',
  faʿʿala: 'فَعَّلَ',
  fāʿala: 'فَاعَلَ',
  tafāʿala: 'تَفَاعَلَ',
  iftaʿala: 'اِفْتَعَلَ',
  istafʿala: 'اِسْتَفْعَلَ',
  faʿal: 'فَعَل',
  faʿl: 'فَعْل',
  fiʿāl: 'فِعَال',
  fuʿūl: 'فُعُول',
  fāʿil: 'فَاعِل',
  mafʿūl: 'مَفْعُول',
  mifʿal: 'مِفْعَل',
  mafʿil: 'مَفْعِل',
  mafʿala: 'مَفْعَلَة',
  mufʿil: 'مُفْعِل',
  mufaʿʿil: 'مُفَعِّل',
  faʿʿāl: 'فَعَّال',
  faʿlān: 'فَعْلَان',
  faʿīl: 'فَعِيل',
  fawʿal: 'فَوْعَل',
};

/** Classical ten verb forms. */
export type VerbForm = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

// ---------------------------------------------------------------------------
// Nahw (syntax / iʿrāb)
// ---------------------------------------------------------------------------

export type IrabCase = 'rafʿ' | 'nasb' | 'jarr' | 'jazm' | 'mabnī';

export type IrabSign = 'damma' | 'fatha' | 'kasra' | 'sukun' | 'alif' | 'waw' | 'ya' | 'none';

export type IrabRole =
  | 'mubtadaʾ' // subject of a nominal sentence
  | 'khabar' // predicate
  | 'fāʿil' // doer of a verb
  | 'mafʿūl bihi' // direct object
  | 'majrūr' // governed by a preposition
  | 'mudāf' // first term of iḍāfa
  | 'mudāf ilayhi' // second term of iḍāfa
  | 'naʿt' // adjective
  | 'badal' // appositive
  | 'hāl' // circumstantial
  | 'ism inna' // subject of إنَّ
  | 'khabar inna' // predicate of إنَّ
  | 'fīl'; // verb form

/** How a classical case ending behaves when the same phrase is spoken in MSA. */
export type SpokenCaseBehavior =
  | 'retained' // long-vowel / intrinsic endings survive speech
  | 'neutralized' // short case vowel or tanwīn is dropped
  | 'absorbed' // ending fuses into the following word
  | 'replaced-by-pronoun'; // noun is replaced by a pronoun + suffix in speech

export interface IrabParse {
  case: IrabCase;
  sign: IrabSign;
  role: IrabRole;
  /** Why this word takes this ending (English). */
  explanationEn: string;
  /** Why this word takes this ending (Tamil bridge). */
  explanationTa: string;
  /** What happens to the ending in spoken MSA. */
  spokenBehavior: SpokenCaseBehavior;
  spokenNoteEn: string;
  spokenNoteTa: string;
}

// ---------------------------------------------------------------------------
// Quranic anchors (classical register only)
// ---------------------------------------------------------------------------

export interface AyahRef {
  surah: number; // 1..114
  ayah: number; // 1-based within the surah
}

export interface QuranicAnchor {
  ref: AyahRef;
  /** Exact Uthmani token as it appears in the mushaf (with diacritics). */
  token: string;
  /** Full ayah in Uthmani script, for context. */
  ayahTextUthmani: string;
  /** 1-based word position of `token` inside the ayah, when it is a single word. */
  wordIndex?: number;
  /** Deterministic tajweed rule for this token, matching TajweedRule in lib/quran/types. */
  tajweedRule?: string;
  irab: IrabParse;
}

// ---------------------------------------------------------------------------
// Spoken register (Modern Standard Arabic) + Tamil bridge
// ---------------------------------------------------------------------------

export type DialectVariety = 'gulf' | 'levantine' | 'egyptian' | 'maghrebi' | 'other';

export interface SpokenForm {
  /** The phrase as actually spoken in Modern Standard Arabic (fully vowelled). */
  msa: string;
  transliteration: string;
  /** English meaning of the spoken phrase. */
  glossEn: string;
  /** Tamil bridge meaning — always present for this curriculum. */
  glossTa: string;
  /** Optional single dialect note. MSA remains the taught variety. */
  dialectNote?: {
    variety: DialectVariety;
    text: string;
    glossTa: string;
  };
}

/** How the classical word maps onto the spoken sentence. */
export type RegisterRelationship =
  | 'identical' // same wording in both registers
  | 'ending-dropped' // case ending disappears in speech
  | 'ending-retained' // ending is a long vowel / intrinsic and survives
  | 'case-changed' // same word, governed differently by the spoken sentence
  | 'replaced-by-preposition'
  | 'replaced-by-pronoun'
  | 'word-order-shift'
  | 'lexical-shift' // a different but related lexicon item is used in speech
  | 'root-derived'; // no Quranic occurrence; built from an anchored root

export interface RegisterBridge {
  relationship: RegisterRelationship;
  noteEn: string;
  noteTa: string;
}

// ---------------------------------------------------------------------------
// Lexical spine
// ---------------------------------------------------------------------------

export interface ArabicEntry {
  /** Stable id referenced by lessons, activities and progress records. */
  id: string;
  /** Dictionary/lemma form. */
  lemma: string;
  transliteration: string;
  root?: ArabicRoot;
  wazn?: WaznId;
  verbForm?: VerbForm;
  /**
   * Classical anchor. Required when `requiresAnchor` is true (bridge/grammar
   * lessons); absent for everyday MSA vocabulary with no Quranic occurrence.
   */
  quranic?: QuranicAnchor;
  /** Enforced by `validateArabicLabCurriculum()`. */
  requiresAnchor: boolean;
  /** The spoken-register counterpart, with English + Tamil glosses. */
  spoken: SpokenForm;
  bridge: RegisterBridge;
  /** For 'root-derived' entries: the anchored entry whose root this word is built from. */
  derivedFromEntryId?: string;
  tags?: readonly ArabicEntryTag[];
}

export type ArabicEntryTag = 'noun' | 'verb' | 'participle' | 'proper-noun' | 'everyday';

// ---------------------------------------------------------------------------
// Conversational dialogs (spoken track)
// ---------------------------------------------------------------------------

export interface DialogTurn {
  speaker: 'learner' | 'teacher';
  /** Modern Standard Arabic only — never mixed with Uthmani text. */
  arabicMsa: string;
  transliteration: string;
  glossEn: string;
  glossTa: string;
}

export interface ArabicDialog {
  id: string;
  titleEn: string;
  titleTa: string;
  titleArabic: string;
  scenarioEn: string;
  scenarioTa: string;
  /** Entries the learner should already own before this dialog. */
  targetEntryIds: readonly string[];
  turns: readonly DialogTurn[];
}

// ---------------------------------------------------------------------------
// Writing engine schemas (paths authored in the writing slice)
// ---------------------------------------------------------------------------

export interface StrokePoint {
  /** Normalized 0..1 inside the letter box. */
  x: number;
  y: number;
}

export type StrokeDirection =
  | 'right-to-left'
  | 'left-to-right'
  | 'top-to-bottom'
  | 'bottom-to-top'
  | 'clockwise'
  | 'counter-clockwise';

export interface StrokePath {
  /** Ordered pen path; index 0 is the pen-down point. */
  points: readonly StrokePoint[];
  /** 1-based stroke order for this letter/form. */
  order: number;
  direction: StrokeDirection;
}

export interface LetterStrokeModel {
  letterId: string; // must match an id in lib/audio/alphabet-audio ARABIC_ALPHABET
  form: LetterForm;
  /** Where the baseline sits inside the letter box (0..1). */
  baselineRatio: number;
  dotCount: number;
  strokes: readonly StrokePath[];
}

// ---------------------------------------------------------------------------
// Lesson entities
// ---------------------------------------------------------------------------

/** The rule pair every grammar lesson must state: classical ↔ spoken. */
export interface RulePair {
  ruleNameEn: string;
  ruleNameTa: string;
  classical: { arabic: string; noteEn: string; noteTa: string };
  spoken: { arabic: string; noteEn: string; noteTa: string };
  transferNoteEn: string;
  transferNoteTa: string;
}

interface ArabicLabActivityBase {
  id: string;
  track: ArabicTrack;
  title: string;
  instructionEn: string;
  instructionTa: string;
  /** Lexicon entries this activity drills. */
  entryIds: readonly string[];
  xpReward: number;
}

/** Multiple-choice family: iʿrāb, spoken equivalent, vowel placement, joined form, or root pattern. */
export interface ArabicLabChoiceActivity extends ArabicLabActivityBase {
  type: 'irab_parse' | 'register_compare' | 'tashkeel_placement' | 'letter_join' | 'sarf_match';
  options: readonly string[];
  correctAnswer: string;
  explanationEn: string;
  explanationTa: string;
}

/** Handwriting: trace the guided stroke model for one letter form. */
export interface ArabicLabStrokeActivity extends ArabicLabActivityBase {
  type: 'stroke_trace';
  writing: { letterId: string; form: LetterForm };
}

/** Spoken production: arrange MSA tokens into the target sentence. */
export interface ArabicLabBuildActivity extends ArabicLabActivityBase {
  type: 'spoken_build';
  tokens: readonly string[];
  correctAnswer: string;
  explanationEn: string;
  explanationTa: string;
}

/** Listening/speaking drill driven by a dialog. */
export interface ArabicLabDialogueActivity extends ArabicLabActivityBase {
  type: 'dialogue_listen';
  dialogId: string;
}

/** Write what you hear, then compare against the spoken-register sentence. */
export interface ArabicLabDictationActivity extends ArabicLabActivityBase {
  type: 'dictation';
  dictationText: string;
  explanationEn: string;
  explanationTa: string;
}

export type ArabicLabActivity =
  | ArabicLabChoiceActivity
  | ArabicLabStrokeActivity
  | ArabicLabBuildActivity
  | ArabicLabDialogueActivity
  | ArabicLabDictationActivity;

export type ArabicLabActivityType = ArabicLabActivity['type'];

export interface ArabicLabLesson {
  id: string;
  level: ArabicLabLevelId;
  track: ArabicTrack;
  title: string;
  titleArabic: string;
  objectiveEn: string;
  objectiveTa: string;
  estimatedMinutes: number;
  xpReward: number;
  /** Present on grammar/register lessons: the classical rule and its spoken equivalent. */
  rulePair?: RulePair;
  activities: readonly ArabicLabActivity[];
}

export interface ArabicLabLevel {
  id: ArabicLabLevelId;
  index: number;
  title: string;
  titleArabic: string;
  summaryEn: string;
  summaryTa: string;
  /** Tracks exercised in this level. */
  tracks: readonly ArabicTrack[];
  /** Mirrors the XP-gated unlock style of the existing Tajweed curriculum. */
  requiredXp: number;
  lessons: readonly ArabicLabLesson[];
}

// ---------------------------------------------------------------------------
// Persistence (Dexie v3 record, wired when the lab route ships)
// ---------------------------------------------------------------------------

export interface ArabicLabProgress {
  id: string; // 'default_user'
  completedLessonIds: readonly string[];
  masteredEntryIds: readonly string[];
  /** letterId + form key -> best stroke score 0..100. */
  strokeScores: Readonly<Record<string, number>>;
  updatedAt: string;
}
