import {
  AudioResource,
  Chapter,
  QuranProvider,
  QuranSearchQuery,
  QuranWord,
  SearchResult,
  TajweedData,
  Translation,
  Verse,
} from './types';
import { getChapterMetadata } from './surahs';
import { analyzeTajweed } from './tajweed';
import { containsNormalized, normalizeForSearch } from './arabic-text';
import {
  getVerifiedOfflineVerse,
  VERIFIED_OFFLINE_VERSES,
  VerifiedVerseRecord,
} from './verified-offline-corpus';
import { db } from '../db';

/**
 * AlQuran Cloud provider (keyless REST).
 *
 * Invariants:
 *  - Never substitute one verse for another. If the network fails and the exact
 *    verse is not in the verified offline corpus, this provider throws.
 *  - Chapter reads use the bulk surah endpoint (3 requests) instead of one request
 *    per ayah, with bounded concurrency as a fallback.
 *  - Scripture responses are cached (memory + IndexedDB) because the text is immutable.
 */

const API_BASE = 'https://api.alquran.cloud/v1';
const AUDIO_CDN = 'https://cdn.islamic.network/quran/audio/128';
const DEFAULT_RECITER = 'ar.alafasy';

/** Scripture is immutable, so a long revalidation window is safe. */
const SCRIPTURE_REVALIDATE_SECONDS = 60 * 60 * 24 * 7;
const FETCH_TIMEOUT_MS = 8_000;
const FETCH_ATTEMPTS = 3;
const MAX_CONCURRENT_AYAH_REQUESTS = 4;
const MEMORY_CACHE_LIMIT = 600;

export class QuranUnavailableError extends Error {
  readonly surah: number;
  readonly ayah: number;

  constructor(surah: number, ayah: number, reason: string, cause?: unknown) {
    super(`Quran text for ${surah}:${ayah} is unavailable. ${reason}`);
    this.name = 'QuranUnavailableError';
    this.surah = surah;
    this.ayah = ayah;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export class QuranWordNotFoundError extends Error {
  constructor(surah: number, ayah: number, wordIndex: number) {
    super(`Word ${wordIndex} does not exist in ${surah}:${ayah}.`);
    this.name = 'QuranWordNotFoundError';
  }
}

interface AyahEdition {
  number: number;
  numberInSurah: number;
  text: string;
  juz?: number;
  hizbQuarter?: number;
  page?: number;
  edition?: { identifier?: string };
}

interface SurahEdition {
  edition?: { identifier?: string };
  ayahs?: AyahEdition[];
}

interface EditionsEnvelope<T> {
  code?: number;
  status?: string;
  data?: T;
}

interface RemoteSearchMatch {
  text?: string;
  numberInSurah?: number;
  surah?: { number?: number; englishName?: string; name?: string };
}

const WORD_MORPHOLOGY_MAP: Record<
  string,
  { root: string; morphology: string; transliteration: string; en: string; ta: string }
> = {
  '1:1:1': { root: 'س-م-و', morphology: 'Noun (Genitive)', transliteration: 'Bismi', en: 'In the name', ta: 'பெயரால்' },
  '1:1:2': { root: 'إ-ل-ه', morphology: 'Proper Noun (Allah)', transliteration: 'Allahi', en: 'of Allah', ta: 'அல்லாஹ்வின்' },
  '1:1:3': { root: 'ر-ح-م', morphology: 'Adjective (Ar-Rahman)', transliteration: 'Ar-Rahmani', en: 'the Entirely Merciful', ta: 'அளவற்ற அருளாளன்' },
  '1:1:4': { root: 'ر-ح-م', morphology: 'Adjective (Ar-Raheem)', transliteration: 'Ar-Raheemi', en: 'the Especially Merciful', ta: 'நிகரற்ற அன்புடையோன்' },
  '1:2:1': { root: 'ح-م-د', morphology: 'Noun (Nominative)', transliteration: 'Al-hamdu', en: 'All praise', ta: 'அனைத்துப் புகழும்' },
  '1:2:2': { root: 'ل-ل-ه', morphology: 'Preposition + Proper Noun', transliteration: 'lillahi', en: 'is due to Allah', ta: 'அல்லாஹ்வுக்கே' },
  '1:2:3': { root: 'ر-ب-ب', morphology: 'Noun (Lord)', transliteration: 'Rabbi', en: 'Lord', ta: 'இறைவன் / அதிபதி' },
  '1:2:4': { root: 'ع-ل-م', morphology: 'Noun (Plural)', transliteration: "al-'alameen", en: 'of the worlds', ta: 'அகிலங்களின்' },
  '112:1:1': { root: 'ق-و-ل', morphology: 'Imperative Verb', transliteration: 'Qul', en: 'Say', ta: 'கூறுவீராக' },
  '112:1:2': { root: 'ه-و', morphology: '3rd Person Pronoun', transliteration: 'Huwa', en: 'He is', ta: 'அவன்' },
  '112:1:3': { root: 'إ-ل-ه', morphology: 'Proper Noun', transliteration: 'Allahu', en: 'Allah', ta: 'அல்லாஹ்' },
  '112:1:4': { root: 'أ-ح-د', morphology: 'Adjective', transliteration: 'Ahad', en: '[who is] One', ta: 'ஒருவனே' },
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetches JSON with a timeout and bounded exponential backoff. */
async function fetchScripture<T>(url: string): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        next: { revalidate: SCRIPTURE_REVALIDATE_SECONDS },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${response.url}`);
      }
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (attempt < FETCH_ATTEMPTS) {
        await delay(250 * 2 ** (attempt - 1));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Scripture request failed');
}

/** Runs `worker` over `items` with a fixed concurrency ceiling, order preserved. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function run(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, () => run());
  await Promise.all(runners);
  return results;
}

/** Strips Mushaf end-of-ayah markers from a token so words stay word-pure. */
function stripAyahMarker(token: string): string {
  return token.replace(/[\u06DD\u06DE][\u0660-\u0669\u06F0-\u06F9]*/g, '').trim();
}

/**
 * Shape check for a cached verse.
 *
 * The IndexedDB cache is addressed by `verse:<surah>:<ayah>`, but the stored value is
 * whatever an earlier session wrote there. Returning it unchecked would break this
 * provider's central invariant — the learner must always see the verse they asked for,
 * never a different one — so a mismatch is discarded and re-fetched instead of rendered.
 */
function isCachedVerseFor(payload: unknown, surah: number, ayah: number): payload is Verse {
  if (typeof payload !== 'object' || payload === null) return false;
  const candidate = payload as Partial<Verse>;
  return (
    candidate.surah === surah &&
    candidate.ayah === ayah &&
    typeof candidate.textUthmani === 'string' &&
    candidate.textUthmani.trim().length > 0 &&
    typeof candidate.globalNumber === 'number' &&
    Number.isInteger(candidate.globalNumber) &&
    candidate.globalNumber > 0 &&
    Array.isArray(candidate.words)
  );
}

export class AlQuranCloudProvider implements QuranProvider {
  readonly id = 'alquran-cloud';
  readonly name = 'AlQuran Cloud (Keyless REST)';

  /** Server-side memory cache; bounded so long-lived processes cannot grow without limit. */
  private memoryCache = new Map<string, unknown>();

  async getChapter(id: number): Promise<Chapter> {
    return getChapterMetadata(id);
  }

  private getCacheKey(type: string, ...args: (string | number)[]): string {
    return `${type}:${args.join(':')}`;
  }

  private rememberInMemory(key: string, data: unknown): void {
    if (this.memoryCache.size >= MEMORY_CACHE_LIMIT) {
      const oldest = this.memoryCache.keys().next();
      if (!oldest.done) {
        this.memoryCache.delete(oldest.value);
      }
    }
    this.memoryCache.set(key, data);
  }

  /**
   * Reads a cached payload as `unknown` on purpose: the value comes from IndexedDB, which
   * a browser profile, an extension or an older app version may have written, so callers
   * must prove the shape before using it.
   */
  private async getFromCache(key: string): Promise<unknown> {
    if (this.memoryCache.has(key)) {
      return this.memoryCache.get(key);
    }
    if (typeof window !== 'undefined') {
      try {
        const item = await db.quranCache.get(key);
        if (item) {
          this.rememberInMemory(key, item.data);
          return item.data;
        }
      } catch (error) {
        console.warn('Quran cache lookup failed:', error);
      }
    }
    return null;
  }

  /** Removes one cache entry, in memory and in IndexedDB. */
  private async forgetFromCache(key: string): Promise<void> {
    this.memoryCache.delete(key);
    if (typeof window === 'undefined') return;
    try {
      await db.quranCache.delete(key);
    } catch (error) {
      console.warn('Quran cache eviction failed:', error);
    }
  }

  private async setToCache(key: string, data: unknown): Promise<void> {
    this.rememberInMemory(key, data);
    if (typeof window !== 'undefined') {
      try {
        await db.quranCache.put({ key, data, cachedAt: Date.now() });
      } catch (error) {
        console.warn('Quran cache store failed:', error);
      }
    }
  }

  /** Splits verse text into clickable words; never fabricates translations. */
  private buildWords(textUthmani: string, surah: number, ayah: number): QuranWord[] {
    return textUthmani
      .trim()
      .split(/\s+/)
      .map((raw) => stripAyahMarker(raw))
      .filter((token) => token.length > 0)
      .map((wordStr, index) => {
        const wordIndex = index + 1;
        const key = `${surah}:${ayah}:${wordIndex}`;
        const morphology = WORD_MORPHOLOGY_MAP[key];
        return {
          id: key,
          surah,
          ayah,
          wordIndex,
          arabic: wordStr,
          transliteration: morphology?.transliteration ?? '',
          translationEn: morphology?.en ?? '',
          translationTa: morphology?.ta ?? '',
          root: morphology?.root,
          morphology: morphology?.morphology,
        } satisfies QuranWord;
      });
  }

  private composeVerse(input: {
    surah: number;
    ayah: number;
    textUthmani: string;
    translationEn: string;
    translationTa: string;
    globalNumber: number;
    juz?: number;
    hizb?: number;
    page?: number;
    provenance: Verse['provenance'];
  }): Verse {
    const { surah, ayah, textUthmani } = input;
    return {
      surah,
      ayah,
      numberInSurah: ayah,
      globalNumber: input.globalNumber,
      textUthmani,
      // textSimple is a *display* variant (diacritics removed for readability),
      // never the text used for recitation checks.
      textSimple: textUthmani.replace(
        /[\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g,
        ''
      ),
      translationEn: input.translationEn,
      translationTa: input.translationTa,
      words: this.buildWords(textUthmani, surah, ayah),
      audioUrl: `${AUDIO_CDN}/${DEFAULT_RECITER}/${input.globalNumber}.mp3`,
      tajweed: analyzeTajweed(surah, ayah, textUthmani),
      juz: input.juz,
      hizb: input.hizb,
      page: input.page,
      provenance: input.provenance,
    };
  }

  private composeFromAyahEditions(surah: number, ayah: number, editions: AyahEdition[]): Verse {
    const pick = (identifier: string) =>
      editions.find((edition) => edition.edition?.identifier === identifier);
    const uthmani = pick('quran-uthmani') ?? editions[0];
    if (!uthmani || typeof uthmani.text !== 'string' || uthmani.text.length === 0) {
      throw new QuranUnavailableError(surah, ayah, 'The text service returned no Uthmani text.');
    }

    return this.composeVerse({
      surah,
      ayah,
      textUthmani: uthmani.text,
      translationEn: pick('en.sahih')?.text ?? '',
      translationTa: pick('ta.tamil')?.text ?? '',
      globalNumber: uthmani.number,
      juz: uthmani.juz,
      hizb: uthmani.hizbQuarter,
      page: uthmani.page,
      provenance: 'network',
    });
  }

  private composeFromOfflineRecord(record: VerifiedVerseRecord): Verse {
    return this.composeVerse({
      surah: record.surah,
      ayah: record.ayah,
      textUthmani: record.textUthmani,
      translationEn: record.translationEn,
      translationTa: record.translationTa,
      globalNumber: record.globalNumber,
      provenance: 'verified-offline',
    });
  }

  async getVerse(ref: { surah: number; ayah: number }): Promise<Verse> {
    const cacheKey = this.getCacheKey('verse', ref.surah, ref.ayah);
    const cached = await this.getFromCache(cacheKey);
    if (cached !== null) {
      if (isCachedVerseFor(cached, ref.surah, ref.ayah)) return cached;
      console.warn(
        `Discarded a cached Quran entry for ${ref.surah}:${ref.ayah} because it does not describe that verse.`
      );
      await this.forgetFromCache(cacheKey);
    }

    try {
      const envelope = await fetchScripture<EditionsEnvelope<AyahEdition | AyahEdition[]>>(
        `${API_BASE}/ayah/${ref.surah}:${ref.ayah}/editions/quran-uthmani,en.sahih,ta.tamil`
      );
      const editions = Array.isArray(envelope.data)
        ? envelope.data
        : envelope.data
          ? [envelope.data]
          : [];
      const verse = this.composeFromAyahEditions(ref.surah, ref.ayah, editions);
      await this.setToCache(cacheKey, verse);
      return verse;
    } catch (error) {
      // Only an exact, verified offline copy may stand in for a failed request.
      const offline = getVerifiedOfflineVerse(ref.surah, ref.ayah);
      if (offline) {
        console.warn(
          `Quran network fetch failed for ${ref.surah}:${ref.ayah}; serving the verified offline copy.`,
          error
        );
        const verse = this.composeFromOfflineRecord(offline);
        await this.setToCache(cacheKey, verse);
        return verse;
      }
      throw new QuranUnavailableError(
        ref.surah,
        ref.ayah,
        'The text service could not be reached and this verse has no verified offline copy.',
        error
      );
    }
  }

  async getVerses(range: { surah: number; startAyah: number; endAyah: number }): Promise<Verse[]> {
    if (range.endAyah < range.startAyah) return [];
    const ayahNumbers = Array.from(
      { length: range.endAyah - range.startAyah + 1 },
      (_, index) => range.startAyah + index
    );
    return mapWithConcurrency(ayahNumbers, MAX_CONCURRENT_AYAH_REQUESTS, (ayah) =>
      this.getVerse({ surah: range.surah, ayah })
    );
  }

  async getChapterVerses(surahId: number): Promise<Verse[]> {
    const chapter = getChapterMetadata(surahId);
    const expected = chapter.versesCount;

    // Fast path: one request per edition for the whole chapter.
    try {
      const envelope = await fetchScripture<EditionsEnvelope<SurahEdition[]>>(
        `${API_BASE}/surah/${surahId}/editions/quran-uthmani,en.sahih,ta.tamil`
      );
      const editions = Array.isArray(envelope.data) ? envelope.data : [];
      const verses = this.composeChapterFromSurahEditions(surahId, editions);

      if (verses.length === expected) {
        await Promise.all(
          verses.map((verse) => this.setToCache(this.getCacheKey('verse', verse.surah, verse.ayah), verse))
        );
        return verses;
      }
      console.warn(
        `Bulk chapter fetch for surah ${surahId} returned ${verses.length} of ${expected} ayahs; falling back to per-ayah fetch.`
      );
    } catch (error) {
      console.warn(`Bulk chapter fetch for surah ${surahId} failed; using per-ayah fetch.`, error);
    }

    const verses = await this.getVerses({ surah: surahId, startAyah: 1, endAyah: expected });
    if (verses.length !== expected) {
      throw new QuranUnavailableError(
        surahId,
        1,
        `Only ${verses.length} of ${expected} ayahs could be retrieved.`
      );
    }
    return verses;
  }

  private composeChapterFromSurahEditions(surahId: number, editions: SurahEdition[]): Verse[] {
    const pick = (identifier: string) =>
      editions.find((edition) => edition.edition?.identifier === identifier);
    const uthmaniAyahs = pick('quran-uthmani')?.ayahs;
    if (!Array.isArray(uthmaniAyahs) || uthmaniAyahs.length === 0) return [];

    const translationFor = (identifier: string, ayahNumber: number): string => {
      const ayahs = pick(identifier)?.ayahs;
      if (!Array.isArray(ayahs)) return '';
      const match = ayahs.find(
        (ayah) => ayah.numberInSurah === ayahNumber || ayah.number === ayahNumber
      );
      return match?.text ?? '';
    };

    return uthmaniAyahs
      .filter((ayah) => typeof ayah.text === 'string' && ayah.text.length > 0)
      .map((ayah) => {
        const ayahNumber = typeof ayah.numberInSurah === 'number' ? ayah.numberInSurah : ayah.number;
        return this.composeVerse({
          surah: surahId,
          ayah: ayahNumber,
          textUthmani: ayah.text,
          translationEn: translationFor('en.sahih', ayahNumber),
          translationTa: translationFor('ta.tamil', ayahNumber),
          globalNumber: typeof ayah.number === 'number' ? ayah.number : ayahNumber,
          juz: ayah.juz,
          hizb: ayah.hizbQuarter,
          page: ayah.page,
          provenance: 'network',
        });
      });
  }

  async getTranslation(ref: { surah: number; ayah: number }, lang: 'en' | 'ta'): Promise<Translation> {
    const verse = await this.getVerse(ref);
    return {
      surah: ref.surah,
      ayah: ref.ayah,
      language: lang,
      text: lang === 'ta' ? verse.translationTa : verse.translationEn,
      translator: lang === 'ta' ? 'Tamil edition via AlQuran Cloud (ta.tamil)' : 'Saheeh International',
    };
  }

  async getWordData(ref: { surah: number; ayah: number; word: number }): Promise<QuranWord> {
    const verse = await this.getVerse({ surah: ref.surah, ayah: ref.ayah });
    const target = verse.words.find((word) => word.wordIndex === ref.word);
    if (!target) {
      throw new QuranWordNotFoundError(ref.surah, ref.ayah, ref.word);
    }
    return target;
  }

  async getAudio(
    ref: { surah: number; ayah: number },
    reciterId: string = DEFAULT_RECITER
  ): Promise<AudioResource> {
    const verse = await this.getVerse(ref);
    return {
      surah: ref.surah,
      ayah: ref.ayah,
      audioUrl: `${AUDIO_CDN}/${reciterId}/${verse.globalNumber}.mp3`,
      reciterId,
    };
  }

  /**
   * Searches the Quran text.
   *
   * Arabic matching is diacritic-insensitive on both sides. When `surah` is given
   * the search is exhaustive within that chapter; otherwise it queries the remote
   * search service and, failing that, the verified offline corpus. `scope` on each
   * result states exactly what was searched so callers cannot imply full coverage.
   */
  async search(query: QuranSearchQuery): Promise<SearchResult[]> {
    const raw = query.query.trim();
    if (raw.length === 0) return [];
    const limit = Math.max(1, Math.min(query.limit ?? 20, 50));

    if (query.surah) {
      return this.searchWithinSurah(query.surah, raw, limit);
    }

    const remote = await this.searchRemote(raw, limit);
    if (remote.length > 0) return remote;

    return this.searchOfflineCorpus(raw, limit);
  }

  private async searchWithinSurah(surahId: number, raw: string, limit: number): Promise<SearchResult[]> {
    const chapter = getChapterMetadata(surahId);
    const verses = await this.getVerses({ surah: surahId, startAyah: 1, endAyah: chapter.versesCount });
    const results: SearchResult[] = [];

    for (const verse of verses) {
      const inArabic = containsNormalized(verse.textUthmani, raw);
      const inEnglish = normalizeForSearch(verse.translationEn).includes(normalizeForSearch(raw));
      const inTamil = normalizeForSearch(verse.translationTa).includes(normalizeForSearch(raw));
      if (!inArabic && !inEnglish && !inTamil) continue;

      results.push({
        surah: verse.surah,
        surahName: chapter.nameSimple,
        ayah: verse.ayah,
        text: inArabic ? verse.textUthmani : inEnglish ? verse.translationEn : verse.translationTa,
        matchType: inArabic ? 'arabic' : inEnglish ? 'translationEn' : 'translationTa',
        translationEn: verse.translationEn,
        translationTa: verse.translationTa,
        scope: 'surah',
      });
      if (results.length >= limit) break;
    }

    return results;
  }

  private async searchRemote(raw: string, limit: number): Promise<SearchResult[]> {
    try {
      const edition = /[\u0600-\u06FF]/.test(raw) ? 'quran-uthmani' : 'en.sahih';
      const envelope = await fetchScripture<
        EditionsEnvelope<{ matches?: RemoteSearchMatch[] }>
      >(`${API_BASE}/search/${encodeURIComponent(raw)}/all/${edition}`);

      const matches = envelope.data?.matches;
      if (!Array.isArray(matches)) return [];

      const results: SearchResult[] = [];
      for (const match of matches.slice(0, limit)) {
        const surahNumber = match.surah?.number;
        const ayahNumber = match.numberInSurah;
        if (typeof surahNumber !== 'number' || typeof ayahNumber !== 'number') continue;
        results.push({
          surah: surahNumber,
          surahName: match.surah?.englishName ?? getChapterMetadata(surahNumber).nameSimple,
          ayah: ayahNumber,
          text: match.text ?? '',
          matchType: edition === 'quran-uthmani' ? 'arabic' : 'translationEn',
          scope: 'remote',
        });
      }
      return results;
    } catch (error) {
      console.warn('Remote Quran search unavailable; using the verified offline corpus.', error);
      return [];
    }
  }

  private searchOfflineCorpus(raw: string, limit: number): SearchResult[] {
    const results: SearchResult[] = [];
    for (const record of VERIFIED_OFFLINE_VERSES) {
      const inArabic = containsNormalized(record.textUthmani, raw);
      const inEnglish = normalizeForSearch(record.translationEn).includes(normalizeForSearch(raw));
      const inTamil = normalizeForSearch(record.translationTa).includes(normalizeForSearch(raw));
      if (!inArabic && !inEnglish && !inTamil) continue;

      results.push({
        surah: record.surah,
        surahName: getChapterMetadata(record.surah).nameSimple,
        ayah: record.ayah,
        text: inArabic ? record.textUthmani : inEnglish ? record.translationEn : record.translationTa,
        matchType: inArabic ? 'arabic' : inEnglish ? 'translationEn' : 'translationTa',
        translationEn: record.translationEn,
        translationTa: record.translationTa,
        scope: 'offline-corpus',
      });
      if (results.length >= limit) break;
    }
    return results;
  }

  async getTajweed(ref: { surah: number; ayah: number }): Promise<TajweedData> {
    const verse = await this.getVerse(ref);
    return verse.tajweed ?? analyzeTajweed(ref.surah, ref.ayah, verse.textUthmani);
  }
}

export const quranProvider = new AlQuranCloudProvider();
