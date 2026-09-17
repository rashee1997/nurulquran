import { 
  AudioResource, 
  Chapter, 
  QuranProvider, 
  QuranSearchQuery, 
  QuranWord, 
  SearchResult, 
  TajweedData, 
  Translation, 
  Verse 
} from './types';
import { getChapterMetadata } from './surahs';
import { analyzeTajweed } from './tajweed';

export class QuranComProvider implements QuranProvider {
  readonly id = 'quran-com';
  readonly name = 'Quran.com v4 API';
  private baseUrl = 'https://api.quran.com/api/v4';
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  private getHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    if (this.apiKey) {
      headers['x-api-key'] = this.apiKey;
    }
    return headers;
  }

  async getChapter(id: number): Promise<Chapter> {
    return getChapterMetadata(id);
  }

  async getVerse(ref: { surah: number; ayah: number }): Promise<Verse> {
    const key = `${ref.surah}:${ref.ayah}`;
    try {
      const url = `${this.baseUrl}/verses/by_key/${key}?language=en&words=true&translations=131&fields=text_uthmani,chapter_id,verse_number`;
      const res = await fetch(url, { headers: this.getHeaders() });
      if (!res.ok) {
        throw new Error(`QuranCom API error ${res.status}`);
      }
      const data = await res.json();
      const verseObj = data.verse;

      const words: QuranWord[] = (verseObj.words || []).map((w: {
        id: number;
        position: number;
        text_uthmani: string;
        transliteration?: { text: string };
        translation?: { text: string };
        audio_url?: string;
      }) => ({
        id: `${ref.surah}:${ref.ayah}:${w.position}`,
        surah: ref.surah,
        ayah: ref.ayah,
        wordIndex: w.position,
        arabic: w.text_uthmani,
        transliteration: w.transliteration?.text || '',
        translationEn: w.translation?.text || '',
        translationTa: '',
        audioUrl: w.audio_url ? `https://audio.qurancdn.com/${w.audio_url}` : undefined,
      }));

      const textUthmani = verseObj.text_uthmani || '';
      const translationEn = verseObj.translations?.[0]?.text?.replace(/<[^>]*>?/gm, '') || '';

      return {
        surah: ref.surah,
        ayah: ref.ayah,
        numberInSurah: ref.ayah,
        globalNumber: verseObj.id || 1,
        textUthmani,
        textSimple: textUthmani.replace(/[\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g, ''),
        translationEn,
        translationTa: '',
        words,
        audioUrl: `https://cdn.islamic.network/quran/audio/128/ar.alafasy/${verseObj.id || 1}.mp3`,
        tajweed: analyzeTajweed(ref.surah, ref.ayah, textUthmani),
      };
    } catch (e) {
      console.warn('QuranComProvider fetch failed, defaulting to basic text:', e);
      throw e;
    }
  }

  async getVerses(range: { surah: number; startAyah: number; endAyah: number }): Promise<Verse[]> {
    const list: Verse[] = [];
    for (let a = range.startAyah; a <= range.endAyah; a++) {
      list.push(await this.getVerse({ surah: range.surah, ayah: a }));
    }
    return list;
  }

  async getChapterVerses(surahId: number): Promise<Verse[]> {
    const chapter = getChapterMetadata(surahId);
    return this.getVerses({ surah: surahId, startAyah: 1, endAyah: chapter.versesCount });
  }

  async getTranslation(ref: { surah: number; ayah: number }, lang: 'en' | 'ta'): Promise<Translation> {
    const v = await this.getVerse(ref);
    return {
      surah: ref.surah,
      ayah: ref.ayah,
      language: lang,
      text: lang === 'ta' ? v.translationTa : v.translationEn,
    };
  }

  async getWordData(ref: { surah: number; ayah: number; word: number }): Promise<QuranWord> {
    const v = await this.getVerse({ surah: ref.surah, ayah: ref.ayah });
    return v.words.find(w => w.wordIndex === ref.word) || v.words[0];
  }

  async getAudio(ref: { surah: number; ayah: number }, reciterId: string = 'ar.alafasy'): Promise<AudioResource> {
    const v = await this.getVerse(ref);
    return {
      surah: ref.surah,
      ayah: ref.ayah,
      audioUrl: `https://cdn.islamic.network/quran/audio/128/${reciterId}/${v.globalNumber}.mp3`,
      reciterId,
    };
  }

  async search(query: QuranSearchQuery): Promise<SearchResult[]> {
    const res = await fetch(`${this.baseUrl}/search?q=${encodeURIComponent(query.query)}&size=${query.limit || 10}`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.search?.results || []).map((r: { verse_key: string; text: string; translations?: Array<{ text: string }> }) => {
      const [surah, ayah] = r.verse_key.split(':').map(Number);
      return {
        surah,
        surahName: `Surah ${surah}`,
        ayah,
        text: r.text.replace(/<[^>]*>?/gm, ''),
        matchType: 'arabic',
        translationEn: r.translations?.[0]?.text?.replace(/<[^>]*>?/gm, '') || '',
      };
    });
  }

  async getTajweed(ref: { surah: number; ayah: number }): Promise<TajweedData> {
    const v = await this.getVerse(ref);
    return v.tajweed || analyzeTajweed(ref.surah, ref.ayah, v.textUthmani);
  }
}
