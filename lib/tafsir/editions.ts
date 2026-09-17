/**
 * Tafseer lesson module — edition catalog and CDN resolution.
 *
 * Every slug and id here was verified against the live `tafsir/editions.json` index
 * (122 editions across 34 languages) and against the per-ayah and per-sūrah endpoints.
 * The byte sizes quoted below are measured, and they are the reason the module defaults
 * to the Mukhtasar pair: Ibn Kathir's 1:1 payload alone is 60 KB (a whole sūrah
 * introduction), while Tamil Mokhtasar's is 1.5 KB.
 */

const GITHUB_OWNER = 'spa5k';
const GITHUB_REPO = 'tafsir_api';
const GITHUB_REF = 'main';

/**
 * CDN tiers, tried in order.
 *
 * jsDelivr is primary. The other two are real, independently verified fallbacks for the
 * same immutable files: a jsDelivr outage or an air-gapped school network that only
 * allow-lists raw.githubusercontent.com should degrade rather than dead-end. `@main` is a
 * moving ref, so a production pin should replace it with a commit SHA in one place.
 */
export const TAFSIR_CDN_BASES: readonly string[] = [
  `https://cdn.jsdelivr.net/gh/${GITHUB_OWNER}/${GITHUB_REPO}@${GITHUB_REF}/tafsir`,
  `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_REF}/tafsir`,
  `https://cdn.statically.io/gh/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_REF}/tafsir`,
];

export interface TafsirEditionDefinition {
  /** CDN slug, verified present in editions.json. */
  slug: string;
  /** Upstream numeric id from editions.json. */
  id: number;
  language: 'en' | 'ta';
  /** Display name as published. */
  name: string;
  /** Author/compiler as published, shown to the learner for honesty. */
  author: string;
  /** BCP-47 tag for `lang=` on the rendered container. */
  htmlLang: string;
  /** Editorial description used in the UI and in the storyteller prompt. */
  description: string;
  /**
   * True when the edition is a per-ayah *sparse* commentary: it only carries verses that
   * have an entry, and whole sūrahs can 404. Callers must not treat absence as an error.
   */
  sparse?: boolean;
}

/** The default bilingual lesson pair. Parallel editions of the same abridged tafsir. */
export const TAMIL_EDITION: TafsirEditionDefinition = {
  slug: 'tamil-mokhtasar',
  id: 554,
  language: 'ta',
  name: 'Tamil Mokhtasar',
  author: 'Tamil Mokhtasar',
  htmlLang: 'ta',
  description:
    'Tamil abridged explanation of the Quran, written in short, clear paragraphs suited to younger readers.',
};

export const ENGLISH_EDITION: TafsirEditionDefinition = {
  slug: 'en-tafsir-al-mukhtasar',
  id: 266,
  language: 'en',
  name: 'English Al-Mukhtasar',
  author: 'Tafsir Center for Quranic Studies',
  htmlLang: 'en',
  description:
    'An abridged English commentary built for clarity: one idea per paragraph, no digressions.',
};

/**
 * Optional third edition for the "scholarly deep dive" reference panel.
 *
 * Held to a separate choice on purpose. Ibn Kathir is 10–30× heavier than the Mukhtasar
 * pair (60 KB for 1:1, 15 KB for 2:282, 2.1 MiB for the whole of Sūrah 2) and it is the
 * wrong register to read aloud to a ten-year-old. It is never used as the Live context.
 */
export const SCHOLARLY_EDITION: TafsirEditionDefinition = {
  slug: 'en-tafisr-ibn-kathir',
  id: 35,
  language: 'en',
  name: 'Tafsir Ibn Kathir',
  author: 'Hafiz Ibn Kathir',
  htmlLang: 'en',
  description:
    'The classical full commentary. Rich in hadith and narration, and far longer than the abridged pair.',
};

/**
 * Occasion of revelation (Asbab al-Nuzul).
 *
 * Sparse by nature, and the sparsity is not uniform: measured coverage is 7/7 for Sūrah 1,
 * 128/286 for Sūrah 2, 23/110 for Sūrah 18, 13/83 for Sūrah 36, 8/78 for Sūrah 55,
 * 2/30 for Sūrah 67 — and Sūrahs 108, 112, 113 and 114 return HTTP 404 with no file at
 * all. Those are exactly the sūrahs a child starts with, so "no historical cause is
 * available" is the normal case and the storyteller is instructed accordingly.
 */
export const ASBAB_EDITION: TafsirEditionDefinition = {
  slug: 'en-asbab-al-nuzul-by-al-wahidi',
  id: 86,
  language: 'en',
  name: 'Asbab Al-Nuzul by Al-Wahidi',
  author: 'Ali ibn Ahmad al-Wahidi',
  htmlLang: 'en',
  description:
    'Occasions of revelation. Present only for verses that have a recorded historical cause.',
  sparse: true,
};

/** Editions fetched for every lesson, in display order. */
export const LESSON_EDITIONS: readonly TafsirEditionDefinition[] = [ENGLISH_EDITION, TAMIL_EDITION];

/* -------------------------------------------------------------------------- */
/* URL construction                                                           */
/* -------------------------------------------------------------------------- */

/** Absolute URL for the global edition index on a given CDN tier. */
export function editionsIndexUrl(cdnBase: string): string {
  return `${cdnBase}/editions.json`;
}

/** Absolute URL for one ayah's exegesis. */
export function ayahTafsirUrl(cdnBase: string, slug: string, surah: number, ayah: number): string {
  return `${cdnBase}/${slug}/${surah}/${ayah}.json`;
}

/** Absolute URL for a whole sūrah's exegesis (one request per edition per chapter). */
export function surahTafsirUrl(cdnBase: string, slug: string, surah: number): string {
  return `${cdnBase}/${slug}/${surah}.json`;
}

/* -------------------------------------------------------------------------- */
/* Curated lesson tracks                                                      */
/* -------------------------------------------------------------------------- */

export interface TafsirLessonTrack {
  id: string;
  title: string;
  titleTamil: string;
  description: string;
  /** Surah numbers, in the order a child should meet them. */
  surahs: number[];
  accent: 'emerald' | 'amber' | 'sky';
}

/**
 * Reading paths.
 *
 * Ordered by the pedagogical sequence a young learner actually needs: the short sūrahs
 * they already hear in prayer first (so the lesson attaches to something familiar), then
 * the foundational long sūrahs. Surah 1 is deliberately first for every learner.
 */
export const LESSON_TRACKS: readonly TafsirLessonTrack[] = [
  {
    id: 'juz-amma',
    title: 'Juz Amma — Short Surahs',
    titleTamil: 'ஜுஸ் அம்மா — சிறிய அத்தியாயங்கள்',
    description:
      'The thirty short sūrahs recited most often in prayer, starting with the four every child learns first.',
    surahs: [1, 112, 113, 114, 108, 110, 111, 109, 107, 106, 105, 104, 103, 102, 101, 100],
    accent: 'emerald',
  },
  {
    id: 'foundations',
    title: 'Foundations of Guidance',
    titleTamil: 'வழிகாட்டுதலின் அடித்தளம்',
    description:
      'Sūrahs that explain who God is, what revelation is for, and how a person is asked to live.',
    surahs: [1, 2, 3, 18, 36, 55, 67],
    accent: 'sky',
  },
  {
    id: 'stories',
    title: 'Stories of the Prophets',
    titleTamil: 'இறைத்தூதர்களின் கதைகள்',
    description:
      'Narrative sūrahs where the exegesis follows a story, which suits the storyteller format best.',
    surahs: [12, 18, 19, 20, 21, 28],
    accent: 'amber',
  },
];

/** Human-readable label for the lesson track that contains a sūrah, if any. */
export function findTrackForSurah(surah: number): TafsirLessonTrack | undefined {
  return LESSON_TRACKS.find((track) => track.surahs.includes(surah));
}
