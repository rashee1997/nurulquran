import { Verse, QuranWord } from '../quran/types';

export interface VerifiedGameVerse {
  surahNumber: number;
  surahName: string;
  surahNameArabic: string;
  ayahNumber: number;
  textUthmani: string;
  textSimple: string;
  translationEn: string;
  translationTa: string;
  words: Array<{
    wordIndex: number;
    arabic: string;
    transliteration: string;
    translationEn: string;
  }>;
  audioUrl: string;
}

export const VERIFIED_GAME_VERSES: VerifiedGameVerse[] = [
  // Surah Al-Fatihah (1)
  {
    surahNumber: 1,
    surahName: 'Al-Fatihah',
    surahNameArabic: 'الفاتحة',
    ayahNumber: 1,
    textUthmani: 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ',
    textSimple: 'بسم الله الرحمن الرحيم',
    translationEn: 'In the name of Allah, the Entirely Merciful, the Especially Merciful.',
    translationTa: 'அளவற்ற அருளாளனும், நிகரற்ற அன்புடையோனுமாகிய அல்லாஹ்வின் திருப்பெயரால் (துவங்குகிறேன்).',
    words: [
      { wordIndex: 1, arabic: 'بِسْمِ', transliteration: 'Bismi', translationEn: 'In the name' },
      { wordIndex: 2, arabic: 'ٱللَّهِ', transliteration: 'Allahi', translationEn: 'of Allah' },
      { wordIndex: 3, arabic: 'ٱلرَّحْمَـٰنِ', transliteration: 'Ar-Rahmani', translationEn: 'the Entirely Merciful' },
      { wordIndex: 4, arabic: 'ٱلرَّحِيمِ', transliteration: 'Ar-Raheemi', translationEn: 'the Especially Merciful' },
    ],
    audioUrl: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/1.mp3',
  },
  {
    surahNumber: 1,
    surahName: 'Al-Fatihah',
    surahNameArabic: 'الفاتحة',
    ayahNumber: 2,
    textUthmani: 'ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ',
    textSimple: 'الحمد لله رب العالمين',
    translationEn: '[All] praise is [due] to Allah, Lord of the worlds.',
    translationTa: 'அனைத்துப் புகழும் அகிலங்களின் இறைவனாகிய அல்லாஹ்வுக்கே உரியது.',
    words: [
      { wordIndex: 1, arabic: 'ٱلْحَمْدُ', transliteration: 'Al-hamdu', translationEn: '[All] praise' },
      { wordIndex: 2, arabic: 'لِلَّهِ', transliteration: 'lillahi', translationEn: 'is to Allah' },
      { wordIndex: 3, arabic: 'رَبِّ', transliteration: 'Rabbi', translationEn: 'Lord' },
      { wordIndex: 4, arabic: 'ٱلْعَـٰلَمِينَ', transliteration: 'al-\'alameen', translationEn: 'of the worlds' },
    ],
    audioUrl: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/2.mp3',
  },
  {
    surahNumber: 1,
    surahName: 'Al-Fatihah',
    surahNameArabic: 'الفاتحة',
    ayahNumber: 3,
    textUthmani: 'ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ',
    textSimple: 'الرحمن الرحيم',
    translationEn: 'The Entirely Merciful, the Especially Merciful.',
    translationTa: 'அளவற்ற அருளாளன், நிகரற்ற அன்புடையோன்.',
    words: [
      { wordIndex: 1, arabic: 'ٱلرَّحْمَـٰنِ', transliteration: 'Ar-Rahmani', translationEn: 'The Entirely Merciful' },
      { wordIndex: 2, arabic: 'ٱلرَّحِيمِ', transliteration: 'Ar-Raheemi', translationEn: 'the Especially Merciful' },
    ],
    audioUrl: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/3.mp3',
  },
  {
    surahNumber: 1,
    surahName: 'Al-Fatihah',
    surahNameArabic: 'الفاتحة',
    ayahNumber: 4,
    textUthmani: 'مَـٰلِكِ يَوْمِ ٱلدِّينِ',
    textSimple: 'مالك يوم الدين',
    translationEn: 'Sovereign of the Day of Recompense.',
    translationTa: 'தீர்ப்பு நாளின் அதிபதி.',
    words: [
      { wordIndex: 1, arabic: 'مَـٰلِكِ', transliteration: 'Maliki', translationEn: 'Sovereign' },
      { wordIndex: 2, arabic: 'يَوْمِ', transliteration: 'Yawmi', translationEn: 'of the Day' },
      { wordIndex: 3, arabic: 'ٱلدِّينِ', transliteration: 'ad-Deen', translationEn: 'of Recompense' },
    ],
    audioUrl: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/4.mp3',
  },
  {
    surahNumber: 1,
    surahName: 'Al-Fatihah',
    surahNameArabic: 'الفاتحة',
    ayahNumber: 5,
    textUthmani: 'إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ',
    textSimple: 'إياك نعبد وإياك نستعين',
    translationEn: 'It is You we worship and You we ask for help.',
    translationTa: 'உன்னையே நாங்கள் வணங்குகிறோம்; உன்னிடமே நாங்கள் உதவியும் தேடுகிறோம்.',
    words: [
      { wordIndex: 1, arabic: 'إِيَّاكَ', transliteration: 'Iyyaka', translationEn: 'You [Alone]' },
      { wordIndex: 2, arabic: 'نَعْبُدُ', transliteration: 'na\'budu', translationEn: 'we worship' },
      { wordIndex: 3, arabic: 'وَإِيَّاكَ', transliteration: 'wa-iyyaka', translationEn: 'and You [Alone]' },
      { wordIndex: 4, arabic: 'نَسْتَعِينُ', transliteration: 'nasta\'een', translationEn: 'we ask for help' },
    ],
    audioUrl: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/5.mp3',
  },
  {
    surahNumber: 1,
    surahName: 'Al-Fatihah',
    surahNameArabic: 'الفاتحة',
    ayahNumber: 6,
    textUthmani: 'ٱهْدِنَا ٱلصِّرَٰطَ ٱلْمُسْتَقِيمَ',
    textSimple: 'اهدنا الصراط المستقيم',
    translationEn: 'Guide us to the straight path.',
    translationTa: 'எங்களை நேர்வழியில் செலுத்துவாயாக.',
    words: [
      { wordIndex: 1, arabic: 'ٱهْدِنَا', transliteration: 'Ihdina', translationEn: 'Guide us' },
      { wordIndex: 2, arabic: 'ٱلصِّرَٰطَ', transliteration: 'as-Sirata', translationEn: 'to the path' },
      { wordIndex: 3, arabic: 'ٱلْمُسْتَقِيمَ', transliteration: 'al-Mustaqeem', translationEn: 'the straight' },
    ],
    audioUrl: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/6.mp3',
  },
  {
    surahNumber: 1,
    surahName: 'Al-Fatihah',
    surahNameArabic: 'الفاتحة',
    ayahNumber: 7,
    textUthmani: 'صِرَٰطَ ٱلَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ ٱلْمَغْضُوبِ عَلَيْهِمْ وَلَا ٱلضَّآلِّينَ',
    textSimple: 'صراط الذين أنعمت عليهم غير المغضوب عليهم ولا الضالين',
    translationEn: 'The path of those upon whom You have bestowed favor, not of those who have evoked [Your] anger or of those who are astray.',
    translationTa: 'நீ அருள் புரிந்தாயே அத்தகையோரின் வழியில்; உன் கோபத்திற்கு ஆளானோர் வழியிலும் அல்ல, நெறி தவறியோர் வழியிலும் அல்ல.',
    words: [
      { wordIndex: 1, arabic: 'صِرَٰطَ', transliteration: 'Sirata', translationEn: 'Path' },
      { wordIndex: 2, arabic: 'ٱلَّذِينَ', transliteration: 'alladheena', translationEn: 'of those' },
      { wordIndex: 3, arabic: 'أَنْعَمْتَ', transliteration: 'an\'amta', translationEn: 'You bestowed favor' },
      { wordIndex: 4, arabic: 'عَلَيْهِمْ', transliteration: '\'alayhim', translationEn: 'upon them' },
      { wordIndex: 5, arabic: 'غَيْرِ', transliteration: 'ghayri', translationEn: 'not' },
      { wordIndex: 6, arabic: 'ٱلْمَغْضُوبِ', transliteration: 'al-maghdoobi', translationEn: 'those who evoked anger' },
      { wordIndex: 7, arabic: 'عَلَيْهِمْ', transliteration: '\'alayhim', translationEn: 'upon them' },
      { wordIndex: 8, arabic: 'وَلَا', transliteration: 'wa-la', translationEn: 'and not' },
      { wordIndex: 9, arabic: 'ٱلضَّآلِّينَ', transliteration: 'ad-Daalleen', translationEn: 'those who are astray' },
    ],
    audioUrl: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/7.mp3',
  },

  // Surah Al-Ikhlas (112)
  {
    surahNumber: 112,
    surahName: 'Al-Ikhlas',
    surahNameArabic: 'الإخلاص',
    ayahNumber: 1,
    textUthmani: 'قُلْ هُوَ ٱللَّهُ أَحَدٌ',
    textSimple: 'قل هو الله أحد',
    translationEn: 'Say, "He is Allah, [who is] One."',
    translationTa: 'கூறுவீராக: அவன் அல்லாஹ், ஒருவனே.',
    words: [
      { wordIndex: 1, arabic: 'قُلْ', transliteration: 'Qul', translationEn: 'Say' },
      { wordIndex: 2, arabic: 'هُوَ', transliteration: 'Huwa', translationEn: 'He is' },
      { wordIndex: 3, arabic: 'ٱللَّهُ', transliteration: 'Allahu', translationEn: 'Allah' },
      { wordIndex: 4, arabic: 'أَحَدٌ', transliteration: 'Ahad', translationEn: '[who is] One' },
    ],
    audioUrl: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/6221.mp3',
  },
  {
    surahNumber: 112,
    surahName: 'Al-Ikhlas',
    surahNameArabic: 'الإخلاص',
    ayahNumber: 2,
    textUthmani: 'ٱللَّهُ ٱلصَّمَدُ',
    textSimple: 'الله الصمد',
    translationEn: 'Allah, the Eternal Refuge.',
    translationTa: 'அல்லாஹ் எவரிடத்தும் தேவையற்றவன்; அனைவரும் அவனிடமே தேவையுடையவர்கள்.',
    words: [
      { wordIndex: 1, arabic: 'ٱللَّهُ', transliteration: 'Allahu', translationEn: 'Allah' },
      { wordIndex: 2, arabic: 'ٱلصَّمَدُ', transliteration: 'as-Samad', translationEn: 'the Eternal Refuge' },
    ],
    audioUrl: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/6222.mp3',
  },
  {
    surahNumber: 112,
    surahName: 'Al-Ikhlas',
    surahNameArabic: 'الإخلاص',
    ayahNumber: 3,
    textUthmani: 'لَمْ يَلِدْ وَلَمْ يُولَدْ',
    textSimple: 'لم يلد ولم يولد',
    translationEn: 'He neither begets nor is born.',
    translationTa: 'அவன் எவரையும் பெறவுமில்லை, எவராலும் பெறப்படவுமில்லை.',
    words: [
      { wordIndex: 1, arabic: 'لَمْ', transliteration: 'Lam', translationEn: 'Not' },
      { wordIndex: 2, arabic: 'يَلِدْ', transliteration: 'yalid', translationEn: 'He begets' },
      { wordIndex: 3, arabic: 'وَلَمْ', transliteration: 'wa-lam', translationEn: 'and not' },
      { wordIndex: 4, arabic: 'يُولَدْ', transliteration: 'yoolad', translationEn: 'is born' },
    ],
    audioUrl: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/6223.mp3',
  },
  {
    surahNumber: 112,
    surahName: 'Al-Ikhlas',
    surahNameArabic: 'الإخلاص',
    ayahNumber: 4,
    textUthmani: 'وَلَمْ يَكُن لَّهُۥ كُفُوًا أَحَدٌۢ',
    textSimple: 'ولم يكن له كفوا أحد',
    translationEn: 'Nor is there to Him any equivalent.',
    translationTa: 'அவனுக்கு நிகராக எவரும் இல்லை.',
    words: [
      { wordIndex: 1, arabic: 'وَلَمْ', transliteration: 'Wa-lam', translationEn: 'And not' },
      { wordIndex: 2, arabic: 'يَكُن', transliteration: 'yakun', translationEn: 'is there' },
      { wordIndex: 3, arabic: 'لَّهُۥ', transliteration: 'lahu', translationEn: 'to Him' },
      { wordIndex: 4, arabic: 'كُفُوًا', transliteration: 'kufuwan', translationEn: 'any equivalent' },
      { wordIndex: 5, arabic: 'أَحَدٌۢ', transliteration: 'Ahad', translationEn: 'anyone' },
    ],
    audioUrl: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/6224.mp3',
  },

  // Surah Al-Falaq (113)
  {
    surahNumber: 113,
    surahName: 'Al-Falaq',
    surahNameArabic: 'الفلق',
    ayahNumber: 1,
    textUthmani: 'قُلْ أَعُوذُ بِرَبِّ ٱلْفَلَقِ',
    textSimple: 'قل أعوذ برب الفلق',
    translationEn: 'Say, "I seek refuge in the Lord of daybreak."',
    translationTa: 'கூறுவீராக: விடியலின் இறைவனிடம் நான் பாதுகாப்புத் தேடுகிறேன்.',
    words: [
      { wordIndex: 1, arabic: 'قُلْ', transliteration: 'Qul', translationEn: 'Say' },
      { wordIndex: 2, arabic: 'أَعُوذُ', transliteration: 'a\'oodhu', translationEn: 'I seek refuge' },
      { wordIndex: 3, arabic: 'بِرَبِّ', transliteration: 'bi-Rabbi', translationEn: 'in the Lord' },
      { wordIndex: 4, arabic: 'ٱلْفَلَقِ', transliteration: 'al-Falaq', translationEn: 'of daybreak' },
    ],
    audioUrl: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/6225.mp3',
  },
  {
    surahNumber: 113,
    surahName: 'Al-Falaq',
    surahNameArabic: 'الفلق',
    ayahNumber: 2,
    textUthmani: 'مِن شَرِّ مَا خَلَقَ',
    textSimple: 'من شر ما خلق',
    translationEn: 'From the evil of that which He created.',
    translationTa: 'அவன் படைத்தவற்றின் தீங்கை விட்டும்.',
    words: [
      { wordIndex: 1, arabic: 'مِن', transliteration: 'Min', translationEn: 'From' },
      { wordIndex: 2, arabic: 'شَرِّ', transliteration: 'sharri', translationEn: 'the evil' },
      { wordIndex: 3, arabic: 'مَا', transliteration: 'ma', translationEn: 'of what' },
      { wordIndex: 4, arabic: 'خَلَقَ', transliteration: 'khalaq', translationEn: 'He created' },
    ],
    audioUrl: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/6226.mp3',
  },
  {
    surahNumber: 113,
    surahName: 'Al-Falaq',
    surahNameArabic: 'الفلق',
    ayahNumber: 3,
    textUthmani: 'وَمِن شَرِّ غَاسِقٍ إِذَا وَقَبَ',
    textSimple: 'ومن شر غاسق إذا وقب',
    translationEn: 'And from the evil of darkness when it settles.',
    translationTa: 'இருள் பரவும் போது ஏற்படும் இரவின் தீங்கை விட்டும்.',
    words: [
      { wordIndex: 1, arabic: 'وَمِن', transliteration: 'Wa-min', translationEn: 'And from' },
      { wordIndex: 2, arabic: 'شَرِّ', transliteration: 'sharri', translationEn: 'the evil' },
      { wordIndex: 3, arabic: 'غَاسِقٍ', transliteration: 'ghasiqin', translationEn: 'of darkness' },
      { wordIndex: 4, arabic: 'إِذَا', transliteration: 'idha', translationEn: 'when' },
      { wordIndex: 5, arabic: 'وَقَبَ', transliteration: 'waqab', translationEn: 'it settles' },
    ],
    audioUrl: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/6227.mp3',
  },
  {
    surahNumber: 113,
    surahName: 'Al-Falaq',
    surahNameArabic: 'الفلق',
    ayahNumber: 4,
    textUthmani: 'وَمِن شَرِّ ٱلنَّفَّـٰثَـٰتِ فِى ٱلْعُقَدِ',
    textSimple: 'ومن شر النفاثات في العقد',
    translationEn: 'And from the evil of the blowers in knots.',
    translationTa: 'முடிச்சுகளில் ஊதும் (சூனியக்காரிகளின்) தீங்கை விட்டும்.',
    words: [
      { wordIndex: 1, arabic: 'وَمِن', transliteration: 'Wa-min', translationEn: 'And from' },
      { wordIndex: 2, arabic: 'شَرِّ', transliteration: 'sharri', translationEn: 'the evil' },
      { wordIndex: 3, arabic: 'ٱلنَّفَّـٰثَـٰتِ', transliteration: 'an-naffathati', translationEn: 'of blowers' },
      { wordIndex: 4, arabic: 'فِى', transliteration: 'fee', translationEn: 'in' },
      { wordIndex: 5, arabic: 'ٱلْعُقَدِ', transliteration: 'al-\'uqad', translationEn: 'the knots' },
    ],
    audioUrl: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/6228.mp3',
  },
  {
    surahNumber: 113,
    surahName: 'Al-Falaq',
    surahNameArabic: 'الفلق',
    ayahNumber: 5,
    textUthmani: 'وَمِن شَرِّ حَاسِدٍ إِذَا حَسَدَ',
    textSimple: 'ومن شر حاسد إذا حسد',
    translationEn: 'And from the evil of an envier when he envies.',
    translationTa: 'பொறாமைக்காரனின் தீங்கை விட்டும், அவன் பொறாமைப்படும் போது.',
    words: [
      { wordIndex: 1, arabic: 'وَمِن', transliteration: 'Wa-min', translationEn: 'And from' },
      { wordIndex: 2, arabic: 'شَرِّ', transliteration: 'sharri', translationEn: 'the evil' },
      { wordIndex: 3, arabic: 'حَاسِدٍ', transliteration: 'hasidin', translationEn: 'of an envier' },
      { wordIndex: 4, arabic: 'إِذَا', transliteration: 'idha', translationEn: 'when' },
      { wordIndex: 5, arabic: 'حَسَدَ', transliteration: 'hasad', translationEn: 'he envies' },
    ],
    audioUrl: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/6229.mp3',
  },

  // Surah An-Nas (114)
  {
    surahNumber: 114,
    surahName: 'An-Nas',
    surahNameArabic: 'الناس',
    ayahNumber: 1,
    textUthmani: 'قُلْ أَعُوذُ بِرَبِّ ٱلنَّاسِ',
    textSimple: 'قل أعوذ برب الناس',
    translationEn: 'Say, "I seek refuge in the Lord of mankind."',
    translationTa: 'கூறுவீராக: மனிதர்களின் இறைவனிடம் நான் பாதுகாப்புத் தேடுகிறேன்.',
    words: [
      { wordIndex: 1, arabic: 'قُلْ', transliteration: 'Qul', translationEn: 'Say' },
      { wordIndex: 2, arabic: 'أَعُوذُ', transliteration: 'a\'oodhu', translationEn: 'I seek refuge' },
      { wordIndex: 3, arabic: 'بِرَبِّ', transliteration: 'bi-Rabbi', translationEn: 'in the Lord' },
      { wordIndex: 4, arabic: 'ٱلنَّاسِ', transliteration: 'an-Nas', translationEn: 'of mankind' },
    ],
    audioUrl: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/6230.mp3',
  },
  {
    surahNumber: 114,
    surahName: 'An-Nas',
    surahNameArabic: 'الناس',
    ayahNumber: 2,
    textUthmani: 'مَلِكِ ٱلنَّاسِ',
    textSimple: 'ملك الناس',
    translationEn: 'The Sovereign of mankind.',
    translationTa: 'மனிதர்களின் அரசன்.',
    words: [
      { wordIndex: 1, arabic: 'مَلِكِ', transliteration: 'Maliki', translationEn: 'The Sovereign' },
      { wordIndex: 2, arabic: 'ٱلنَّاسِ', transliteration: 'an-Nas', translationEn: 'of mankind' },
    ],
    audioUrl: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/6231.mp3',
  },
  {
    surahNumber: 114,
    surahName: 'An-Nas',
    surahNameArabic: 'الناس',
    ayahNumber: 3,
    textUthmani: 'إِلَـٰهِ ٱلنَّاسِ',
    textSimple: 'إله الناس',
    translationEn: 'The God of mankind.',
    translationTa: 'மனிதர்களின் உண்மையான வணக்கத்திற்குரியவன்.',
    words: [
      { wordIndex: 1, arabic: 'إِلَـٰهِ', transliteration: 'Ilahi', translationEn: 'The God' },
      { wordIndex: 2, arabic: 'ٱلنَّاسِ', transliteration: 'an-Nas', translationEn: 'of mankind' },
    ],
    audioUrl: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/6232.mp3',
  },
  {
    surahNumber: 114,
    surahName: 'An-Nas',
    surahNameArabic: 'الناس',
    ayahNumber: 4,
    textUthmani: 'مِن شَرِّ ٱلْوَسْوَاسِ ٱلْخَنَّاسِ',
    textSimple: 'من شر الوسواس الخناس',
    translationEn: 'From the evil of the retreating whisperer.',
    translationTa: 'மறைந்திருந்து தீய யோசனை உண்டாக்கும் (ஷைத்தானின்) தீங்கை விட்டும்.',
    words: [
      { wordIndex: 1, arabic: 'مِن', transliteration: 'Min', translationEn: 'From' },
      { wordIndex: 2, arabic: 'شَرِّ', transliteration: 'sharri', translationEn: 'the evil' },
      { wordIndex: 3, arabic: 'ٱلْوَسْوَاسِ', transliteration: 'al-waswasi', translationEn: 'of the whisperer' },
      { wordIndex: 4, arabic: 'ٱلْخَنَّاسِ', transliteration: 'al-khannas', translationEn: 'the retreating' },
    ],
    audioUrl: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/6233.mp3',
  },
  {
    surahNumber: 114,
    surahName: 'An-Nas',
    surahNameArabic: 'الناس',
    ayahNumber: 5,
    textUthmani: 'ٱلَّذِى يُوَسْوِسُ فِى صُدُورِ ٱلنَّاسِ',
    textSimple: 'الذي يوسوس في صدور الناس',
    translationEn: 'Who whispers [evil] into the breasts of mankind.',
    translationTa: 'அவன் மனிதர்களின் நெஞ்சங்களில் தீய யோசனைகளை உண்டாக்குகிறான்.',
    words: [
      { wordIndex: 1, arabic: 'ٱلَّذِى', transliteration: 'Alladhee', translationEn: 'Who' },
      { wordIndex: 2, arabic: 'يُوَسْوِسُ', transliteration: 'yuwaswisu', translationEn: 'whispers' },
      { wordIndex: 3, arabic: 'فِى', transliteration: 'fee', translationEn: 'into' },
      { wordIndex: 4, arabic: 'صُدُورِ', transliteration: 'sudoori', translationEn: 'the breasts' },
      { wordIndex: 5, arabic: 'ٱلنَّاسِ', transliteration: 'an-Nas', translationEn: 'of mankind' },
    ],
    audioUrl: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/6234.mp3',
  },
  {
    surahNumber: 114,
    surahName: 'An-Nas',
    surahNameArabic: 'الناس',
    ayahNumber: 6,
    textUthmani: 'مِنَ ٱلْجِنَّةِ وَٱلنَّاسِ',
    textSimple: 'من الجنة والناس',
    translationEn: 'From among the jinn and mankind.',
    translationTa: 'ஜின்களிலும் மனிதர்களிலும் உள்ள (அத்தகைய தீயோரை விட்டும்).',
    words: [
      { wordIndex: 1, arabic: 'مِنَ', transliteration: 'Mina', translationEn: 'From' },
      { wordIndex: 2, arabic: 'ٱلْجِنَّةِ', transliteration: 'al-jinnati', translationEn: 'the jinn' },
      { wordIndex: 3, arabic: 'وَٱلنَّاسِ', transliteration: 'wa-an-Nas', translationEn: 'and mankind' },
    ],
    audioUrl: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/6235.mp3',
  },

  // Surah Al-Kawthar (108)
  {
    surahNumber: 108,
    surahName: 'Al-Kawthar',
    surahNameArabic: 'الكوثر',
    ayahNumber: 1,
    textUthmani: 'إِنَّآ أَعْطَيْنَـٰكَ ٱلْكَوْثَرَ',
    textSimple: 'إنا أعطيناك الكوثر',
    translationEn: 'Indeed, We have granted you, [O Muhammad], al-Kawthar.',
    translationTa: '(நபியே!) நிச்சயமாக நாம் உமக்கு அல்கவ்ஸரை (ஏராளமான நன்மைகளை) கொடுத்தோம்.',
    words: [
      { wordIndex: 1, arabic: 'إِنَّآ', transliteration: 'Inna', translationEn: 'Indeed, We' },
      { wordIndex: 2, arabic: 'أَعْطَيْنَـٰكَ', transliteration: 'a\'taynaka', translationEn: 'have granted you' },
      { wordIndex: 3, arabic: 'ٱلْكَوْثَرَ', transliteration: 'al-Kawthar', translationEn: 'al-Kawthar' },
    ],
    audioUrl: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/6205.mp3',
  },
  {
    surahNumber: 108,
    surahName: 'Al-Kawthar',
    surahNameArabic: 'الكوثر',
    ayahNumber: 2,
    textUthmani: 'فَصَلِّ لِرَبِّكَ وَٱنْحَرْ',
    textSimple: 'فصل لربك وانحر',
    translationEn: 'So pray to your Lord and sacrifice [to Him alone].',
    translationTa: 'ஆகவே, உமது இறைவனுக்காக நீர் தொழுது, குர்பானியும் கொடுப்பீராக.',
    words: [
      { wordIndex: 1, arabic: 'فَصَلِّ', transliteration: 'Fa-salli', translationEn: 'So pray' },
      { wordIndex: 2, arabic: 'لِرَبِّكَ', transliteration: 'li-Rabbika', translationEn: 'to your Lord' },
      { wordIndex: 3, arabic: 'وَٱنْحَرْ', transliteration: 'wanhar', translationEn: 'and sacrifice' },
    ],
    audioUrl: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/6206.mp3',
  },
  {
    surahNumber: 108,
    surahName: 'Al-Kawthar',
    surahNameArabic: 'الكوثر',
    ayahNumber: 3,
    textUthmani: 'إِنَّ شَانِئَكَ هُوَ ٱلْأَبْتَرُ',
    textSimple: 'إن شانئك هو الأبتر',
    translationEn: 'Indeed, your enemy is the one cut off.',
    translationTa: 'நிச்சயமாக உம்மைப் பகைப்பவனே சந்ததியற்றவன்.',
    words: [
      { wordIndex: 1, arabic: 'إِنَّ', transliteration: 'Inna', translationEn: 'Indeed' },
      { wordIndex: 2, arabic: 'شَانِئَكَ', transliteration: 'shani\'aka', translationEn: 'your enemy' },
      { wordIndex: 3, arabic: 'هُوَ', transliteration: 'huwa', translationEn: 'he is' },
      { wordIndex: 4, arabic: 'ٱلْأَبْتَرُ', transliteration: 'al-abtar', translationEn: 'the one cut off' },
    ],
    audioUrl: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/6207.mp3',
  },

  // Surah Al-Asr (103)
  {
    surahNumber: 103,
    surahName: 'Al-\'Asr',
    surahNameArabic: 'العصر',
    ayahNumber: 1,
    textUthmani: 'وَٱلْعَصْرِ',
    textSimple: 'والعصر',
    translationEn: 'By time,',
    translationTa: 'காலத்தின் மீது சத்தியமாக,',
    words: [
      { wordIndex: 1, arabic: 'وَٱلْعَصْرِ', transliteration: 'Wal-\'asr', translationEn: 'By time' },
    ],
    audioUrl: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/6177.mp3',
  },
  {
    surahNumber: 103,
    surahName: 'Al-\'Asr',
    surahNameArabic: 'العصر',
    ayahNumber: 2,
    textUthmani: 'إِنَّ ٱلْإِنسَـٰنَ لَفِى خُسْرٍ',
    textSimple: 'إن الإنسان لفي خسر',
    translationEn: 'Indeed, mankind is in loss,',
    translationTa: 'நிச்சயமாக மனிதன் நஷ்டத்தில் இருக்கிறான்.',
    words: [
      { wordIndex: 1, arabic: 'إِنَّ', transliteration: 'Inna', translationEn: 'Indeed' },
      { wordIndex: 2, arabic: 'ٱلْإِنسَـٰنَ', transliteration: 'al-insana', translationEn: 'mankind' },
      { wordIndex: 3, arabic: 'لَفِى', transliteration: 'lafee', translationEn: 'is in' },
      { wordIndex: 4, arabic: 'خُسْرٍ', transliteration: 'khusr', translationEn: 'loss' },
    ],
    audioUrl: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/6178.mp3',
  },
  {
    surahNumber: 103,
    surahName: 'Al-\'Asr',
    surahNameArabic: 'العصر',
    ayahNumber: 3,
    textUthmani: 'إِلَّا ٱلَّذِينَ ءَامَنُوا۟ وَعَمِلُوا۟ ٱلصَّـٰلِحَـٰتِ وَتَوَاصَوْا۟ بِٱلْحَقِّ وَتَوَاصَوْا۟ بِٱلصَّبْرِ',
    textSimple: 'إلا الذين آمنوا وعملوا الصالحات وتواصوا بالحق وتواصوا بالصبر',
    translationEn: 'Except for those who have believed and done righteous deeds and advised each other to truth and advised each other to patience.',
    translationTa: 'ஆனால் யார் ஈமான் கொண்டு நற்செயல்கள் செய்து, சத்தியத்தைக் கொண்டு ஒருவருக்கொருவர் உபதேசம் செய்து, பொறுமையையும் ஒருவருக்கொருவர் உபதேசித்தார்களோ அவர்களைத் தவிர.',
    words: [
      { wordIndex: 1, arabic: 'إِلَّا', transliteration: 'Illa', translationEn: 'Except' },
      { wordIndex: 2, arabic: 'ٱلَّذِينَ', transliteration: 'alladheena', translationEn: 'those who' },
      { wordIndex: 3, arabic: 'ءَامَنُوا۟', transliteration: 'amanoo', translationEn: 'believed' },
      { wordIndex: 4, arabic: 'وَعَمِلُوا۟', transliteration: 'wa-\'amiloo', translationEn: 'and did' },
      { wordIndex: 5, arabic: 'ٱلصَّـٰلِحَـٰتِ', transliteration: 'as-salihati', translationEn: 'righteous deeds' },
      { wordIndex: 6, arabic: 'وَتَوَاصَوْا۟', transliteration: 'wa-tawasaw', translationEn: 'and advised each other' },
      { wordIndex: 7, arabic: 'بِٱلْحَقِّ', transliteration: 'bil-haqqi', translationEn: 'to the truth' },
      { wordIndex: 8, arabic: 'وَتَوَاصَوْا۟', transliteration: 'wa-tawasaw', translationEn: 'and advised each other' },
      { wordIndex: 9, arabic: 'بِٱلصَّبْرِ', transliteration: 'bis-sabr', translationEn: 'to patience' },
    ],
    audioUrl: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/6179.mp3',
  },
];

/**
 * Helper to get available verified Surahs for quick play
 */
export function getAvailableSurahs() {
  const surahMap = new Map<number, { surahNumber: number; surahName: string; surahNameArabic: string; totalAyahs: number }>();
  for (const v of VERIFIED_GAME_VERSES) {
    if (!surahMap.has(v.surahNumber)) {
      surahMap.set(v.surahNumber, {
        surahNumber: v.surahNumber,
        surahName: v.surahName,
        surahNameArabic: v.surahNameArabic,
        totalAyahs: 1,
      });
    } else {
      const cur = surahMap.get(v.surahNumber)!;
      cur.totalAyahs += 1;
    }
  }
  return Array.from(surahMap.values());
}
