/**
 * Verified offline corpus.
 *
 * PROVENANCE — every entry below is the *exact* verse, not a paraphrase or a
 * placeholder: Uthmani text as published by the AlQuran Cloud `quran-uthmani`
 * edition, English from Saheeh International (`en.sahih`), Tamil from the
 * `ta.tamil` edition, with the global ayah number from the Mushaf ordering.
 *
 * PURPOSE — when the network is unavailable the reader may still display these
 * specific verses, because the text is identical to what the API returns. It must
 * never be used to satisfy a request for a verse it does not contain: substituting
 * one verse for another would present non-scripture as scripture. Anything absent
 * from this corpus fails loudly instead (see `QuranUnavailableError`).
 */

export interface VerifiedVerseRecord {
  surah: number;
  ayah: number;
  /** 1-based position of the ayah in the whole Mushaf (used for audio URLs). */
  globalNumber: number;
  textUthmani: string;
  translationEn: string;
  translationTa: string;
}

export const VERIFIED_OFFLINE_VERSES: readonly VerifiedVerseRecord[] = [
  {
    surah: 1,
    ayah: 1,
    globalNumber: 1,
    textUthmani: 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ',
    translationEn: 'In the name of Allah, the Entirely Merciful, the Especially Merciful.',
    translationTa: 'அளவற்ற அருளாளனும், நிகரற்ற அன்புடையோனுமாகிய அல்லாஹ்வின் பெயரால் (துவங்குகிறேன்).',
  },
  {
    surah: 1,
    ayah: 2,
    globalNumber: 2,
    textUthmani: 'ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ',
    translationEn: '[All] praise is [due] to Allah, Lord of the worlds.',
    translationTa: 'அனைத்துப் புகழும் அகிலங்களின் இறைவனாகிய அல்லாஹ்வுக்கே உரியது.',
  },
  {
    surah: 1,
    ayah: 3,
    globalNumber: 3,
    textUthmani: 'ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ',
    translationEn: 'The Entirely Merciful, the Especially Merciful,',
    translationTa: 'அவன் அளவற்ற அருளாளன், நிகரற்ற அன்புடையோன்.',
  },
  {
    surah: 1,
    ayah: 4,
    globalNumber: 4,
    textUthmani: 'مَـٰلِكِ يَوْمِ ٱلدِّينِ',
    translationEn: 'Sovereign of the Day of Recompense.',
    translationTa: 'தீர்ப்பு நாளின் அதிபதி.',
  },
  {
    surah: 1,
    ayah: 5,
    globalNumber: 5,
    textUthmani: 'إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ',
    translationEn: 'It is You we worship and You we ask for help.',
    translationTa: 'உன்னையே நாங்கள் வணங்குகிறோம்; உன்னிடமே நாங்கள் உதவியும் தேடுகிறோம்.',
  },
  {
    surah: 1,
    ayah: 6,
    globalNumber: 6,
    textUthmani: 'ٱهْدِنَا ٱلصِّرَٰطَ ٱلْمُسْتَقِيمَ',
    translationEn: 'Guide us to the straight path -',
    translationTa: 'எங்களை நீ நேரான வழியில் செலுத்துவாயாக!',
  },
  {
    surah: 1,
    ayah: 7,
    globalNumber: 7,
    textUthmani:
      'صِرَٰطَ ٱلَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ ٱلْمَغْضُوبِ عَلَيْهِمْ وَلَا ٱلضَّآلِّينَ',
    translationEn:
      'The path of those upon whom You have bestowed favor, not of those who have evoked [Your] anger or of those who are astray.',
    translationTa:
      'அவ்வழி எவர் மீது நீ அருள்புரிந்தாயோ அவ்வழி; கோபத்திற்கு ஆளானோர் வழியுமல்ல, வழிதவறியோர் வழியுமல்ல.',
  },
  {
    surah: 112,
    ayah: 1,
    globalNumber: 6222,
    textUthmani: 'قُلْ هُوَ ٱللَّهُ أَحَدٌ',
    translationEn: 'Say, "He is Allah, [who is] One,',
    translationTa: '(நபியே!) நீர் கூறுவீராக: அவன் அல்லாஹ், ஒருவனே.',
  },
  {
    surah: 112,
    ayah: 2,
    globalNumber: 6223,
    textUthmani: 'ٱللَّهُ ٱلصَّمَدُ',
    translationEn: 'Allah, the Eternal Refuge.',
    translationTa: 'அல்லாஹ் தேவையற்றவன் (அனைத்தும் அவனிடமே தேவையுடையவை).',
  },
  {
    surah: 112,
    ayah: 3,
    globalNumber: 6224,
    textUthmani: 'لَمْ يَلِدْ وَلَمْ يُولَدْ',
    translationEn: 'He neither begets nor is born,',
    translationTa: 'அவன் எவரையும் பெறவுமில்லை; (எவராலும்) பெறப்படவுமில்லை.',
  },
  {
    surah: 112,
    ayah: 4,
    globalNumber: 6225,
    textUthmani: 'وَلَمْ يَكُن لَّهُۥ كُفُوًا أَحَدٌۢ',
    translationEn: 'Nor is there to Him any equivalent."',
    translationTa: 'மேலும் அவனுக்கு நிகராக எவரும் இல்லை.',
  },
  {
    surah: 113,
    ayah: 1,
    globalNumber: 6226,
    textUthmani: 'قُلْ أَعُوذُ بِرَبِّ ٱلْفَلَقِ',
    translationEn: 'Say, "I seek refuge in the Lord of daybreak',
    translationTa: '(நபியே!) நீர் கூறுவீராக: விடியற்காலையின் இறைவனிடம் நான் பாதுகாப்புத் தேடுகிறேன்.',
  },
  {
    surah: 114,
    ayah: 1,
    globalNumber: 6231,
    textUthmani: 'قُلْ أَعُوذُ بِرَبِّ ٱلنَّاسِ',
    translationEn: 'Say, "I seek refuge in the Lord of mankind,',
    translationTa: '(நபியே!) நீர் கூறுவீராக: மனிதர்களின் இறைவனிடம் நான் பாதுகாப்புத் தேடுகிறேன்.',
  },
];

const CORPUS_INDEX = new Map<string, VerifiedVerseRecord>(
  VERIFIED_OFFLINE_VERSES.map((record) => [`${record.surah}:${record.ayah}`, record])
);

/** Returns the verified record for this exact verse, or `undefined` when absent. */
export function getVerifiedOfflineVerse(surah: number, ayah: number): VerifiedVerseRecord | undefined {
  return CORPUS_INDEX.get(`${surah}:${ayah}`);
}

/** True when this exact verse can be served without a network round-trip. */
export function hasVerifiedOfflineVerse(surah: number, ayah: number): boolean {
  return CORPUS_INDEX.has(`${surah}:${ayah}`);
}
