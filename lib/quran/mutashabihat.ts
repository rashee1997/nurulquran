/**
 * Mutashabihat al-Quran (Similar Verses) Knowledge Base & Token Diff Engine.
 * Essential pedagogical utility for Quran memorizers to disambiguate verses with subtle lexical differences.
 *
 * The five entries above are hand-curated with real classical mnemonics. Beyond them, a
 * computed index (below) scans the whole mushaf for verses that share most of their
 * wording, using an inverted index over distinctive words so the search stays close to
 * linear instead of the 6236² comparisons a naive scan would need.
 */
import { quranProvider } from './alquran-cloud';
import { SURAHS } from './surahs';
import { db } from '../db';

export interface MutashabihEntry {
  id: string;
  category: string;
  topicTitleEn: string;
  topicTitleTa: string;
  mnemonicEn: string;
  mnemonicTa: string;
  pair: [
    {
      surah: number;
      ayah: number;
      surahName: string;
      textUthmani: string;
      translationEn: string;
      translationTa?: string;
      uniqueTokens: string[];
    },
    {
      surah: number;
      ayah: number;
      surahName: string;
      textUthmani: string;
      translationEn: string;
      translationTa?: string;
      uniqueTokens: string[];
    }
  ];
}

export interface DiffToken {
  text: string;
  type: 'same' | 'added' | 'removed' | 'modified';
}

export const MUTASHABIHAT_DATASET: MutashabihEntry[] = [
  {
    id: 'm-2-48-123',
    category: 'Intercession and Ransom',
    topicTitleEn: 'Day of Judgment: Intercession vs. Ransom Order',
    topicTitleTa: 'மறுமை நாள்: பரிந்துரை மற்றும் பகர ஈடு வரிசை மாற்றம்',
    mnemonicEn: 'In Ayah 48, Shafa\'ah (intercession) comes first before \'Adl (ransom). In Ayah 123, \'Adl (ransom) comes first before Shafa\'ah.',
    mnemonicTa: 'வசனம் 48-ல் ஷஃபாஅத் (பரிந்துரை) முதலில் வருகிறது; வசனம் 123-ல் அத்ல் (பகர ஈடு) முதலில் வருகிறது.',
    pair: [
      {
        surah: 2,
        ayah: 48,
        surahName: 'Al-Baqarah',
        textUthmani: 'وَٱتَّقُوا۟ يَوْمًۭا لَّا تَجْزِى نَفْسٌ عَن نَّفْسٍۢ شَيْـًۭٔا وَلَا يُقْبَلُ مِنْهَا شَفَـٰعَةٌۭ وَلَا يُؤْخَذُ مِنْهَا عَدْلٌۭ وَلَا هُمْ يُنصَرُونَ',
        translationEn: 'And fear a Day when no soul will suffice for another soul at all, nor will intercession be accepted from it, nor will compensation be taken from it, nor will they be helped.',
        translationTa: 'எந்த ஓர் ஆத்மாவும் மற்றோர் ஆத்மாவுக்கு எவ்விதப் பயனும் அளிக்க முடியாத ஒரு நாளை அஞ்சிக் கொள்ளுங்கள்; அன்றியும் அதனிடமிருந்து எந்தப் பரிந்துரையும் ஏற்றுக்கொள்ளப்பட மாட்டாது; அதற்குப் பகரமும் பெறப்பட மாட்டாது; அவர்கள் உதவியும் செய்யப்பட மாட்டார்கள்.',
        uniqueTokens: ['شَفَـٰعَةٌۭ', 'عَدْلٌۭ'],
      },
      {
        surah: 2,
        ayah: 123,
        surahName: 'Al-Baqarah',
        textUthmani: 'وَٱتَّقُوا۟ يَوْمًۭا لَّا تَجْزِى نَفْسٌ عَن نَّفْسٍۢ شَيْـًۭٔا وَلَا يُقْبَلُ مِنْهَا عَدْلٌۭ وَلَا تَنفَعُهَا شَفَـٰعَةٌۭ وَلَا هُمْ يُنصَرُونَ',
        translationEn: 'And fear a Day when no soul will suffice for another soul at all, nor will compensation be accepted from it, nor will any intercession benefit it, nor will they be helped.',
        translationTa: 'எந்த ஓர் ஆத்மாவும் மற்றோர் ஆத்மாவுக்கு எவ்விதப் பயனும் அளிக்க முடியாத ஒரு நாளை அஞ்சிக் கொள்ளுங்கள்; அதனிடமிருந்து எந்தப் பகரமும் ஏற்றுக்கொள்ளப்பட மாட்டாது; அதற்கு எந்தப் பரிந்துரையும் பயனளிக்காது; அவர்கள் உதவியும் செய்யப்பட மாட்டார்கள்.',
        uniqueTokens: ['عَدْلٌۭ', 'تَنفَعُهَا شَفَـٰعَةٌۭ'],
      },
    ],
  },
  {
    id: 'm-2-58-7-161',
    category: 'Entering the Blessed City',
    topicTitleEn: 'Entering the City: Order of Eating and Entering',
    topicTitleTa: 'ஊருக்குள் நுழைதல்: உண்பது மற்றும் நுழைவது தொடர்பான வரிசை',
    mnemonicEn: 'Al-Baqarah 2:58 starts with "Enter this city, and eat", while Al-A\'raf 7:161 says "Dwell in this city and eat". In Baqarah, "Kulu" (eat) has a Fa ("Fa-kulu") and "Raghadan" is mentioned.',
    mnemonicTa: 'அல்-பகராவில் "உட்புகுங்கள், தாராளமாக உண்ணுங்கள் (ஃபகுலூ ரகதன்)" எனவும், அல்-அஃராஃபில் "வசிக்கவும், உண்ணவும் (குலூ)" எனவும் வந்துள்ளது.',
    pair: [
      {
        surah: 2,
        ayah: 58,
        surahName: 'Al-Baqarah',
        textUthmani: 'وَإِذْ قُلْنَا ٱدْخُلُوا۟ هَـٰذِهِ ٱلْقَرْيَةَ فَكُلُوا۟ مِنْهَا حَيْثُ شِئْتُمْ رَغَدًۭا وَٱدْخُلُوا۟ ٱلْبَابَ سُجَّدًۭا وَقُولُوا۟ حِطَّةٌۭ نَّغْفِرْ لَكُمْ خَطَـٰیَـٰكُمْ ۚ وَسَنَزِيدُ ٱلْمُحْسِنِينَ',
        translationEn: 'And [recall] when We said, "Enter this city and eat from it wherever you will in abundance and enter the gate bowing down and say, \'Relieve us of our burdens.\' We will forgive you your sins, and We will increase the doers of good [in reward]."',
        translationTa: 'இவ்வூருக்குள் நுழையுங்கள்; அங்கு நீங்கள் விரும்பிய இடங்களில் தாராளமாகப் புசியுங்கள்; அதன் வாயிலில் சிரம் பணிந்தவர்களாக நுழையுங்கள்; ஹிஃத்தத்துன் (எங்கள் பாவங்களைப் போக்கிவிடுவாயாக) என்று கூறுங்கள்; உங்கள் பிழைகளை நாம் மன்னிப்போம்; நன்மைகளைச் செய்வோருக்கு நாம் மேன்மேலும் வழங்குவோம்.',
        uniqueTokens: ['فَكُلُوا۟', 'رَغَدًۭا', 'نَّغْفِرْ', 'وَسَنَزِيدُ'],
      },
      {
        surah: 7,
        ayah: 161,
        surahName: "Al-A'raf",
        textUthmani: 'وَإِذْ قِيلَ لَهُمُ ٱسْكُنُوا۟ هَـٰذِهِ ٱلْقَرْيَةَ وَكُلُوا۟ مِنْهَا حَيْثُ شِئْتُمْ وَقُولُوا۟ حِطَّةٌۭ وَٱدْخُلُوا۟ ٱلْبَابَ سُجَّدًۭا نَّغْفِرْ لَكُمْ خَطِيٓـَٔـٰتِكُمْ ۚ سَنَزِيدُ ٱلْمُحْسِنِينَ',
        translationEn: 'And [mention] when it was said to them, "Dwell in this city and eat from it wherever you will and say, \'Relieve us of our burdens,\' and enter the gate bowing humbly; We will forgive you your sins. We will increase the doers of good [in reward]."',
        translationTa: 'இவ்வூரில் நீங்கள் குடியிருங்கள்; அங்கு நீங்கள் விரும்பிய இடங்களில் உண்ணுங்கள்; ஹிஃத்தத்துன் (பாவங்களை மன்னித்தருள்வாயாக) எனக் கூறுங்கள்; வாயிலில் தலைசாய்த்தவர்களாக நுழையுங்கள்; உங்கள் பாவங்களை நாம் மன்னிப்போம்; நன்மை செய்வோருக்கு நாம் மேன்மேலும் வழங்குவோம் என்று கூறப்பட்டதை நினைவூட்டுவீராக.',
        uniqueTokens: ['ٱسْكُنُوا۟', 'وَكُلُوا۟', 'خَطِيٓـَٔـٰتِكُمْ', 'سَنَزِيدُ'],
      },
    ],
  },
  {
    id: 'm-2-136-3-84',
    category: 'Belief in Previous Revelations',
    topicTitleEn: 'Creed of Faith: "Asbāt" and Letters of Revelation',
    topicTitleTa: 'ஈமானின் பிரகடனம்: நபிமார்கள் மற்றும் இறக்கப்பட்ட வேதங்கள்',
    mnemonicEn: 'In Baqarah 2:136: "Wama ootiya Moosa wa \'Eesa". In Aal-Imran 3:84: "Wama ootiya Moosa wa \'Eesa wan-nabiyyoon". Baqarah uses plural "Qooloo" (Say ye), Aal-Imran uses singular "Qul" (Say thou).',
    mnemonicTa: 'அல்-பகராவில் பன்மையாக "கூலூ" (கூறுங்கள்) என்றும், ஆலு இம்ரானில் ஒருமையாக "குல்" (கூறுவீராக) என்றும் ஆரம்பமாகிறது.',
    pair: [
      {
        surah: 2,
        ayah: 136,
        surahName: 'Al-Baqarah',
        textUthmani: 'قُولُوٓا۟ ءَامَنَّا بِٱللَّهِ وَمَآ أُنزِلَ إِلَيْنَا وَمَآ أُنزِلَ إِلَىٰٓ إِبْرَٰهِـۧمَ وَإِسْمَـٰعِيلَ وَإِسْحَـٰقَ وَيَعْقُوبَ وَٱلْأَسْبَاطِ وَمَآ أُوتِىَ مُوسَىٰ وَعِيسَىٰ وَمَآ أُوتِىَ ٱلنَّبِيُّونَ مِن رَّبِّهِمْ لَا نُفَرِّقُ بَيْنَ أَحَدٍۢ مِّنْهُمْ وَنَحْنُ لَهُۥ مُسْلِمُونَ',
        translationEn: 'Say, [O believers], "We have believed in Allah and what has been revealed to us and what has been revealed to Abraham and Ishmael and Isaac and Jacob and the Descendants and what was given to Moses and Jesus and what was given to the prophets from their Lord. We make no distinction between any of them, and we are Muslims [in submission] to Him."',
        translationTa: 'நீங்கள் கூறுங்கள்: "நாங்கள் அல்லாஹ்வையும், எமக்கு அருளப்பட்டதையும், இப்ராஹீம், இஸ்மாயீல், இஸ்ஹாக், யஃகூப் ஆகியோருக்கும் அவர்களின் சந்ததியினருக்கும் அருளப்பட்டதையும், மூஸா, ஈஸா ஆகியோருக்கும் ஏனைய இறைத்தூதர்களுக்கும் அவர்களின் இறைவனிடமிருந்து வழங்கப்பட்டவற்றையும் நம்பினோம்; அவர்களுக்கிடையே நாம் எவ்விதப் பாகுபாடும் காட்ட மாட்டோம்; நாம் அவனுக்கே முற்றிலும் வழிப்பட்டவர்கள்."',
        uniqueTokens: ['قُولُوٓا۟', 'وَمَآ أُوتِىَ ٱلنَّبِيُّونَ'],
      },
      {
        surah: 3,
        ayah: 84,
        surahName: "Aal 'Imran",
        textUthmani: 'قُلْ ءَامَنَّا بِٱللَّهِ وَمَآ أُنزِلَ عَلَيْنَا وَمَآ أُنزِلَ عَلَىٰٓ إِبْرَٰهِيمَ وَإِسْمَـٰعِيلَ وَإِسْحَـٰقَ وَيَعْقُوبَ وَٱلْأَسْبَاطِ وَمَآ أُوتِىَ مُوسَىٰ وَعِيسَىٰ وَٱلنَّبِيُّونَ مِن رَّبِّهِمْ لَا نُفَرِّقُ بَيْنَ أَحَدٍۢ مِّنْهُمْ وَنَحْنُ لَهُۥ مُسْلِمُونَ',
        translationEn: 'Say, "We have believed in Allah and in what was revealed to us and what was revealed to Abraham, Ishmael, Isaac, Jacob, and the Descendants, and in what was given to Moses and Jesus and to the prophets from their Lord. We make no distinction between any of them, and we are Muslims [submitting] to Him."',
        translationTa: 'கூறுவீராக: "நாங்கள் அல்லாஹ்வையும், எங்கள் மீது இறக்கப்பட்டதையும், இப்ராஹீம், இஸ்மாயீல், இஸ்ஹாக், யஃகூப் மற்றும் அவர்களின் சந்ததியினர் மீது இறக்கப்பட்டவற்றையும், மூஸா, ஈஸா ஆகியோருக்கும் ஏனைய நபிமார்களுக்கும் தங்கள் இறைவனிடமிருந்து அருளப்பட்டவற்றையும் ஈமான் கொண்டோம். அவர்களில் எவருக்கும் இடையில் நாம் வேறுபாடு காட்டமாட்டோம். நாம் அவனுக்கே முற்றிலும் கீழ்ப்படிந்தவர்கள்."',
        uniqueTokens: ['قُلْ', 'عَلَيْنَا', 'وَٱلنَّبِيُّونَ'],
      },
    ],
  },
  {
    id: 'm-2-62-5-69',
    category: 'Believers and Other Faiths',
    topicTitleEn: 'Those Who Believe, Jews, Christians, and Sabians',
    topicTitleTa: 'நம்பிக்கையாளர்கள், யூதர்கள், கிறிஸ்தவர்கள், சாபியீன்கள்',
    mnemonicEn: 'In Baqarah 2:62: "Was-Saabi\'een" (with Yaa - Mansoob accusative). In Al-Ma\'idah 5:69: "Was-Saabi\'oon" (with Waw - Marfoo\' nominative for Mubtada placement).',
    mnemonicTa: 'அல்-பகராவில் "வஸ்-ஸாபிஈன" (யாவோடு நஸப்) எனவும், அல்-மாயிதாவில் "வஸ்-ஸாபிஊன" (வாவோடு ரஃப்) எனவும் வருகிறது.',
    pair: [
      {
        surah: 2,
        ayah: 62,
        surahName: 'Al-Baqarah',
        textUthmani: 'إِنَّ ٱلَّذِينَ ءَامَنُوا۟ وَٱلَّذِينَ هَادُوا۟ وَٱلنَّصَـٰرَىٰ وَٱلصَّـٰبِـِٔينَ مَنْ ءَامَنَ بِٱللَّهِ وَٱلْيَوْمِ ٱلْـَٔاخِرِ وَعَمِلَ صَـٰلِحًۭا فَلَهُمْ أَجْرُهُمْ عِندَ رَبِّهِمْ وَلَا خَوْفٌ عَلَيْهِمْ وَلَا هُمْ يَحْزَنُونَ',
        translationEn: 'Indeed, those who believed and those who were Jews or Christians or Sabeans - those [among them] who believed in Allah and the Last Day and did righteousness - will have their reward with their Lord, and no fear will there be concerning them, nor will they grieve.',
        translationTa: 'நிச்சயமாக ஈமான் கொண்டோரும், யூதர்களும், கிறிஸ்தவர்களும், ஸாபியீன்களும் எவர் அல்லாஹ்வையும் இறுதி நாளையும் ஈமான் கொண்டு நற்செயல்களைச் செய்கிறார்களோ அவர்களுக்குரிய நற்கூலி அவர்களின் இறைவனிடம் உண்டு; மேலும் அவர்களுக்கு எவ்வித பயமும் இல்லை, அவர்கள் கவலையும் படமாட்டார்கள்.',
        uniqueTokens: ['وَٱلصَّـٰبِـِٔينَ', 'فَلَهُمْ أَجْرُهُمْ عِندَ رَبِّهِمْ'],
      },
      {
        surah: 5,
        ayah: 69,
        surahName: "Al-Ma'idah",
        textUthmani: 'إِنَّ ٱلَّذِينَ ءَامَنُوا۟ وَٱلَّذِينَ هَادُوا۟ وَٱلصَّـٰبِـُٔونَ وَٱلنَّصَـٰرَىٰ مَنْ ءَامَنَ بِٱللَّهِ وَٱلْيَوْمِ ٱلْـَٔاخِرِ وَعَمِلَ صَـٰلِحًۭا فَلَا خَوْفٌ عَلَيْهِمْ وَلَا هُمْ يَحْزَنُونَ',
        translationEn: 'Indeed, those who have believed and those who were Jews or Sabeans or Christians - those [among them] who believed in Allah and the Last Day and did righteousness - no fear will there be concerning them, nor will they grieve.',
        translationTa: 'நிச்சயமாக ஈமான் கொண்டோரும், யூதர்களும், ஸாபியீன்களும், கிறிஸ்தவர்களும் எவர் அல்லாஹ்வையும் இறுதி நாளையும் ஈமான் கொண்டு நற்கருமங்களைச் செய்கிறார்களோ அவர்களுக்கு எவ்வித பயமும் இல்லை; அவர்கள் கவலைப்படவும் மாட்டார்கள்.',
        uniqueTokens: ['وَٱلصَّـٰبِـُٔونَ', 'فَلَا خَوْفٌ'],
      },
    ],
  },
  {
    id: 'm-3-134-135',
    category: 'Righteous Repentance',
    topicTitleEn: 'Those Who Spend & Those Who When They Commit Indecency',
    topicTitleTa: 'செலவு செய்வோரும் பாவம் செய்தபின் மன்னிப்புக் கேட்போரும்',
    mnemonicEn: 'Surah Aal-Imran verses 134 and 135 follow each other sequentially, highlighting two levels of piety: steady charity followed by immediate Istighfar.',
    mnemonicTa: 'ஆலு இம்ரானில் இறைபக்தியாளர்களின் இரண்டு நற்குணங்களை அடுத்தடுத்து வரிசைப்படுத்தும் தொடர் வசனங்கள்.',
    pair: [
      {
        surah: 3,
        ayah: 134,
        surahName: "Aal 'Imran",
        textUthmani: 'ٱلَّذِينَ يُنفِقُونَ فِى السَّرَّآءِ وَالضَّرَّآءِ وَٱلْكَـٰظِمِينَ ٱلْغَيْظَ وَٱلْعَافِينَ عَنِ ٱلنَّاسِ ۗ وَٱللَّهُ يُحِبُّ ٱلْمُحْسِنِينَ',
        translationEn: 'Who spend [in the cause of Allah] during ease and hardship and who restrain anger and who pardon the people - and Allah loves the doers of good.',
        translationTa: 'அவர்கள் எத்தகையோரென்றால் வசதியான நிலையிலும், நெருக்குடியான நிலையிலும் இறைவழியில் செலவிடுவார்கள்; கோபத்தை அடக்கிக் கொள்வார்கள்; மனிதர்களின் பிழைகளை மன்னிப்பார்கள்; நன்மை செய்வோரையே அல்லாஹ் நேசிக்கிறான்.',
        uniqueTokens: ['يُنفِقُونَ', 'وَٱلْكَـٰظِمِينَ', 'وَٱلْعَافِينَ'],
      },
      {
        surah: 3,
        ayah: 135,
        surahName: "Aal 'Imran",
        textUthmani: 'وَٱلَّذِينَ إِذَا فَعَلُوا۟ فَـٰحِشَةً أَوْ ظَلَمُوٓا۟ أَنفُسَهُمْ ذَكَرُوا۟ ٱللَّهَ فَٱسْتَغْفَرُوا۟ لِذُنُوبِهِمْ وَمَن يَغْفِرُ ٱلذُّنُوبَ إِلَّا ٱللَّهُ وَلَمْ يُصِرُّوا۟ عَلَىٰ مَا فَعَلُوا۟ وَهُمْ يَعْلَمُونَ',
        translationEn: 'And those who, when they commit an immorality or wrong themselves [by transgression], remember Allah and seek forgiveness for their sins - and who can forgive sins except Allah? - and [who] do not persist in what they have done while they know.',
        translationTa: 'இன்னும் அவர்கள் வெட்கக்கேடான ஒரு செயலைச் செய்துவிட்டாலும் அல்லது தமக்குத் தாமே அநீதி இழைத்துக் கொண்டாலும் உடனே அல்லாஹ்வை நினைவுகூர்ந்து தங்கள் பாவங்களுக்காக மன்னிப்புக் கோருவார்கள்; அல்லாஹ்வைத் தவிர வேறு யார் பாவங்களை மன்னிக்க முடியும்? அவர்கள் தாங்கள் செய்த தவறை அறிந்தவர்களாகவே அதில் பிடிவாதமாக நிலைத்திருக்க மாட்டார்கள்.',
        uniqueTokens: ['فَـٰحِشَةً', 'فَٱسْتَغْفَرُوا۟', 'وَلَمْ يُصِرُّوا۟'],
      },
    ],
  },
];

/**
 * Searches for Mutashabihat involving a specific Surah and Ayah. Checks the curated,
 * mnemonic-rich dataset first, then the computed index once it has been built and
 * primed into memory (see `primeComputedMutashabihatIndex`) — kept synchronous so it
 * stays cheap to call on every ayah render.
 */
export function getMutashabihatForVerse(surah: number, ayah: number): MutashabihEntry | null {
  const match = MUTASHABIHAT_DATASET.find(
    (item) =>
      (item.pair[0].surah === surah && item.pair[0].ayah === ayah) ||
      (item.pair[1].surah === surah && item.pair[1].ayah === ayah)
  );
  if (match) return match;

  const computed = computedIndexCache?.find(
    (item) =>
      (item.pair[0].surah === surah && item.pair[0].ayah === ayah) ||
      (item.pair[1].surah === surah && item.pair[1].ayah === ayah)
  );
  return computed ?? null;
}

/**
 * Computes a visual token diff between two Arabic strings.
 */
export function computeTokenDiff(textA: string, textB: string): { tokensA: DiffToken[]; tokensB: DiffToken[] } {
  // Normalize extra spacing while preserving diacritics
  const splitA = textA.trim().split(/\s+/);
  const splitB = textB.trim().split(/\s+/);

  const clean = (s: string) => s.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '');

  const tokensA: DiffToken[] = splitA.map((tA) => {
    const isPresentInB = splitB.some((tB) => clean(tA) === clean(tB));
    return {
      text: tA,
      type: isPresentInB ? 'same' : 'modified',
    };
  });

  const tokensB: DiffToken[] = splitB.map((tB) => {
    const isPresentInA = splitA.some((tA) => clean(tB) === clean(tA));
    return {
      text: tB,
      type: isPresentInA ? 'same' : 'added',
    };
  });

  return { tokensA, tokensB };
}

const COMPUTED_INDEX_CACHE_KEY = 'mutashabihat-computed-index-v1';
const MIN_VERSE_WORDS = 4;
const MIN_SIMILARITY = 0.6;
const MAX_ANCHOR_BUCKET = 40; // words this common (proper nouns, frequent verbs) are skipped as anchors

/** In-memory copy of the computed index once loaded, so per-ayah lookups stay synchronous. */
let computedIndexCache: MutashabihEntry[] | null = null;

const TASHKEEL = /[ً-ٰٟۖ-ۭـ]/g;

function normalizedWords(text: string): string[] {
  return text.trim().split(/\s+/).map((w) => w.replace(TASHKEEL, '')).filter(Boolean);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

interface CorpusEntry {
  surah: number;
  ayah: number;
  surahName: string;
  textUthmani: string;
  translationEn: string;
  translationTa: string;
  words: Set<string>;
}

/**
 * Scans every surah for verses whose normalized word sets overlap heavily with another
 * verse elsewhere in the mushaf. Candidate pairs are found through an inverted index —
 * for each distinctive (4+ letter, not near-universal) word, every verse containing it is
 * a candidate partner for every other verse containing it — rather than comparing all
 * 6236 verses against each other.
 */
export async function buildComputedMutashabihatIndex(
  onProgress?: (done: number, total: number) => void
): Promise<MutashabihEntry[]> {
  const corpus: CorpusEntry[] = [];
  for (let i = 0; i < SURAHS.length; i++) {
    const meta = SURAHS[i];
    if (!meta) continue;
    const verses = await quranProvider.getChapterVerses(meta.id);
    for (const v of verses) {
      const words = normalizedWords(v.textUthmani);
      if (words.length < MIN_VERSE_WORDS) continue;
      corpus.push({
        surah: v.surah,
        ayah: v.numberInSurah,
        surahName: meta.nameSimple,
        textUthmani: v.textUthmani,
        translationEn: v.translationEn,
        translationTa: v.translationTa,
        words: new Set(words),
      });
    }
    onProgress?.(i + 1, SURAHS.length);
  }

  const anchorIndex = new Map<string, number[]>();
  corpus.forEach((entry, idx) => {
    for (const word of entry.words) {
      if (word.length < 4) continue;
      const bucket = anchorIndex.get(word);
      if (bucket) bucket.push(idx);
      else anchorIndex.set(word, [idx]);
    }
  });

  const seenPairs = new Set<string>();
  const entries: MutashabihEntry[] = [];

  for (const bucket of anchorIndex.values()) {
    if (bucket.length < 2 || bucket.length > MAX_ANCHOR_BUCKET) continue;

    for (let a = 0; a < bucket.length; a++) {
      for (let b = a + 1; b < bucket.length; b++) {
        const i = bucket[a];
        const j = bucket[b];
        if (i === undefined || j === undefined) continue;
        const pairKey = i < j ? `${i}:${j}` : `${j}:${i}`;
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);

        const va = corpus[i];
        const vb = corpus[j];
        if (!va || !vb) continue;
        if (va.surah === vb.surah && va.ayah === vb.ayah) continue;

        const similarity = jaccard(va.words, vb.words);
        if (similarity < MIN_SIMILARITY) continue;

        const { tokensA, tokensB } = computeTokenDiff(va.textUthmani, vb.textUthmani);
        const uniqueA = tokensA.filter((t) => t.type !== 'same').map((t) => t.text);
        const uniqueB = tokensB.filter((t) => t.type !== 'same').map((t) => t.text);
        if (uniqueA.length === 0 && uniqueB.length === 0) continue; // identical repetition, not a "similar but different" pair

        entries.push({
          id: `computed-${va.surah}-${va.ayah}-${vb.surah}-${vb.ayah}`,
          category: 'Computed similarity',
          topicTitleEn: `${va.surahName} ${va.surah}:${va.ayah} vs ${vb.surahName} ${vb.surah}:${vb.ayah}`,
          topicTitleTa: `${va.surahName} ${va.surah}:${va.ayah} vs ${vb.surahName} ${vb.surah}:${vb.ayah}`,
          mnemonicEn: 'These two verses share most of their wording. Compare the highlighted tokens below to tell them apart.',
          mnemonicTa: 'இவ்விரு வசனங்களும் பெரும்பாலான சொற்களைப் பகிர்ந்து கொள்கின்றன; வேறுபடும் சொற்களை ஒப்பிட்டுப் பாருங்கள்.',
          pair: [
            {
              surah: va.surah,
              ayah: va.ayah,
              surahName: va.surahName,
              textUthmani: va.textUthmani,
              translationEn: va.translationEn,
              translationTa: va.translationTa,
              uniqueTokens: uniqueA.length > 0 ? uniqueA : normalizedWords(va.textUthmani).slice(0, 1),
            },
            {
              surah: vb.surah,
              ayah: vb.ayah,
              surahName: vb.surahName,
              textUthmani: vb.textUthmani,
              translationEn: vb.translationEn,
              translationTa: vb.translationTa,
              uniqueTokens: uniqueB.length > 0 ? uniqueB : normalizedWords(vb.textUthmani).slice(0, 1),
            },
          ],
        });
      }
    }
  }

  return entries;
}

/** Reads the computed index from IndexedDB into memory, without triggering a rebuild. */
export async function primeComputedMutashabihatIndex(): Promise<MutashabihEntry[]> {
  if (computedIndexCache) return computedIndexCache;
  const cached = await db.quranCache.get(COMPUTED_INDEX_CACHE_KEY);
  if (cached) {
    computedIndexCache = cached.data as MutashabihEntry[];
    return computedIndexCache;
  }
  return [];
}

export function hasComputedMutashabihatIndex(): boolean {
  return computedIndexCache !== null && computedIndexCache.length > 0;
}

/**
 * Builds the computed index (a one-time, network-bound scan of the whole mushaf) and
 * caches it in IndexedDB so every later session and every ayah lookup reads it for free.
 */
export async function buildAndCacheComputedMutashabihatIndex(
  onProgress?: (done: number, total: number) => void
): Promise<MutashabihEntry[]> {
  const entries = await buildComputedMutashabihatIndex(onProgress);
  entries.sort((a, b) => a.pair[0].surah - b.pair[0].surah || a.pair[0].ayah - b.pair[0].ayah);
  await db.quranCache.put({ key: COMPUTED_INDEX_CACHE_KEY, data: entries, cachedAt: Date.now() });
  computedIndexCache = entries;
  return entries;
}
