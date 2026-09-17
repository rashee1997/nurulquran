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
import { getChapterMetadata, SURAHS } from './surahs';
import { analyzeTajweed } from './tajweed';
import { db } from '../db';

// Fallback seed dictionary for word morphology and Tamil translations
const WORD_MORPHOLOGY_MAP: Record<string, { root: string; morphology: string; transliteration: string; en: string; ta: string }> = {
  '1:1:1': { root: 'س-م-و', morphology: 'Noun (Genitive)', transliteration: 'Bismi', en: 'In the name', ta: 'பெயரால்' },
  '1:1:2': { root: 'إ-ل-ه', morphology: 'Proper Noun (Allah)', transliteration: 'Allahi', en: 'of Allah', ta: 'அல்லாஹ்வின்' },
  '1:1:3': { root: 'ر-ح-م', morphology: 'Adjective (Ar-Rahman)', transliteration: 'Ar-Rahmani', en: 'the Entirely Merciful', ta: 'அளவற்ற அருளாளன்' },
  '1:1:4': { root: 'ر-ح-م', morphology: 'Adjective (Ar-Raheem)', transliteration: 'Ar-Raheemi', en: 'the Especially Merciful', ta: 'நிகரற்ற அன்புடையோன்' },
  '1:2:1': { root: 'ح-م-د', morphology: 'Noun (Nominative)', transliteration: 'Al-hamdu', en: 'All praise', ta: 'அனைத்துப் புகழும்' },
  '1:2:2': { root: 'ل-ل-ه', morphology: 'Preposition + Proper Noun', transliteration: 'lillahi', en: 'is due to Allah', ta: 'அல்லாஹ்வுக்கே' },
  '1:2:3': { root: 'ر-ب-ب', morphology: 'Noun (Lord)', transliteration: 'Rabbi', en: 'Lord', ta: 'இறைவன் / அதிபதி' },
  '1:2:4': { root: 'ع-ل-م', morphology: 'Noun (Plural)', transliteration: 'al-\'alameen', en: 'of the worlds', ta: 'அகிலங்களின்' },
  '112:1:1': { root: 'ق-و-ل', morphology: 'Imperative Verb', transliteration: 'Qul', en: 'Say', ta: 'கூறுவீராக' },
  '112:1:2': { root: 'ه-و', morphology: '3rd Person Pronoun', transliteration: 'Huwa', en: 'He is', ta: 'அவன்' },
  '112:1:3': { root: 'إ-ل-ه', morphology: 'Proper Noun', transliteration: 'Allahu', en: 'Allah', ta: 'அல்லாஹ்' },
  '112:1:4': { root: 'أ-ح-د', morphology: 'Adjective', transliteration: 'Ahad', en: '[who is] One', ta: 'ஒருவனே' },
};

export class AlQuranCloudProvider implements QuranProvider {
  readonly id = 'alquran-cloud';
  readonly name = 'AlQuran Cloud (Keyless REST)';
  private memoryCache = new Map<string, unknown>();

  async getChapter(id: number): Promise<Chapter> {
    return getChapterMetadata(id);
  }

  private getCacheKey(type: string, ...args: (string | number)[]): string {
    return `${type}:${args.join(':')}`;
  }

  private async getFromCache<T>(key: string): Promise<T | null> {
    if (this.memoryCache.has(key)) {
      return this.memoryCache.get(key) as T;
    }
    if (typeof window !== 'undefined') {
      try {
        const item = await db.quranCache.get(key);
        if (item) {
          this.memoryCache.set(key, item.data);
          return item.data as T;
        }
      } catch (err) {
        console.warn('Dexie cache lookup failed:', err);
      }
    }
    return null;
  }

  private async setToCache(key: string, data: unknown): Promise<void> {
    this.memoryCache.set(key, data);
    if (typeof window !== 'undefined') {
      try {
        await db.quranCache.put({
          key,
          data,
          cachedAt: Date.now(),
        });
      } catch (err) {
        console.warn('Dexie cache store failed:', err);
      }
    }
  }

  async getVerse(ref: { surah: number; ayah: number }): Promise<Verse> {
    const cacheKey = this.getCacheKey('verse', ref.surah, ref.ayah);
    const cached = await this.getFromCache<Verse>(cacheKey);
    if (cached) return cached;

    try {
      // Fetch Arabic, English, and Tamil simultaneously using AlQuran Cloud multi-edition endpoint
      // editions: quran-uthmani, en.sahih, ta.tamil
      const url = `https://api.alquran.cloud/v1/ayah/${ref.surah}:${ref.ayah}/editions/quran-uthmani,en.sahih,ta.tamil`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to fetch verse ${ref.surah}:${ref.ayah} status ${res.status}`);
      }

      const json = await res.json();
      const data = json.data; // array of 3 editions
      const uthmaniEdition = data.find((e: { edition: { identifier: string } }) => e.edition.identifier === 'quran-uthmani');
      const enEdition = data.find((e: { edition: { identifier: string } }) => e.edition.identifier === 'en.sahih');
      const taEdition = data.find((e: { edition: { identifier: string } }) => e.edition.identifier === 'ta.tamil');

      const textUthmani = uthmaniEdition?.text || '';
      const textSimple = textUthmani.replace(/[\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g, '');
      const globalNumber = uthmaniEdition?.number || 1;

      // Tokenize words
      const rawWords = textUthmani.trim().split(/\s+/);
      const words: QuranWord[] = rawWords.map((wordStr: string, idx: number) => {
        const wordIdx = idx + 1;
        const key = `${ref.surah}:${ref.ayah}:${wordIdx}`;
        const morph = WORD_MORPHOLOGY_MAP[key] || {
          root: '—',
          morphology: 'Lexical Token',
          transliteration: wordStr,
          en: wordStr,
          ta: wordStr,
        };

        return {
          id: key,
          surah: ref.surah,
          ayah: ref.ayah,
          wordIndex: wordIdx,
          arabic: wordStr,
          transliteration: morph.transliteration,
          translationEn: morph.en,
          translationTa: morph.ta,
          root: morph.root,
          morphology: morph.morphology,
        };
      });

      const verse: Verse = {
        surah: ref.surah,
        ayah: ref.ayah,
        numberInSurah: ref.ayah,
        globalNumber,
        textUthmani,
        textSimple,
        translationEn: enEdition?.text || '',
        translationTa: taEdition?.text || '',
        words,
        audioUrl: `https://cdn.islamic.network/quran/audio/128/ar.alafasy/${globalNumber}.mp3`,
        tajweed: analyzeTajweed(ref.surah, ref.ayah, textUthmani),
        juz: uthmaniEdition?.juz,
        hizb: uthmaniEdition?.hizbQuarter,
        page: uthmaniEdition?.page,
      };

      await this.setToCache(cacheKey, verse);
      return verse;
    } catch (error) {
      console.warn(`AlQuranCloud getVerse ${ref.surah}:${ref.ayah} failed, falling back to deterministic local schema:`, error);
      return this.getLocalFallbackVerse(ref.surah, ref.ayah);
    }
  }

  async getVerses(range: { surah: number; startAyah: number; endAyah: number }): Promise<Verse[]> {
    const verses: Verse[] = [];
    for (let ayah = range.startAyah; ayah <= range.endAyah; ayah++) {
      const v = await this.getVerse({ surah: range.surah, ayah });
      verses.push(v);
    }
    return verses;
  }

  async getChapterVerses(surahId: number): Promise<Verse[]> {
    const chapter = getChapterMetadata(surahId);
    return this.getVerses({ surah: surahId, startAyah: 1, endAyah: chapter.versesCount });
  }

  async getTranslation(ref: { surah: number; ayah: number }, lang: 'en' | 'ta'): Promise<Translation> {
    const verse = await this.getVerse(ref);
    return {
      surah: ref.surah,
      ayah: ref.ayah,
      language: lang,
      text: lang === 'ta' ? verse.translationTa : verse.translationEn,
      translator: lang === 'ta' ? 'John Trust Foundation (Tamil)' : 'Saheeh International',
    };
  }

  async getWordData(ref: { surah: number; ayah: number; word: number }): Promise<QuranWord> {
    const verse = await this.getVerse({ surah: ref.surah, ayah: ref.ayah });
    const target = verse.words.find(w => w.wordIndex === ref.word) || verse.words[0];
    return target;
  }

  async getAudio(ref: { surah: number; ayah: number }, reciterId: string = 'ar.alafasy'): Promise<AudioResource> {
    const verse = await this.getVerse(ref);
    return {
      surah: ref.surah,
      ayah: ref.ayah,
      audioUrl: `https://cdn.islamic.network/quran/audio/128/${reciterId}/${verse.globalNumber}.mp3`,
      reciterId,
    };
  }

  async search(query: QuranSearchQuery): Promise<SearchResult[]> {
    const q = query.query.trim().toLowerCase();
    const results: SearchResult[] = [];
    const surahsToSearch = query.surah ? [query.surah] : [1, 112, 113, 114, 108, 109, 110, 111];

    for (const surahId of surahsToSearch) {
      const chapter = getChapterMetadata(surahId);
      const verses = await this.getVerses({
        surah: surahId,
        startAyah: 1,
        endAyah: Math.min(chapter.versesCount, 7),
      });

      for (const v of verses) {
        if (v.textUthmani.includes(q) || v.textSimple.includes(q)) {
          results.push({
            surah: v.surah,
            surahName: chapter.nameSimple,
            ayah: v.ayah,
            text: v.textUthmani,
            matchType: 'arabic',
            translationEn: v.translationEn,
            translationTa: v.translationTa,
          });
        } else if (v.translationEn.toLowerCase().includes(q)) {
          results.push({
            surah: v.surah,
            surahName: chapter.nameSimple,
            ayah: v.ayah,
            text: v.translationEn,
            matchType: 'translationEn',
            translationEn: v.translationEn,
            translationTa: v.translationTa,
          });
        } else if (v.translationTa.toLowerCase().includes(q)) {
          results.push({
            surah: v.surah,
            surahName: chapter.nameSimple,
            ayah: v.ayah,
            text: v.translationTa,
            matchType: 'translationTa',
            translationEn: v.translationEn,
            translationTa: v.translationTa,
          });
        }
      }
    }

    return results.slice(0, query.limit || 20);
  }

  async getTajweed(ref: { surah: number; ayah: number }): Promise<TajweedData> {
    const verse = await this.getVerse(ref);
    return verse.tajweed || analyzeTajweed(ref.surah, ref.ayah, verse.textUthmani);
  }

  /**
   * Deterministic local fallback for core Surahs (Al-Fatihah, Al-Ikhlas, etc.)
   */
  private getLocalFallbackVerse(surah: number, ayah: number): Verse {
    // Standard authentic texts for popular recitation
    const corpus: Record<string, { ar: string; en: string; ta: string; num: number }> = {
      '1:1': {
        ar: 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ',
        en: 'In the name of Allah, the Entirely Merciful, the Especially Merciful.',
        ta: 'அளவற்ற அருளாளனும், நிகரற்ற அன்புடையோனுமாகிய அல்லாஹ்வின் பெயரால் (துவங்குகிறேன்).',
        num: 1,
      },
      '1:2': {
        ar: 'ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ',
        en: '[All] praise is [due] to Allah, Lord of the worlds.',
        ta: 'அனைத்துப் புகழும் அகிலங்களின் இறைவனாகிய அல்லாஹ்வுக்கே உரியது.',
        num: 2,
      },
      '1:3': {
        ar: 'ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ',
        en: 'The Entirely Merciful, the Especially Merciful,',
        ta: 'அவன் அளவற்ற அருளாளன், நிகரற்ற அன்புடையோன்.',
        num: 3,
      },
      '1:4': {
        ar: 'مَـٰلِكِ يَوْمِ ٱلدِّينِ',
        en: 'Sovereign of the Day of Recompense.',
        ta: 'தீர்ப்பு நாளின் அதிபதி.',
        num: 4,
      },
      '1:5': {
        ar: 'إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ',
        en: 'It is You we worship and You we ask for help.',
        ta: 'உன்னையே நாங்கள் வணங்குகிறோம்; உன்னிடமே நாங்கள் உதவியும் தேடுகிறோம்.',
        num: 5,
      },
      '1:6': {
        ar: 'ٱهْدِنَا ٱلصِّرَٰطَ ٱلْمُسْتَقِيمَ',
        en: 'Guide us to the straight path -',
        ta: 'எங்களை நீ நேரான வழியில் செலுத்துவாயாக!',
        num: 6,
      },
      '1:7': {
        ar: 'صِرَٰطَ ٱلَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ ٱلْمَغْضُوبِ عَلَيْهِمْ وَلَا ٱلضَّآلِّينَ',
        en: 'The path of those upon whom You have bestowed favor, not of those who have evoked [Your] anger or of those who are astray.',
        ta: 'அவ்வழி எவர் மீது நீ அருள்புரிந்தாயோ அவ்வழி; கோபத்திற்கு ஆளானோர் வழியுமல்ல, வழிதவறியோர் வழியுமல்ல.',
        num: 7,
      },
      '112:1': {
        ar: 'قُلْ هُوَ ٱللَّهُ أَحَدٌ',
        en: 'Say, "He is Allah, [who is] One,',
        ta: '(நபியே!) நீர் கூறுவீராக: அவன் அல்லாஹ், ஒருவனே.',
        num: 6222,
      },
      '112:2': {
        ar: 'ٱللَّهُ ٱلصَّمَدُ',
        en: 'Allah, the Eternal Refuge.',
        ta: 'அல்லாஹ் தேவையற்றவன் (அனைத்தும் அவனிடமே தேவையுடையவை).',
        num: 6223,
      },
      '112:3': {
        ar: 'لَمْ يَلِدْ وَلَمْ يُولَدْ',
        en: 'He neither begets nor is born,',
        ta: 'அவன் எவரையும் பெறவுமில்லை; (எவராலும்) பெறப்படவுமில்லை.',
        num: 6224,
      },
      '112:4': {
        ar: 'وَلَمْ يَكُن لَّهُۥ كُفُوًا أَحَدٌۢ',
        en: 'Nor is there to Him any equivalent."',
        ta: 'மேலும் அவனுக்கு நிகராக எவரும் இல்லை.',
        num: 6225,
      },
      '113:1': {
        ar: 'قُلْ أَعُوذُ بِرَبِّ ٱلْفَلَقِ',
        en: 'Say, "I seek refuge in the Lord of daybreak',
        ta: '(நபியே!) நீர் கூறுவீராக: விடியற்காலையின் இறைவனிடம் நான் பாதுகாப்புத் தேடுகிறேன்.',
        num: 6226,
      },
      '114:1': {
        ar: 'قُلْ أَعُوذُ بِرَبِّ ٱلنَّاسِ',
        en: 'Say, "I seek refuge in the Lord of mankind,',
        ta: '(நபியே!) நீர் கூறுவீராக: மனிதர்களின் இறைவனிடம் நான் பாதுகாப்புத் தேடுகிறேன்.',
        num: 6231,
      },
    };

    const key = `${surah}:${ayah}`;
    const item = corpus[key] || {
      ar: 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ',
      en: 'In the name of Allah, the Entirely Merciful, the Especially Merciful.',
      ta: 'அளவற்ற அருளாளனும், நிகரற்ற அன்புடையோனுமாகிய அல்லாஹ்வின் பெயரால்.',
      num: 1,
    };

    const words = item.ar.split(' ').map((w, idx) => ({
      id: `${surah}:${ayah}:${idx + 1}`,
      surah,
      ayah,
      wordIndex: idx + 1,
      arabic: w,
      transliteration: w,
      translationEn: w,
      translationTa: w,
    }));

    return {
      surah,
      ayah,
      numberInSurah: ayah,
      globalNumber: item.num,
      textUthmani: item.ar,
      textSimple: item.ar.replace(/[\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g, ''),
      translationEn: item.en,
      translationTa: item.ta,
      words,
      audioUrl: `https://cdn.islamic.network/quran/audio/128/ar.alafasy/${item.num}.mp3`,
      tajweed: analyzeTajweed(surah, ayah, item.ar),
    };
  }
}

export const quranProvider = new AlQuranCloudProvider();
