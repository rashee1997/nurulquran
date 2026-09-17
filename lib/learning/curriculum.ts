export type ActivityType = 
  | 'listen_repeat'
  | 'multiple_choice'
  | 'word_order'
  | 'missing_segment'
  | 'audio_match';

export interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  instruction: string;
  promptArabic?: string;
  promptAudioUrl?: string;
  promptTranslationEn?: string;
  promptTranslationTa?: string;
  options?: string[];
  correctAnswer: string;
  explanationEn?: string;
  explanationTa?: string;
  wordTokens?: string[]; // for word_order
}

export interface Lesson {
  id: string;
  level: number;
  title: string;
  titleArabic: string;
  description: string;
  estimatedMinutes: number;
  xpReward: number;
  activities: Activity[];
}

export interface CurriculumLevel {
  level: number;
  title: string;
  titleArabic: string;
  summary: string;
  lessons: Lesson[];
}

export const CURRICULUM_LEVELS: CurriculumLevel[] = [
  {
    level: 1,
    title: 'Arabic Alphabet Recognition',
    titleArabic: 'حروف الهجاء',
    summary: 'Master the 28 isolated letters of the Arabic alphabet with authentic makharij (articulation points).',
    lessons: [
      {
        id: 'l1-1',
        level: 1,
        title: 'The First Letters: Alif to Khaa',
        titleArabic: 'من الألف إلى الخاء',
        description: 'Learn to recognize and pronounce Alif, Baa, Taa, Thaa, Jeem, Haa, and Khaa.',
        estimatedMinutes: 5,
        xpReward: 40,
        activities: [
          {
            id: 'l1-1-a1',
            type: 'multiple_choice',
            title: 'Identify Alif (أ)',
            instruction: 'Which letter is Alif? Listen to the audio and select the matching glyph.',
            promptArabic: 'أ',
            promptAudioUrl: 'https://arabicreadingcourse.com/audio/isolated-letters/alif.mp3',
            options: ['أ', 'ب', 'ت', 'ث'],
            correctAnswer: 'أ',
            explanationEn: 'Alif (أ) is the first letter, standing upright like a column.',
            explanationTa: 'அலிஃப் (أ) அரபி அகரவரிசையின் முதல் எழுத்தாகும்.',
          },
          {
            id: 'l1-1-a2',
            type: 'listen_repeat',
            title: 'Pronounce Baa (ب)',
            instruction: 'Baa has one dot below. Practice the pronunciation [B].',
            promptArabic: 'ب',
            promptAudioUrl: 'https://arabicreadingcourse.com/audio/isolated-letters/ba.mp3',
            correctAnswer: 'ب',
            explanationEn: 'Pronounced from the moist part of both lips.',
            explanationTa: 'இரு உதடுகளையும் இணைத்து உச்சரிக்கப்படும் எழுத்து.',
          },
          {
            id: 'l1-1-a3',
            type: 'multiple_choice',
            title: 'Identify Taa (ت)',
            instruction: 'Which letter has two dots on top?',
            promptArabic: 'ت',
            promptAudioUrl: 'https://arabicreadingcourse.com/audio/isolated-letters/ta.mp3',
            options: ['ت', 'ث', 'ب', 'ن'],
            correctAnswer: 'ت',
            explanationEn: 'Taa (ت) is written with two dots on top.',
            explanationTa: 'தா (ت) எழுத்தின் மேலே இரண்டு புள்ளிகள் இருக்கும்.',
          },
          {
            id: 'l1-1-a4',
            type: 'multiple_choice',
            title: 'Identify Thaa (ث)',
            instruction: 'Which letter has three dots on top?',
            promptArabic: 'ث',
            promptAudioUrl: 'https://arabicreadingcourse.com/audio/isolated-letters/tha.mp3',
            options: ['ث', 'ت', 'ش', 'ب'],
            correctAnswer: 'ث',
            explanationEn: 'Thaa (ث) has three dots and is pronounced with the tip of the tongue.',
            explanationTa: 'ஸா (ث) மூன்று புள்ளிகள் உடைய மென்மையான ஒலி.',
          },
        ],
      },
      {
        id: 'l1-2',
        level: 1,
        title: 'Dal to Dhad: Deep Throat & Tongue Letters',
        titleArabic: 'من الدال إلى الضاد',
        description: 'Explore Dal, Dhal, Raa, Zay, Seen, Sheen, Saad, and Dhad.',
        estimatedMinutes: 6,
        xpReward: 45,
        activities: [
          {
            id: 'l1-2-a1',
            type: 'multiple_choice',
            title: 'Identify Saad (ص)',
            instruction: 'Which letter is the emphatic Saad?',
            promptArabic: 'ص',
            promptAudioUrl: 'https://arabicreadingcourse.com/audio/isolated-letters/saad.mp3',
            options: ['ص', 'س', 'ض', 'ط'],
            correctAnswer: 'ص',
            explanationEn: 'Saad (ص) is a heavy letter pronounced with elevated back tongue.',
            explanationTa: 'ஸாத் (ص) தடிப்பமாக உச்சரிக்கப்பட வேண்டிய எழுத்து.',
          },
          {
            id: 'l1-2-a2',
            type: 'multiple_choice',
            title: 'Identify Raa (ر)',
            instruction: 'Which letter is Raa?',
            promptArabic: 'ر',
            promptAudioUrl: 'https://arabicreadingcourse.com/audio/isolated-letters/ra.mp3',
            options: ['ر', 'ز', 'د', 'ذ'],
            correctAnswer: 'ر',
            explanationEn: 'Raa (ر) is unpointed, curved letter with a trill vibration.',
            explanationTa: 'ரா (ر) புள்ளி இல்லாத வளைந்த எழுத்து.',
          },
        ],
      },
      {
        id: 'l1-3',
        level: 1,
        title: 'Taa to Yaa: Final Alphabet Letters',
        titleArabic: 'من الطاء إلى الياء',
        description: 'Complete the alphabet: Taa, Dhaa, Ayn, Ghayn, Faa, Qaf, Kaaf, Laam, Meem, Noon, Haa, Waw, Yaa.',
        estimatedMinutes: 6,
        xpReward: 50,
        activities: [
          {
            id: 'l1-3-a1',
            type: 'multiple_choice',
            title: 'Identify Qaf (ق)',
            instruction: 'Which letter is Qaf (deep throat)?',
            promptArabic: 'ق',
            promptAudioUrl: 'https://arabicreadingcourse.com/audio/isolated-letters/qaf.mp3',
            options: ['ق', 'ف', 'ك', 'غ'],
            correctAnswer: 'ق',
            explanationEn: 'Qaf has two dots and is pronounced from the extreme back of the tongue.',
            explanationTa: 'காஃப் (ق) தொண்டையின் அடித்தளத்தில் இருந்து தடிப்பாக உச்சரிக்கப்படும்.',
          },
          {
            id: 'l1-3-a2',
            type: 'multiple_choice',
            title: 'Identify Meem (م)',
            instruction: 'Which letter is Meem?',
            promptArabic: 'م',
            promptAudioUrl: 'https://arabicreadingcourse.com/audio/isolated-letters/miim.mp3',
            options: ['م', 'ن', 'ه', 'و'],
            correctAnswer: 'م',
            explanationEn: 'Meem is written with a small circular head and vertical tail.',
            explanationTa: 'மீம் (م) உதட்டொலி எழுத்து.',
          },
        ],
      },
    ],
  },
  {
    level: 2,
    title: 'Letter Connectivity (Forms)',
    titleArabic: 'اتصال الحروف',
    summary: 'Recognize Arabic letters in Initial, Medial, and Final connecting forms within words.',
    lessons: [
      {
        id: 'l2-1',
        level: 2,
        title: 'Initial & Medial Connecting Forms',
        titleArabic: 'الحروف في أول الكلمة ووسطها',
        description: 'Understand how letters change shape when joined from right to left.',
        estimatedMinutes: 6,
        xpReward: 50,
        activities: [
          {
            id: 'l2-1-a1',
            type: 'multiple_choice',
            title: 'Baa in Beginning of Word',
            instruction: 'How is Baa written at the beginning of a word?',
            options: ['بـ', 'ـبـ', 'ـب', 'ب'],
            correctAnswer: 'بـ',
            explanationEn: 'At the beginning, Baa opens to the left: بـ',
            explanationTa: 'வார்த்தையின் தொடக்கத்தில் பா (بـ) இடப்பக்கம் இணையும்.',
          },
          {
            id: 'l2-1-a2',
            type: 'multiple_choice',
            title: 'Non-connecting Letters',
            instruction: 'Which letter never connects to the letter that follows it?',
            options: ['د', 'ب', 'م', 'ل'],
            correctAnswer: 'د',
            explanationEn: 'Dal (د), Dhal (ذ), Raa (ر), Zay (ز), Waw (و), and Alif (ا) never connect to the left.',
            explanationTa: 'தால் (د) தனக்கு பின்னால் வரும் எழுத்துடன் இணையாது.',
          },
        ],
      },
    ],
  },
  {
    level: 3,
    title: 'Harakat & Short Vowels',
    titleArabic: 'الحركات القصيرة والسكون',
    summary: 'Master Fatha, Kasra, Damma, Sukoon, Shaddah, and Tanween with exact vowel vocalizations.',
    lessons: [
      {
        id: 'l3-1',
        level: 3,
        title: 'Fatha, Kasra, and Damma',
        titleArabic: 'الفتحة والكسرة والضمة',
        description: 'Learn the three primary short vowels of Quranic Arabic: [a], [i], [u].',
        estimatedMinutes: 7,
        xpReward: 55,
        activities: [
          {
            id: 'l3-1-a1',
            type: 'multiple_choice',
            title: 'Sound of Fatha (ـَ)',
            instruction: 'What short vowel sound does Fatha produce on Baa (بَ)?',
            options: ['Ba', 'Bi', 'Bu', 'Ban'],
            correctAnswer: 'Ba',
            explanationEn: 'Fatha creates a short open [a] sound: Ba.',
            explanationTa: 'ஃபத்ஹா (அகரக் குறி) "ப" ஒலியைத் தருகிறது.',
          },
          {
            id: 'l3-1-a2',
            type: 'multiple_choice',
            title: 'Sound of Kasra (ـِ)',
            instruction: 'What vowel sound does Kasra produce on Baa (بِ)?',
            options: ['Bi', 'Ba', 'Bu', 'Bin'],
            correctAnswer: 'Bi',
            explanationEn: 'Kasra sits below the letter and produces an [i] sound: Bi.',
            explanationTa: 'கஸ்ரா (இகரக் குறி) "பி" ஒலியைத் தருகிறது.',
          },
          {
            id: 'l3-1-a3',
            type: 'multiple_choice',
            title: 'Shaddah (ـّ)',
            instruction: 'What does a Shaddah indicate on a letter?',
            options: ['Doubling / emphasis of the letter', 'A silent letter', 'A prolonged vowel', 'A question mark'],
            correctAnswer: 'Doubling / emphasis of the letter',
            explanationEn: 'Shaddah combines a sukoon letter and a voweled letter, doubling its stress.',
            explanationTa: 'ஷத்தா எழுத்தை அழுத்தி இருமுறை ஒலிக்கச் செய்கிறது.',
          },
        ],
      },
    ],
  },
  {
    level: 4,
    title: 'Ahkam an-Noon as-Sakinah & Tanween',
    titleArabic: 'أحكام النون الساكنة والتنوين',
    summary: 'Master the 4 fundamental Tajweed rules of stationary Noon (نْ) and Tanween: Izhar, Idgham, Iqlab, and Ikhfa.',
    lessons: [
      {
        id: 'l4-1',
        level: 4,
        title: 'Izhar Halqi (Clear Throat Pronunciation)',
        titleArabic: 'الإظهار الحلقي',
        description: 'Pronounce Noon Sakinah clearly without extra nasalization when followed by the 6 throat letters (ء, هـ, ع, ح, غ, خ).',
        estimatedMinutes: 7,
        xpReward: 50,
        activities: [
          {
            id: 'l4-1-a1',
            type: 'multiple_choice',
            title: 'The 6 Letters of Izhar',
            instruction: 'Which group contains all 6 throat letters of Izhar Halqi?',
            options: ['ء ، هـ ، ع ، ح ، غ ، خ', 'ي ، ر ، م ، ل ، و ، ن', 'ق ، ط ، ب ، ج ، د', 'ف ، ق ، ك ، ل ، م'],
            correctAnswer: 'ء ، هـ ، ع ، ح ، غ ، خ',
            explanationEn: 'The 6 throat letters are gathered in the classical line: "أخي هاك علما حازه غير خاسر".',
            explanationTa: 'தொண்டை எழுத்துக்கள் ஆறு: ஹம்ஸா, ஹா, ஐன், ஹா, ஃகைன், கா.',
          },
          {
            id: 'l4-1-a2',
            type: 'listen_repeat',
            title: 'Recite Example: مَنْ ءَامَنَ',
            instruction: 'Listen and pronounce with clear Izhar without dragging or nasal pause:',
            promptArabic: 'مَنْ ءَامَنَ',
            correctAnswer: 'مَنْ ءَامَنَ',
            explanationEn: 'The Noon Sakinah is followed by Hamzah, so it must be pronounced cleanly with Izhar.',
            explanationTa: 'நூன் சாகினாவைத் தொடர்ந்து ஹம்ஸா வருவதால் தெளிவாக வெளிப்படுத்தி ஓத வேண்டும்.',
          },
        ],
      },
      {
        id: 'l4-2',
        level: 4,
        title: 'Idgham with & without Ghunnah',
        titleArabic: 'الإدغام بغنة وبغير غنة',
        description: 'Merge Noon Sakinah into the following letter: with 2-count nasal humming (ي، ن، م، و) or without (ل، ر).',
        estimatedMinutes: 8,
        xpReward: 55,
        activities: [
          {
            id: 'l4-2-a1',
            type: 'multiple_choice',
            title: 'Idgham bi-Ghunnah Letters',
            instruction: 'Which 4 letters cause Idgham WITH Ghunnah (merging with 2-count nasal resonance)?',
            options: ['ي ، ن ، م ، و (Yanmoo)', 'ل ، ر', 'ب ، ت ، ث', 'ء ، هـ ، ع ، ح'],
            correctAnswer: 'ي ، ن ، م ، و (Yanmoo)',
            explanationEn: 'The 4 letters are gathered in the mnemonic "يَنْمُو" (Y-N-M-W).',
            explanationTa: 'குன்னாவுடன் இத்ஃகாம் செய்யப்படும் 4 எழுத்துக்கள்: யா, நூன், மீம், வாவ் (யன்மூ).',
          },
          {
            id: 'l4-2-a2',
            type: 'listen_repeat',
            title: 'Recite Example: مَن يَقُولُ',
            instruction: 'Merge the Noon into Yaa with a melodious 2-count Ghunnah:',
            promptArabic: 'مَن يَقُولُ',
            correctAnswer: 'مَن يَقُولُ',
            explanationEn: 'Pronounced as "May-yaqoolu" with continuous nasal flow through the nose.',
            explanationTa: '"மய்யகூலு" என மூக்கின் வழியாக குன்னா ஒலியுடன் இணைத்து ஓதவும்.',
          },
        ],
      },
      {
        id: 'l4-3',
        level: 4,
        title: 'Iqlab & Ikhfa Haqiqi',
        titleArabic: 'الإقلاب والإخفاء الحقيقي',
        description: 'Transform Noon into a hidden Meem before Baa (ب), and conceal Noon with nasal resonance before 15 Ikhfa letters.',
        estimatedMinutes: 9,
        xpReward: 60,
        activities: [
          {
            id: 'l4-3-a1',
            type: 'multiple_choice',
            title: 'The Single Letter of Iqlab',
            instruction: 'What is the only letter that triggers Iqlab when it follows Noon Sakinah or Tanween?',
            options: ['ب (Baa)', 'م (Meem)', 'ف (Faa)', 'ت (Taa)'],
            correctAnswer: 'ب (Baa)',
            explanationEn: 'When Noon Sakinah or Tanween meets Baa (ب), it changes into a Meem (م) with Ghunnah.',
            explanationTa: 'இக்லாப் விதிக்குரிய ஒரே எழுத்து பா (ب) ஆகும்; நூன் மீமாக மாறும்.',
          },
          {
            id: 'l4-3-a2',
            type: 'listen_repeat',
            title: 'Recite Example: مِنۢ بَعْدِ',
            instruction: 'Turn Noon into Meem with gentle contact of lips and 2-count Ghunnah:',
            promptArabic: 'مِنۢ بَعْدِ',
            correctAnswer: 'مِنۢ بَعْدِ',
            explanationEn: 'Pronounced as "Mim-ba\'di" without pressing lips excessively tightly.',
            explanationTa: '"மிம்பஃதி" என உதடுகளை மென்மையாக மூடி குன்னாவுடன் ஓதவும்.',
          },
        ],
      },
    ],
  },
  {
    level: 5,
    title: 'Ahkam al-Meem as-Sakinah & Ghunnah',
    titleArabic: 'أحكام الميم الساكنة والغنة',
    summary: 'Study the 3 rules of resting Meem (مْ): Ikhfa Shafawi, Idgham Shafawi, and Izhar Shafawi, along with degrees of Ghunnah.',
    lessons: [
      {
        id: 'l5-1',
        level: 5,
        title: 'Ikhfa Shafawi & Idgham Shafawi',
        titleArabic: 'الإخفاء والإدغام الشفوي',
        description: 'Conceal Meem before Baa with nasal resonance, and merge Meem into another Meem.',
        estimatedMinutes: 8,
        xpReward: 60,
        activities: [
          {
            id: 'l5-1-a1',
            type: 'multiple_choice',
            title: 'Letter of Ikhfa Shafawi',
            instruction: 'When Meem Sakinah meets Baa (ب) like in "تَرْمِيهِم بِحِجَارَةٍ", what rule applies?',
            options: ['Ikhfa Shafawi (Oral Concealment)', 'Izhar Halqi', 'Qalqalah', 'Madd Lazim'],
            correctAnswer: 'Ikhfa Shafawi (Oral Concealment)',
            explanationEn: 'Meem Sakinah followed by Baa is concealed at the lips with 2 counts of Ghunnah.',
            explanationTa: 'மீம் சாகினாவைத் தொடர்ந்து பா வந்தால் இக்ஃபா ஷஃபவி விதியாகும்.',
          },
          {
            id: 'l5-1-a2',
            type: 'listen_repeat',
            title: 'Practice: لَهُم مَّا يَشَآءُونَ',
            instruction: 'Merge the two Meems with full 2-count nasal resonance (Idgham Muthlayn):',
            promptArabic: 'لَهُم مَّا يَشَآءُونَ',
            correctAnswer: 'لَهُم مَّا يَشَآءُونَ',
            explanationEn: 'Idgham Shafawi: The resting Meem merges into the voweled Meem with Shaddah and Ghunnah.',
            explanationTa: 'இரண்டு மீம்களும் ஒன்றுடன் ஒன்று இணைந்து அழுத்தமான குன்னாவுடன் ஒலிக்கிறது.',
          },
        ],
      },
      {
        id: 'l5-2',
        level: 5,
        title: 'Izhar Shafawi & Caution with Waw and Faa',
        titleArabic: 'الإظهار الشفوي والتحذير عند الواو والفاء',
        description: 'Pronounce Meem clearly before the other 26 letters, being extra cautious not to hide it before Waw (و) and Faa (ف).',
        estimatedMinutes: 7,
        xpReward: 60,
        activities: [
          {
            id: 'l5-2-a1',
            type: 'multiple_choice',
            title: 'Why take special care before Waw and Faa?',
            instruction: 'Why warned Ibn al-Jazari against inadvertently hiding Meem before Waw (و) or Faa (ف)?',
            options: [
              'Because they share or neighbor the same lips articulation point',
              'Because they are silent letters',
              'Because they require 6 counts of Madd',
              'Because they turn into Qalqalah'
            ],
            correctAnswer: 'Because they share or neighbor the same lips articulation point',
            explanationEn: 'Meem and Waw both come from the lips, and Faa touches the bottom lip, creating risk of accidental concealment.',
            explanationTa: 'மீம், வாவ், ஃபா ஆகியவை உதட்டு தானங்களைப் பகிர்வதால் மீம் மறைந்து விடாமல் தெளிவாக வெளிப்படுத்த வேண்டும்.',
          },
        ],
      },
    ],
  },
  {
    level: 6,
    title: 'Rules of Raa & Laam al-Jalalah',
    titleArabic: 'أحكام الراء ولام لفظ الجلالة',
    summary: 'Distinguish between heavy (Tafkheem) and light (Tarqeeq) pronunciations for the letter Raa (ر) and the Name of Allah.',
    lessons: [
      {
        id: 'l6-1',
        level: 6,
        title: 'Tafkheem & Tarqeeq of the Letter Raa',
        titleArabic: 'تفخيم الراء وترقيقها',
        description: 'Understand when Raa must be recited with a heavy, full-mouthed resonance versus a light, thin tone.',
        estimatedMinutes: 8,
        xpReward: 65,
        activities: [
          {
            id: 'l6-1-a1',
            type: 'multiple_choice',
            title: 'When is Raa recited Heavy (Mufakh-kham)?',
            instruction: 'In which condition is the letter Raa pronounced Heavy (Tafkheem)?',
            options: [
              'When it carries Fatha (رَ) or Damma (رُ)',
              'When it carries Kasra (رِ)',
              'When it is preceded by a Yaa Sakinah',
              'Always without exception'
            ],
            correctAnswer: 'When it carries Fatha (رَ) or Damma (رُ)',
            explanationEn: 'Raa is heavy when it has Fatha or Damma, or is silent preceded by Fatha or Damma (e.g. رَبَّنَا, قُرْءَان).',
            explanationTa: 'ரா எழுத்திற்கு ஃபத்ஹா அல்லது தம்மா இருக்கும்போது தஃப்கீம் (கனமான ஒலி) கொண்டு ஓத வேண்டும்.',
          },
          {
            id: 'l6-1-a2',
            type: 'listen_repeat',
            title: 'Recite Light Raa: فِرْعَوْنَ',
            instruction: 'Pronounce Raa with Tarqeeq (light, thin resonance) because of the preceding original Kasra:',
            promptArabic: 'فِرْعَوْنَ',
            correctAnswer: 'فِرْعَوْنَ',
            explanationEn: 'The Raa is silent and preceded by an original Kasra on Faa, making it light (Muraqqaq).',
            explanationTa: 'முன்னால் உள்ள அசல் கஸ்ராவின் காரணமாக ரா மெலிதாக (தர்கீக்) ஒலிக்கப்படுகிறது.',
          },
        ],
      },
      {
        id: 'l6-2',
        level: 6,
        title: 'Laam of Allah (لفظ الجلالة)',
        titleArabic: 'أحكام لام لفظ الجلالة',
        description: 'The majestic Name "Allah" is heavy after Fatha/Damma, and light after Kasra.',
        estimatedMinutes: 7,
        xpReward: 65,
        activities: [
          {
            id: 'l6-2-a1',
            type: 'multiple_choice',
            title: 'Bismillah Laam Status',
            instruction: 'In "بِسْمِ ٱللَّهِ", is the Laam in Allah pronounced Heavy or Light?',
            options: ['Light (Tarqeeq) due to preceding Kasra', 'Heavy (Tafkheem)', 'Qalqalah', 'Silent'],
            correctAnswer: 'Light (Tarqeeq) due to preceding Kasra',
            explanationEn: 'Because the Meem before it has Kasra (Bismi), the Laam in Allah is pronounced light and thin.',
            explanationTa: '"பிஸ்மில்லாஹ்" வில் முன்னால் கஸ்ரா இருப்பதால் அல்லாஹ்வின் லாம் மெலிதாக ஒலிக்கப்படுகிறது.',
          },
        ],
      },
    ],
  },
  {
    level: 7,
    title: 'Ahkam al-Madd (Vowel Prolongation)',
    titleArabic: 'أحكام المد وأقسامه',
    summary: 'Master the precise timing of Madd: Natural Madd (2 counts), Connected/Separated (4-5 counts), and Compulsory Madd Lazim (6 counts).',
    lessons: [
      {
        id: 'l7-1',
        level: 7,
        title: 'Madd Asli, Muttasil & Munfasil',
        titleArabic: 'المد الأصلي والمتصل والمنفصل',
        description: 'Distinguish between the 2-count natural vowel and the 4-to-5 count prolongation triggered by Hamzah.',
        estimatedMinutes: 8,
        xpReward: 70,
        activities: [
          {
            id: 'l7-1-a1',
            type: 'multiple_choice',
            title: 'Madd Muttasil Duration',
            instruction: 'In a single word where Madd letter is followed by Hamzah like "جَآءَ" or "ٱلسَّمَآءِ", how many counts is it held?',
            options: ['4 to 5 Harakat (Obligatory / Waajib)', '2 Harakat only', '1 Harakat', '8 Harakat'],
            correctAnswer: '4 to 5 Harakat (Obligatory / Waajib)',
            explanationEn: 'Madd Muttasil (Connected Madd) is obligatory and prolonged 4 to 5 counts in the Hafs recitation.',
            explanationTa: 'மத்து முத்தஸில் ஒரே சொல்லில் ஹம்ஸாவுடன் இணைவதால் 4 முதல் 5 ஹரக்கத் வரை நீட்ட வேண்டும்.',
          },
          {
            id: 'l7-1-a2',
            type: 'listen_repeat',
            title: 'Recite Madd Munfasil: إِنَّآ أَعْطَيْنَـٰكَ',
            instruction: 'Hold the Madd for 4-5 counts across the word boundary:',
            promptArabic: 'إِنَّآ أَعْطَيْنَـٰكَ',
            correctAnswer: 'إِنَّآ أَعْطَيْنَـٰكَ',
            explanationEn: 'The Madd letter at the end of "Innaa" meets Hamzah in "A\'taynaak", allowing 4-5 counts prolongation.',
            explanationTa: 'மத்து முன்ஃபஸில் சொல்லின் இறுதியில் வந்து அடுத்த சொல்லில் ஹம்ஸா வருவதால் 4-5 ஹரக்கத் நீட்டவும்.',
          },
        ],
      },
      {
        id: 'l7-2',
        level: 7,
        title: 'Madd Lazim (Compulsory 6 Counts)',
        titleArabic: 'المد اللازم ست حركات',
        description: 'Execute the powerful 6-count compulsory Madd when followed by an original Sukoon or Shaddah.',
        estimatedMinutes: 9,
        xpReward: 75,
        activities: [
          {
            id: 'l7-2-a1',
            type: 'listen_repeat',
            title: 'Recite: وَلَا ٱلضَّآلِّينَ',
            instruction: 'Hold the Alif before the Shaddah for a full 6 counts:',
            promptArabic: 'وَلَا ٱلضَّآلِّينَ',
            correctAnswer: 'وَلَا ٱلضَّآلِّينَ',
            explanationEn: 'Madd Lazim Kalimi Muthaqqal: The Madd letter is followed by a Shaddah in the same word, requiring 6 full counts.',
            explanationTa: '"வளழ்ழால்லீன்" - மத்து லாஸிம் கலிமீ முஸக்கல் 6 முழு ஹரக்கத் நீட்டப்பட வேண்டும்.',
          },
        ],
      },
    ],
  },
  {
    level: 8,
    title: 'Ahkam al-Qalqalah & 17 Specific Makharij',
    titleArabic: 'أحكام القلقلة ومخارج الحروف',
    summary: 'Master the 5 bouncing Qalqalah letters (ق ط ب ج د) and explore the 17 precise articulation points of the human vocal tract.',
    lessons: [
      {
        id: 'l8-1',
        level: 8,
        title: 'Degrees of Qalqalah: Kubra, Wusta, Sughra',
        titleArabic: 'مراتب القلقلة: كبرى ووسطى وصغرى',
        description: 'Hear and reproduce the bouncing echo: strongest when stopping on Shaddah (Kubra) to mild in the middle of words (Sughra).',
        estimatedMinutes: 8,
        xpReward: 75,
        activities: [
          {
            id: 'l8-1-a1',
            type: 'multiple_choice',
            title: 'Qalqalah Letters Mnemonic',
            instruction: 'Which phrase gathers all 5 Qalqalah letters?',
            options: ['قُطْبُ جَدّ (Qutb Jadd)', 'يَرْمَلُون', 'أَخِي هَاكَ عِلْمًا', 'حَيٌّ طَهُرَ'],
            correctAnswer: 'قُطْبُ جَدّ (Qutb Jadd)',
            explanationEn: 'The 5 letters of Qalqalah are: Qaf (ق), Taa (ط), Baa (ب), Jeem (ج), and Dal (د).',
            explanationTa: 'கல்கலா எழுத்துக்கள் ஐந்தும்: காஃப், தா, பா, ஜீம், தால் (குத்பு ஜத்).',
          },
          {
            id: 'l8-1-a2',
            type: 'listen_repeat',
            title: 'Recite: قُلْ أَعُوذُ بِرَبِّ ٱلْفَلَقِ',
            instruction: 'Stop on the Qaf with crisp echoing resonance (Qalqalah Wusta):',
            promptArabic: 'قُلْ أَعُوذُ بِرَبِّ ٱلْفَلَقِ',
            correctAnswer: 'قُلْ أَعُوذُ بِرَبِّ ٱلْفَلَقِ',
            explanationEn: 'At the end of the Ayah, the Qaf takes Sukoon and releases with a distinct rebounding sound.',
            explanationTa: 'வசனத்தின் இறுதியில் காஃப் (ق) எழுத்தில் நிறுத்தும் போது கல்கலா எதிரொலி தெளிவாக கேட்க வேண்டும்.',
          },
        ],
      },
      {
        id: 'l8-2',
        level: 8,
        title: 'The 5 Vocal Areas & 17 Specific Makharij',
        titleArabic: 'المخارج العامة الخمسة والسبعة عشر الخاصة',
        description: 'Understand the vocal cavity (Jawf), throat (Halq), tongue (Lisan), lips (Shafatayn), and nasal nasal passage (Khayshum).',
        estimatedMinutes: 9,
        xpReward: 80,
        activities: [
          {
            id: 'l8-2-a1',
            type: 'multiple_choice',
            title: 'Makhraj of the Letter Dhaad (ض)',
            instruction: 'What is the unique articulation point of the Arabic Dhaad (ض)?',
            options: [
              'One or both sides of the tongue against the upper molars',
              'The tip of the tongue touching the front teeth',
              'Deep inside the throat',
              'The middle of the lips'
            ],
            correctAnswer: 'One or both sides of the tongue against the upper molars',
            explanationEn: 'Dhaad is articulated from the edge/side of the tongue pressing along the upper molars with elongation (Istitalah).',
            explanationTa: 'ளாதின் (ض) மக்ரிஜ்: நாவின் பக்கவாட்டு ஓரம் மேல் கடைவாய்ப் பற்களுடன் இணைவதாகும்.',
          },
        ],
      },
    ],
  },
  {
    level: 9,
    title: 'Sifaat al-Huroof & Rules of Waqf',
    titleArabic: 'صفات الحروف وأحكام الوقف والابتداء',
    summary: 'Characteristics of letters (Hams, Jahr, Shiddah, Isti\'laa) and Quranic stopping conventions (م، قلى، صلى، ج، لا).',
    lessons: [
      {
        id: 'l9-1',
        level: 9,
        title: 'Characteristics with Opposites (الصفات ذات الضد)',
        titleArabic: 'الصفات المتضادة',
        description: 'Learn the flow of breath (Hams vs Jahr), strength of sound (Shiddah vs Rakhawah), and tongue elevation (Isti\'laa vs Istifal).',
        estimatedMinutes: 8,
        xpReward: 80,
        activities: [
          {
            id: 'l9-1-a1',
            type: 'multiple_choice',
            title: 'Letters of Whispered Breath (Hams)',
            instruction: 'Which mnemonic gathers all 10 whispered letters of Hams (فَحَثَّهُ شَخْصٌ سَكَتَ)?',
            options: [
              'فَحَثَّهُ شَخْصٌ سَكَتَ (Fahath-thahu shakhsun sakat)',
              'قُطْبُ جَدّ',
              'يَرْمَلُون',
              'خُصَّ ضَغْطٍ قِظْ'
            ],
            correctAnswer: 'فَحَثَّهُ شَخْصٌ سَكَتَ (Fahath-thahu shakhsun sakat)',
            explanationEn: 'Hams is the continuation of breath when pronouncing these 10 letters (ف ، ح ، ث ، هـ ، ش ، خ ، ص ، س ، ك ، ت).',
            explanationTa: 'ஹம்ஸ் (காற்று வெளியேறும் எழுத்துக்கள் 10): ஃபஹஸ்ஸஹு ஷக்ஸுன் சகத்.',
          },
        ],
      },
      {
        id: 'l9-2',
        level: 9,
        title: 'Quranic Stop Signs (علامات الوقف)',
        titleArabic: 'علامات الوقف في المصحف الشريف',
        description: 'Decode the symbols printed in the Quran: م (Mandatory stop), قلى (Stopping preferred), صلى (Continuing preferred), ج (Permissible), and لا (Do not stop).',
        estimatedMinutes: 8,
        xpReward: 85,
        activities: [
          {
            id: 'l9-2-a1',
            type: 'multiple_choice',
            title: 'Meaning of "قلى" (Qalaa)',
            instruction: 'What does the Quranic stop sign "قلى" mean when reading an Ayah?',
            options: [
              'Stopping is preferred (Al-Waqfu Awla)',
              'Continuing is strictly required',
              'You must recite in reverse',
              '6 counts of Madd'
            ],
            correctAnswer: 'Stopping is preferred (Al-Waqfu Awla)',
            explanationEn: '"قلى" is an abbreviation for "الوقف أولى" meaning stopping here is better though continuing is allowed.',
            explanationTa: '"கலா" (قلى) குறி நிறுத்துவது மிகவும் உகந்தது (அல்-வக்ஃபு அவ்லா) என்பதைக் குறிக்கிறது.',
          },
        ],
      },
    ],
  },
  {
    level: 10,
    title: 'Master Recitation & Juz 30 Hifz Progression',
    titleArabic: 'إتقان التلاوة وحفظ جزء عم كاملاً',
    summary: 'Synthesize all Tajweed disciplines with word-by-word morphological precision across Juz Amma (Surah Al-Fatihah, The 3 Quls, Al-Kawthar, Al-Asr, An-Nasr).',
    lessons: [
      {
        id: 'l10-1',
        level: 10,
        title: 'Surah Al-Fatihah Master Recitation',
        titleArabic: 'سورة الفاتحة بالإتقان التام',
        description: 'Recite the Mother of the Book with pristine Tajweed, precise Madd Lazim on Walad-Daaalleen, and clear Tarqeeq.',
        estimatedMinutes: 9,
        xpReward: 90,
        activities: [
          {
            id: 'l10-1-a1',
            type: 'word_order',
            title: 'Assemble the Basmalah',
            instruction: 'Assemble the sacred opening verse in order:',
            wordTokens: ['بِسْمِ', 'ٱللَّهِ', 'ٱلرَّحْمَـٰنِ', 'ٱلرَّحِيمِ'],
            correctAnswer: 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ',
            explanationEn: 'Surah 1:1 - In the name of Allah, the Entirely Merciful, the Especially Merciful.',
            explanationTa: 'அளவற்ற அருளாளனும், நிகரற்ற அன்புடையோனுமாகிய அல்லாஹ்வின் பெயரால்.',
          },
          {
            id: 'l10-1-a2',
            type: 'listen_repeat',
            title: 'Recite with 6-count Madd: غَيْرِ ٱلْمَغْضُوبِ عَلَيْهِمْ وَلَا ٱلضَّآلِّينَ',
            instruction: 'Maintain Izhar Shafawi on "Alayhim" and a grand 6-count Madd Lazim on "Walad-Daaalleen":',
            promptArabic: 'غَيْرِ ٱلْمَغْضُوبِ عَلَيْهِمْ وَلَا ٱلضَّآلِّينَ',
            correctAnswer: 'غَيْرِ ٱلْمَغْضُوبِ عَلَيْهِمْ وَلَا ٱلضَّآلِّينَ',
            explanationEn: 'Execute pristine Dhaad makhraj and prolong the Madd Lazim for full 6 counts.',
            explanationTa: 'ளாதின் மக்ரிஜை சரியாக வைத்து 6 ஹரக்கத் மத்து லாஸிமை பூரணமாக ஓதவும்.',
          },
        ],
      },
      {
        id: 'l10-2',
        level: 10,
        title: 'The Mu\'awwidhat & Al-Ikhlas Mastery',
        titleArabic: 'المعوذات والإخلاص مع التدبر',
        description: 'Complete memorization and recitation of Chapters 112, 113, and 114 with Qalqalah mastery.',
        estimatedMinutes: 10,
        xpReward: 100,
        activities: [
          {
            id: 'l10-2-a1',
            type: 'word_order',
            title: 'Assemble Surah Al-Ikhlas Ayah 1',
            instruction: 'Place words in exact divine order:',
            wordTokens: ['قُلْ', 'هُوَ', 'ٱللَّهُ', 'أَحَدٌ'],
            correctAnswer: 'قُلْ هُوَ ٱللَّهُ أَحَدٌ',
            explanationEn: 'Say: He is Allah, [who is] One.',
            explanationTa: 'கூறுவீராக: அவன் அல்லாஹ், ஒருவனே.',
          },
          {
            id: 'l10-2-a2',
            type: 'multiple_choice',
            title: 'Tajweed in "مِن شَرِّ مَا خَلَقَ"',
            instruction: 'What Tajweed rule occurs in "مِن شَرِّ" (Noon Sakinah followed by Sheen)?',
            options: [
              'Ikhfa Haqiqi with 2-count Ghunnah',
              'Izhar Halqi',
              'Iqlab',
              'Madd Muttasil'
            ],
            correctAnswer: 'Ikhfa Haqiqi with 2-count Ghunnah',
            explanationEn: 'Noon Sakinah followed by the letter Sheen (ش) requires nasal concealment (Ikhfa) with light Ghunnah.',
            explanationTa: 'நூன் சாகினாவைத் தொடர்ந்து ஷீன் வருவதால் இக்ஃபா ஹகீகீ விதியாகும்.',
          },
        ],
      },
    ],
  },
];

export function getLessonById(lessonId: string): Lesson | undefined {
  for (const lvl of CURRICULUM_LEVELS) {
    const found = lvl.lessons.find(l => l.id === lessonId);
    if (found) return found;
  }
  return undefined;
}
