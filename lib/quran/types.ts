export interface Chapter {
  id: number;
  nameArabic: string;
  nameSimple: string;
  nameEnglish: string;
  revelationPlace: 'makkah' | 'madinah';
  versesCount: number;
  bismillahPre: boolean;
}

export interface QuranWord {
  id: string;
  surah: number;
  ayah: number;
  wordIndex: number;
  arabic: string;
  transliteration: string;
  translationEn: string;
  translationTa: string;
  root?: string;
  morphology?: string;
  audioUrl?: string;
}

export type TajweedRule =
  | 'ghunnah'
  | 'qalqalah'
  | 'idgham_with_ghunnah'
  | 'idgham_without_ghunnah'
  | 'ikhfa'
  | 'iqlab'
  | 'izhar'
  | 'madd_normal'
  | 'madd_obligatory'
  | 'silent';

export interface TajweedSegment {
  text: string;
  rule?: TajweedRule;
  ruleName?: string;
  description?: string;
  /** 0-based word this segment belongs to, so words can be coloured without splitting them. */
  wordIndex?: number;
}

export interface TajweedData {
  surah: number;
  ayah: number;
  segments: TajweedSegment[];
}

export interface Translation {
  surah: number;
  ayah: number;
  language: 'en' | 'ta';
  text: string;
  translator?: string;
}

export interface AudioResource {
  surah: number;
  ayah: number;
  audioUrl: string;
  reciterId: string;
  duration?: number;
}

/**
 * Where a verse's text came from.
 * `verified-offline` means the exact verse was served from the audited offline
 * corpus because the network was unreachable — never a substitute verse.
 */
export type VerseProvenance = 'network' | 'verified-offline';

export interface Verse {
  surah: number;
  ayah: number;
  numberInSurah: number;
  globalNumber: number;
  textUthmani: string;
  textSimple: string;
  translationEn: string;
  translationTa: string;
  words: QuranWord[];
  audioUrl: string;
  tajweed?: TajweedData;
  juz?: number;
  hizb?: number;
  page?: number;
  provenance?: VerseProvenance;
}

export interface QuranSearchQuery {
  query: string;
  surah?: number;
  language?: 'ar' | 'en' | 'ta';
  limit?: number;
}

/** Which corpus a search result was drawn from. */
export type SearchScope = 'surah' | 'remote' | 'offline-corpus';

export interface SearchResult {
  surah: number;
  surahName: string;
  ayah: number;
  text: string;
  matchType: 'arabic' | 'translationEn' | 'translationTa';
  translationEn?: string;
  translationTa?: string;
  scope?: SearchScope;
}

export interface QuranProvider {
  readonly id: string;
  readonly name: string;
  getChapter(id: number): Promise<Chapter>;
  getVerse(ref: { surah: number; ayah: number }): Promise<Verse>;
  getVerses(range: { surah: number; startAyah: number; endAyah: number }): Promise<Verse[]>;
  getChapterVerses(surahId: number): Promise<Verse[]>;
  getTranslation(ref: { surah: number; ayah: number }, lang: 'en' | 'ta'): Promise<Translation>;
  getWordData(ref: { surah: number; ayah: number; word: number }): Promise<QuranWord>;
  getAudio(ref: { surah: number; ayah: number }, reciterId: string): Promise<AudioResource>;
  search(query: QuranSearchQuery): Promise<SearchResult[]>;
  getTajweed(ref: { surah: number; ayah: number }): Promise<TajweedData>;
}
