/**
 * Authentic Arabic Alphabet Audio and Metadata Engine
 * Provides authentic isolated letter MP3 recordings, makharij (articulation points),
 * vowel forms, and multi-tier speech synthesis / web-audio fallback.
 */

export interface ArabicLetterMeta {
  id: string;
  letter: string;
  nameEn: string;
  nameTa: string;
  nameArabic: string;
  filename: string;
  audioUrl: string;
  makhrajEn: string;
  makhrajTa: string;
  category: 'throat' | 'tongue' | 'lips' | 'nasal' | 'oral_cavity';
  isEmphatic: boolean; // Tafkheem / heavy letter
  forms: {
    isolated: string;
    initial: string;
    medial: string;
    final: string;
  };
  sampleWord?: {
    arabic: string;
    transliteration: string;
    translationEn: string;
    translationTa: string;
  };
}

const AUDIO_BASE = 'https://arabicreadingcourse.com/audio/isolated-letters';

export const ARABIC_ALPHABET: ArabicLetterMeta[] = [
  {
    id: 'alif',
    letter: 'أ',
    nameEn: 'Alif',
    nameTa: 'அலிஃப்',
    nameArabic: 'أَلِف',
    filename: 'alif.mp3',
    audioUrl: `${AUDIO_BASE}/alif.mp3`,
    makhrajEn: 'Oral cavity / empty space of mouth & throat (Al-Jawf)',
    makhrajTa: 'வாய் மற்றும் தொண்டையின் வெற்றிடப் பகுதியிலிருந்து பிறக்கிறது (அல்-ஜவ்ஃப்)',
    category: 'oral_cavity',
    isEmphatic: false,
    forms: { isolated: 'أ', initial: 'أ', medial: 'ـأ', final: 'ـأ' },
    sampleWord: {
      arabic: 'أَمَل',
      transliteration: 'Amal',
      translationEn: 'Hope',
      translationTa: 'நம்பிக்கை',
    },
  },
  {
    id: 'baa',
    letter: 'ب',
    nameEn: 'Baa',
    nameTa: 'பா',
    nameArabic: 'بَاء',
    filename: 'ba.mp3',
    audioUrl: `${AUDIO_BASE}/ba.mp3`,
    makhrajEn: 'Moist inner part of both lips closing firmly (Ash-Shafatayn)',
    makhrajTa: 'இரு உதடுகளையும் இறுக்கமாக இணைக்கும்போது பிறக்கிறது',
    category: 'lips',
    isEmphatic: false,
    forms: { isolated: 'ب', initial: 'بـ', medial: 'ـبـ', final: 'ـب' },
    sampleWord: {
      arabic: 'بَيْت',
      transliteration: 'Bayt',
      translationEn: 'House',
      translationTa: 'வீடு',
    },
  },
  {
    id: 'taa',
    letter: 'ت',
    nameEn: 'Taa',
    nameTa: 'தா',
    nameArabic: 'تَاء',
    filename: 'ta.mp3',
    audioUrl: `${AUDIO_BASE}/ta.mp3`,
    makhrajEn: 'Tip of tongue touching root of upper front teeth with whisper (Hams)',
    makhrajTa: 'நாவின் நுனி மேல் முன் பற்களின் வேர்ப்பகுதியில் தொடும்போது பிறக்கிறது',
    category: 'tongue',
    isEmphatic: false,
    forms: { isolated: 'ت', initial: 'تـ', medial: 'ـتـ', final: 'ـت' },
    sampleWord: {
      arabic: 'تَمْر',
      transliteration: 'Tamr',
      translationEn: 'Dates',
      translationTa: 'பேரீச்சம்பழம்',
    },
  },
  {
    id: 'thaa',
    letter: 'ث',
    nameEn: 'Thaa',
    nameTa: 'ஸா (மென்மை)',
    nameArabic: 'ثَاء',
    filename: 'tha.mp3',
    audioUrl: `${AUDIO_BASE}/tha.mp3`,
    makhrajEn: 'Tip of tongue touching edges of upper two front incisors (Soft)',
    makhrajTa: 'நாவின் நுனியை மேல் இரு முன் பற்களின் விளிம்பில் வைத்து மென்மையாக உச்சரிக்க வேண்டும்',
    category: 'tongue',
    isEmphatic: false,
    forms: { isolated: 'ث', initial: 'ثـ', medial: 'ـثـ', final: 'ـث' },
    sampleWord: {
      arabic: 'ثَمَر',
      transliteration: 'Thamar',
      translationEn: 'Fruit',
      translationTa: 'பழம்',
    },
  },
  {
    id: 'jeem',
    letter: 'ج',
    nameEn: 'Jeem',
    nameTa: 'ஜீம்',
    nameArabic: 'جِيم',
    filename: 'jiim.mp3',
    audioUrl: `${AUDIO_BASE}/jiim.mp3`,
    makhrajEn: 'Middle of tongue raised against hard palate (Qalqalah letter)',
    makhrajTa: 'நாவின் நடுப்பகுதி மேல் அன்னத்தில் அழுத்தி ஒலிக்கப்படும் (கல்கலா)',
    category: 'tongue',
    isEmphatic: false,
    forms: { isolated: 'ج', initial: 'جـ', medial: 'ـجـ', final: 'ـج' },
    sampleWord: {
      arabic: 'جَنَّة',
      transliteration: 'Jannah',
      translationEn: 'Paradise / Garden',
      translationTa: 'சொர்க்கம் / தோட்டம்',
    },
  },
  {
    id: 'haa',
    letter: 'ح',
    nameEn: 'Haa (Throaty)',
    nameTa: 'ஹா (தொண்டை நடு)',
    nameArabic: 'حَاء',
    filename: 'hha.mp3',
    audioUrl: `${AUDIO_BASE}/hha.mp3`,
    makhrajEn: 'Middle of the throat with warm breath friction',
    makhrajTa: 'தொண்டையின் நடுப்பகுதியிலிருந்து மெல்லிய காற்றுடன் பிறக்கிறது',
    category: 'throat',
    isEmphatic: false,
    forms: { isolated: 'ح', initial: 'حـ', medial: 'ـحـ', final: 'ـح' },
    sampleWord: {
      arabic: 'حَمْد',
      transliteration: 'Hamd',
      translationEn: 'Praise',
      translationTa: 'புகழ்',
    },
  },
  {
    id: 'khaa',
    letter: 'خ',
    nameEn: 'Khaa',
    nameTa: 'கா (தொண்டை மேல்)',
    nameArabic: 'خَاء',
    filename: 'kha.mp3',
    audioUrl: `${AUDIO_BASE}/kha.mp3`,
    makhrajEn: 'Top of throat closest to mouth with rasping friction (Heavy letter)',
    makhrajTa: 'தொண்டையின் மேல் பகுதியிலிருந்து உராய்வொலியுடன் தடிப்பமாக ஒலிக்கப்படும்',
    category: 'throat',
    isEmphatic: true,
    forms: { isolated: 'خ', initial: 'خـ', medial: 'ـخـ', final: 'ـخ' },
    sampleWord: {
      arabic: 'خَيْر',
      transliteration: 'Khayr',
      translationEn: 'Goodness',
      translationTa: 'நன்மை',
    },
  },
  {
    id: 'dal',
    letter: 'د',
    nameEn: 'Dal',
    nameTa: 'தால்',
    nameArabic: 'دَال',
    filename: 'daal.mp3',
    audioUrl: `${AUDIO_BASE}/daal.mp3`,
    makhrajEn: 'Tip of tongue touching root of upper front teeth with crisp clarity',
    makhrajTa: 'நாவின் நுனி மேல் முன் பற்களின் வேரில் பட்டுத் தெறிக்கும் (கல்கலா)',
    category: 'tongue',
    isEmphatic: false,
    forms: { isolated: 'د', initial: 'د', medial: 'ـد', final: 'ـد' },
    sampleWord: {
      arabic: 'دُعَاء',
      transliteration: 'Du\'aa',
      translationEn: 'Supplication',
      translationTa: 'பிரார்த்தனை',
    },
  },
  {
    id: 'dhal',
    letter: 'ذ',
    nameEn: 'Dhal',
    nameTa: 'தால் (மெலிவு)',
    nameArabic: 'ذَال',
    filename: 'thaal.mp3',
    audioUrl: `${AUDIO_BASE}/thaal.mp3`,
    makhrajEn: 'Tip of tongue touching edges of upper front incisors (Soft buzz)',
    makhrajTa: 'நாவின் நுனி மேல் முன் பற்களின் நுனியைத் தொடும்போது மென்மையாகப் பிறக்கும்',
    category: 'tongue',
    isEmphatic: false,
    forms: { isolated: 'ذ', initial: 'ذ', medial: 'ـذ', final: 'ـذ' },
    sampleWord: {
      arabic: 'ذِكْر',
      transliteration: 'Dhikr',
      translationEn: 'Remembrance',
      translationTa: 'நினைவு கூர்தல்',
    },
  },
  {
    id: 'raa',
    letter: 'ر',
    nameEn: 'Raa',
    nameTa: 'ரா',
    nameArabic: 'رَاء',
    filename: 'ra.mp3',
    audioUrl: `${AUDIO_BASE}/ra.mp3`,
    makhrajEn: 'Tip of tongue touching hard palate behind upper incisors with gentle trill',
    makhrajTa: 'நாவின் நுனியின் மேல்புறம் மேல் அன்னத்தில் படும்போது லேசான அதிர்வுடன் பிறக்கும்',
    category: 'tongue',
    isEmphatic: true,
    forms: { isolated: 'ر', initial: 'ر', medial: 'ـر', final: 'ـر' },
    sampleWord: {
      arabic: 'رَحْمَة',
      transliteration: 'Rahmah',
      translationEn: 'Mercy',
      translationTa: 'கருணை',
    },
  },
  {
    id: 'zay',
    letter: 'ز',
    nameEn: 'Zay',
    nameTa: 'ஜாய்',
    nameArabic: 'زَاي',
    filename: 'zay.mp3',
    audioUrl: `${AUDIO_BASE}/zay.mp3`,
    makhrajEn: 'Tip of tongue just above bottom incisors producing sharp whistle sound',
    makhrajTa: 'நாவின் நுனி கீழ் முன் பற்களின் உட்சுவரை ஒட்டி சீறல் ஒலியுடன் பிறக்கிறது',
    category: 'tongue',
    isEmphatic: false,
    forms: { isolated: 'ز', initial: 'ز', medial: 'ـز', final: 'ـز' },
    sampleWord: {
      arabic: 'زَهْرَة',
      transliteration: 'Zahrah',
      translationEn: 'Flower',
      translationTa: 'மலர்',
    },
  },
  {
    id: 'seen',
    letter: 'س',
    nameEn: 'Seen',
    nameTa: 'ஸீன்',
    nameArabic: 'سِين',
    filename: 'siin.mp3',
    audioUrl: `${AUDIO_BASE}/siin.mp3`,
    makhrajEn: 'Tip of tongue with inner surface of bottom teeth (Light whistle/Safir)',
    makhrajTa: 'கீழ் முன் பற்களின் உட்புறத்தில் நாவின் நுனி பொருந்தி சீறும் ஒலி பிறக்கும்',
    category: 'tongue',
    isEmphatic: false,
    forms: { isolated: 'س', initial: 'سـ', medial: 'ـسـ', final: 'ـس' },
    sampleWord: {
      arabic: 'سَلَام',
      transliteration: 'Salam',
      translationEn: 'Peace',
      translationTa: 'சாந்தி / சமாதானம்',
    },
  },
  {
    id: 'sheen',
    letter: 'ش',
    nameEn: 'Sheen',
    nameTa: 'ஷீன்',
    nameArabic: 'شِين',
    filename: 'shiin.mp3',
    audioUrl: `${AUDIO_BASE}/shiin.mp3`,
    makhrajEn: 'Middle of tongue elevated toward roof of mouth (Tafash-shi breath spread)',
    makhrajTa: 'நாவின் நடுப்பகுதி மேல் அன்னத்தை நோக்கி எழும்பி காற்று வாயெங்கும் பரவும்',
    category: 'tongue',
    isEmphatic: false,
    forms: { isolated: 'ش', initial: 'شـ', medial: 'ـشـ', final: 'ـش' },
    sampleWord: {
      arabic: 'شُكْر',
      transliteration: 'Shukr',
      translationEn: 'Gratitude',
      translationTa: 'நன்றி செலுத்துதல்',
    },
  },
  {
    id: 'saad',
    letter: 'ص',
    nameEn: 'Saad',
    nameTa: 'ஸாத் (தடிப்பு)',
    nameArabic: 'صَاد',
    filename: 'saad.mp3',
    audioUrl: `${AUDIO_BASE}/saad.mp3`,
    makhrajEn: 'Tip of tongue with back of tongue raised high toward soft palate (Heavy Safir)',
    makhrajTa: 'நாவின் பின்புறம் மேல் எழும்பி வாய் நிறைய கனமான சீறல் ஒலியுடன் பிறக்கும்',
    category: 'tongue',
    isEmphatic: true,
    forms: { isolated: 'ص', initial: 'صـ', medial: 'ـصـ', final: 'ـص' },
    sampleWord: {
      arabic: 'صَبْر',
      transliteration: 'Sabr',
      translationEn: 'Patience',
      translationTa: 'பொறுமை',
    },
  },
  {
    id: 'dhad',
    letter: 'ض',
    nameEn: 'Dhad',
    nameTa: 'ழாத் (தடிப்பு)',
    nameArabic: 'ضَاد',
    filename: 'daad.mp3',
    audioUrl: `${AUDIO_BASE}/daad.mp3`,
    makhrajEn: 'One or both sides of the tongue touching upper molars (Unique to Arabic / Istitalah)',
    makhrajTa: 'நாவின் ஒரு பக்க விளிம்பு மேல் கடைவாய்ப் பற்களில் பட்டு நீண்டு ஒலிக்கும்',
    category: 'tongue',
    isEmphatic: true,
    forms: { isolated: 'ض', initial: 'ضـ', medial: 'ـضـ', final: 'ـض' },
    sampleWord: {
      arabic: 'ضَوْء',
      transliteration: 'Daw\'',
      translationEn: 'Light',
      translationTa: 'ஒளி',
    },
  },
  {
    id: 'taa_heavy',
    letter: 'ط',
    nameEn: 'Taa (Heavy)',
    nameTa: 'தா (தடிப்பு)',
    nameArabic: 'طَاء',
    filename: 'taa.mp3',
    audioUrl: `${AUDIO_BASE}/taa.mp3`,
    makhrajEn: 'Tip of tongue against upper front teeth roots with total elevation (Strongest letter)',
    makhrajTa: 'நாவின் நுனி மேல் முன் பற்களின் வேரில் முழு தடிப்போடு அழுத்தப்படும் (கல்கலா)',
    category: 'tongue',
    isEmphatic: true,
    forms: { isolated: 'ط', initial: 'طـ', medial: 'ـطـ', final: 'ـط' },
    sampleWord: {
      arabic: 'طَيِّب',
      transliteration: 'Tayyib',
      translationEn: 'Pure / Wholesome',
      translationTa: 'தூய்மையானது',
    },
  },
  {
    id: 'dhaa_heavy',
    letter: 'ظ',
    nameEn: 'Dhaa (Heavy)',
    nameTa: 'ழா (தடிப்பு)',
    nameArabic: 'ظَاء',
    filename: 'thaa.mp3',
    audioUrl: `${AUDIO_BASE}/thaa.mp3`,
    makhrajEn: 'Tip of tongue against edges of upper incisors with back of tongue raised high',
    makhrajTa: 'நாவின் நுனி மேல் முன் பற்களின் விளிம்பில் பட்டு வாய் நிறைந்த தடிப்போடு ஒலிக்கும்',
    category: 'tongue',
    isEmphatic: true,
    forms: { isolated: 'ظ', initial: 'ظـ', medial: 'ـظـ', final: 'ـظ' },
    sampleWord: {
      arabic: 'ظِلّ',
      transliteration: 'Zhill',
      translationEn: 'Shade',
      translationTa: 'நிழல்',
    },
  },
  {
    id: 'ayn',
    letter: 'ع',
    nameEn: 'Ayn',
    nameTa: 'ஐன் (தொண்டை)',
    nameArabic: 'عَيْن',
    filename: 'ayn.mp3',
    audioUrl: `${AUDIO_BASE}/ayn.mp3`,
    makhrajEn: 'Middle of throat (Epiglottis pressing backward)',
    makhrajTa: 'தொண்டையின் நடுப்பகுதியில் குரல்வளை மூடி பின்னோக்கிச் சுருங்குவதால் பிறக்கிறது',
    category: 'throat',
    isEmphatic: false,
    forms: { isolated: 'ع', initial: 'عـ', medial: 'ـعـ', final: 'ـع' },
    sampleWord: {
      arabic: 'عِلْم',
      transliteration: '\'Ilm',
      translationEn: 'Knowledge',
      translationTa: 'கல்வி / ஞானம்',
    },
  },
  {
    id: 'ghayn',
    letter: 'غ',
    nameEn: 'Ghayn',
    nameTa: 'கைன் (தொண்டை)',
    nameArabic: 'غَيْن',
    filename: 'ghayn.mp3',
    audioUrl: `${AUDIO_BASE}/ghayn.mp3`,
    makhrajEn: 'Upper part of throat nearest the mouth cavity (Heavy gargle-like friction)',
    makhrajTa: 'தொண்டையின் மேல் பகுதியிலிருந்து வாய் நிறைந்த தடிப்புடன் பிறக்கும்',
    category: 'throat',
    isEmphatic: true,
    forms: { isolated: 'غ', initial: 'غـ', medial: 'ـغـ', final: 'ـغ' },
    sampleWord: {
      arabic: 'غَفُور',
      transliteration: 'Ghafoor',
      translationEn: 'Forgiving',
      translationTa: 'பிழைபொறுப்பவன்',
    },
  },
  {
    id: 'faa',
    letter: 'ف',
    nameEn: 'Faa',
    nameTa: 'ஃபா',
    nameArabic: 'فَاء',
    filename: 'fa.mp3',
    audioUrl: `${AUDIO_BASE}/fa.mp3`,
    makhrajEn: 'Edges of upper front incisors touching inside wet surface of bottom lip',
    makhrajTa: 'மேல் முன் பற்களின் விளிம்பு கீழ் உதட்டின் ஈரமான உட்பகுதியில் தொடும்போது பிறக்கும்',
    category: 'lips',
    isEmphatic: false,
    forms: { isolated: 'ف', initial: 'فـ', medial: 'ـفـ', final: 'ـف' },
    sampleWord: {
      arabic: 'فَجْر',
      transliteration: 'Fajr',
      translationEn: 'Dawn',
      translationTa: 'விடியற்காலை',
    },
  },
  {
    id: 'qaf',
    letter: 'ق',
    nameEn: 'Qaf',
    nameTa: 'காஃப் (தடிப்பு)',
    nameArabic: 'قَاف',
    filename: 'qaf.mp3',
    audioUrl: `${AUDIO_BASE}/qaf.mp3`,
    makhrajEn: 'Extreme back of tongue against soft palate (Heavy ringing Qalqalah)',
    makhrajTa: 'நாவின் அடித்தளம் தொண்டையை ஒட்டிய மென்மையான மேல் அன்னத்தில் தட்டி அதிரும்',
    category: 'tongue',
    isEmphatic: true,
    forms: { isolated: 'ق', initial: 'قـ', medial: 'ـقـ', final: 'ـق' },
    sampleWord: {
      arabic: 'قَلْب',
      transliteration: 'Qalb',
      translationEn: 'Heart',
      translationTa: 'உள்ளம் / இதயம்',
    },
  },
  {
    id: 'kaaf',
    letter: 'ك',
    nameEn: 'Kaaf',
    nameTa: 'காஃப் (மெலிவு)',
    nameArabic: 'كَاف',
    filename: 'kaf.mp3',
    audioUrl: `${AUDIO_BASE}/kaf.mp3`,
    makhrajEn: 'Back of tongue slightly forward of Qaf touching hard and soft palates with whisper',
    makhrajTa: 'காஃப் எழுத்திற்குச் சற்று முன்னதாக நாவின் பின்புறம் மேல் அன்னத்தில் படும் (மெல்லிய ஒலி)',
    category: 'tongue',
    isEmphatic: false,
    forms: { isolated: 'ك', initial: 'كـ', medial: 'ـكـ', final: 'ـك' },
    sampleWord: {
      arabic: 'كِتَاب',
      transliteration: 'Kitab',
      translationEn: 'Book',
      translationTa: 'வேதம் / புத்தகம்',
    },
  },
  {
    id: 'laam',
    letter: 'ل',
    nameEn: 'Laam',
    nameTa: 'லாம்',
    nameArabic: 'لَام',
    filename: 'lam.mp3',
    audioUrl: `${AUDIO_BASE}/lam.mp3`,
    makhrajEn: 'Side edges of front of tongue against upper gums / palate',
    makhrajTa: 'நாவின் முன்புற விளிம்புகள் மேல் அன்னத்தின் ஈறுகளில் படும்போது பிறக்கும்',
    category: 'tongue',
    isEmphatic: false,
    forms: { isolated: 'ل', initial: 'لـ', medial: 'ـلـ', final: 'ـل' },
    sampleWord: {
      arabic: 'لَيْل',
      transliteration: 'Layl',
      translationEn: 'Night',
      translationTa: 'இரவு',
    },
  },
  {
    id: 'meem',
    letter: 'م',
    nameEn: 'Meem',
    nameTa: 'மீம்',
    nameArabic: 'مِيم',
    filename: 'miim.mp3',
    audioUrl: `${AUDIO_BASE}/miim.mp3`,
    makhrajEn: 'Both lips closing gently accompanied by nasal resonance (Ghunnah)',
    makhrajTa: 'இரு உதடுகளும் மிருதுவாக இணையும்போது மூக்கின் வழியாக வெளிப்படும் (குன்னா)',
    category: 'lips',
    isEmphatic: false,
    forms: { isolated: 'م', initial: 'مـ', medial: 'ـمـ', final: 'ـم' },
    sampleWord: {
      arabic: 'مَاء',
      transliteration: 'Maa\'',
      translationEn: 'Water',
      translationTa: 'தண்ணீர்',
    },
  },
  {
    id: 'noon',
    letter: 'ن',
    nameEn: 'Noon',
    nameTa: 'நூன்',
    nameArabic: 'نُون',
    filename: 'nuun.mp3',
    audioUrl: `${AUDIO_BASE}/nuun.mp3`,
    makhrajEn: 'Tip of tongue against gums of upper front teeth with nasal resonance (Ghunnah)',
    makhrajTa: 'நாவின் நுனி மேல் முன் பற்களின் ஈறுகளில் பட்டு மூக்கொலியுடன் ஒலிக்கும் (குன்னா)',
    category: 'tongue',
    isEmphatic: false,
    forms: { isolated: 'ن', initial: 'نـ', medial: 'ـنـ', final: 'ـن' },
    sampleWord: {
      arabic: 'نُور',
      transliteration: 'Noor',
      translationEn: 'Light',
      translationTa: 'பேரொளி',
    },
  },
  {
    id: 'haa_light',
    letter: 'هـ',
    nameEn: 'Haa (Chest/Throat)',
    nameTa: 'ஹா (தொண்டை கீழ்)',
    nameArabic: 'هَاء',
    filename: 'ha.mp3',
    audioUrl: `${AUDIO_BASE}/ha.mp3`,
    makhrajEn: 'Deepest base of throat closest to chest vocal cords',
    makhrajTa: 'தொண்டையின் மிக அடித்தளப் பகுதியிலிருந்து நெஞ்சை ஒட்டி வெளிப்படும்',
    category: 'throat',
    isEmphatic: false,
    forms: { isolated: 'هـ', initial: 'هـ', medial: 'ـهـ', final: 'ـه' },
    sampleWord: {
      arabic: 'هُدَى',
      transliteration: 'Huda',
      translationEn: 'Guidance',
      translationTa: 'நேர்வழி',
    },
  },
  {
    id: 'waw',
    letter: 'و',
    nameEn: 'Waw',
    nameTa: 'வாவ்',
    nameArabic: 'وَاو',
    filename: 'waw.mp3',
    audioUrl: `${AUDIO_BASE}/waw.mp3`,
    makhrajEn: 'Rounding and puckering of both lips without complete closure',
    makhrajTa: 'இரு உதடுகளையும் வட்ட வடிவமாக குவித்து முத்தமிடுவது போல் உச்சரிப்பது',
    category: 'lips',
    isEmphatic: false,
    forms: { isolated: 'و', initial: 'و', medial: 'ـو', final: 'ـو' },
    sampleWord: {
      arabic: 'وَقْت',
      transliteration: 'Waqt',
      translationEn: 'Time',
      translationTa: 'நேரம்',
    },
  },
  {
    id: 'yaa',
    letter: 'ي',
    nameEn: 'Yaa',
    nameTa: 'யா',
    nameArabic: 'يَاء',
    filename: 'ya.mp3',
    audioUrl: `${AUDIO_BASE}/ya.mp3`,
    makhrajEn: 'Middle of tongue raised toward hard roof of mouth (Palate)',
    makhrajTa: 'நாவின் நடுப்பகுதி மேல் அன்னத்தை நோக்கி உயர்ந்து ஒலிக்கப்படும்',
    category: 'tongue',
    isEmphatic: false,
    forms: { isolated: 'ي', initial: 'يـ', medial: 'ـيـ', final: 'ـي' },
    sampleWord: {
      arabic: 'يَقِين',
      transliteration: 'Yaqeen',
      translationEn: 'Certainty',
      translationTa: 'உறுதியான நம்பிக்கை',
    },
  },
];

// Active global audio tracker to ensure only one sound plays at a time
let currentActiveAudio: HTMLAudioElement | null = null;

/**
 * Robust audio player for Arabic letters with multi-level fallback:
 * 1. Authentic isolated MP3 audio file
 * 2. Arabic SpeechSynthesis with explicit full letter name (e.g. "أَلِف", "بَاء")
 * 3. Web Audio harmonic chime fallback
 */
export function playLetterAudio(
  letter: ArabicLetterMeta | string,
  onStateChange?: (state: 'playing' | 'ended' | 'error') => void
): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof window === 'undefined') {
      resolve();
      return;
    }

    // Stop any previously playing audio instance
    if (currentActiveAudio) {
      try {
        currentActiveAudio.pause();
        currentActiveAudio.currentTime = 0;
      } catch (e) {
        console.warn(e);
      }
      currentActiveAudio = null;
    }

    // Resolve letter object if string passed
    let meta: ArabicLetterMeta | undefined;
    if (typeof letter === 'string') {
      meta = ARABIC_ALPHABET.find(
        (l) => l.letter === letter || l.nameEn.toLowerCase() === letter.toLowerCase() || l.id === letter
      );
    } else {
      meta = letter;
    }

    const fallbackSpeech = () => {
      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          const spokenText = meta?.nameArabic || (typeof letter === 'string' ? letter : meta?.letter || '');
          const utterance = new SpeechSynthesisUtterance(spokenText);
          utterance.lang = 'ar-SA';
          utterance.rate = 0.85;

          utterance.onstart = () => {
            onStateChange?.('playing');
          };
          utterance.onend = () => {
            onStateChange?.('ended');
            resolve();
          };
          utterance.onerror = () => {
            fallbackWebAudioTone();
          };

          window.speechSynthesis.speak(utterance);
          return;
        } catch (e) {
          console.warn('SpeechSynthesis error:', e);
        }
      }
      fallbackWebAudioTone();
    };

    const fallbackWebAudioTone = () => {
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) {
          onStateChange?.('ended');
          resolve();
          return;
        }
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        // Pleasing resonant marimba bell tone
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.6);
        onStateChange?.('playing');

        setTimeout(() => {
          onStateChange?.('ended');
          resolve();
        }, 600);
      } catch (e) {
        console.warn('WebAudio error:', e);
        onStateChange?.('ended');
        resolve();
      }
    };

    // If meta has authentic audioUrl, attempt to play it
    if (meta?.audioUrl) {
      onStateChange?.('playing');
      const audio = new Audio(meta.audioUrl);
      currentActiveAudio = audio;

      audio.onended = () => {
        currentActiveAudio = null;
        onStateChange?.('ended');
        resolve();
      };

      audio.onerror = () => {
        console.warn('Audio URL failed or blocked, falling back to speech synthesis:', meta?.audioUrl);
        currentActiveAudio = null;
        fallbackSpeech();
      };

      audio.play().catch((err) => {
        console.warn('Audio play error, falling back:', err);
        currentActiveAudio = null;
        fallbackSpeech();
      });
    } else {
      fallbackSpeech();
    }
  });
}
