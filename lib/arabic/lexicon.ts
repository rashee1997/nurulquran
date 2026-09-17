/**
 * Arabic Lab — the single lexical spine.
 *
 * One entry = one word/phrase taught in BOTH registers at once:
 *   classical (Uthmani anchor + iʿrāb parse)  ↔  spoken (Modern Standard Arabic + Tamil bridge)
 *
 * The Tamil gloss is never optional: Tamil is the learner's bridge language in this app,
 * so every spoken phrase ships with an English gloss and a Tamil gloss.
 *
 * Quranic anchors are hand-verified mushaf tokens. Phase 6 re-asserts each of them against
 * the deterministic provider in `lib/quran` (see `validateArabicLabCurriculum`).
 */

import type { ArabicEntry } from './types';

export const ARABIC_LEXICON: readonly ArabicEntry[] = [
  // -------------------------------------------------------------------------
  // ʿAqīda / divine names — the first bridge most learners need
  // -------------------------------------------------------------------------
  {
    id: 'allah',
    lemma: 'اللَّه',
    transliteration: 'allāh',
    quranic: {
      ref: { surah: 1, ayah: 1 },
      token: 'ٱللَّهِ',
      ayahTextUthmani: 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ',
      wordIndex: 2,
      irab: {
        case: 'jarr',
        sign: 'kasra',
        role: 'mudāf ilayhi',
        explanationEn: 'It completes the iḍāfa with بِسْمِ, so it is majrūr with kasra.',
        explanationTa: 'بِسْمِ உடன் இளாஃபா இணைப்பை முடிப்பதால், இது ஜர் (கஸ்ரா) நிலையில் உள்ளது.',
        spokenBehavior: 'neutralized',
        spokenNoteEn: 'Spoken MSA drops the kasra — the phrase lands as "bismillāh".',
        spokenNoteTa: 'பேச்சு MSA வில் கஸ்ரா விழுந்து "பிஸ்மில்லாஹ்" என வரும்.',
      },
    },
    requiresAnchor: true,
    spoken: {
      msa: 'أَذْكُرُ اللَّهَ كُلَّ يَوْمٍ',
      transliteration: 'adhkuru llāha kulla yawm',
      glossEn: 'I remember God every day.',
      glossTa: 'நான் தினமும் அல்லாஹ்வை நினைவு கூர்கிறேன்.',
    },
    bridge: {
      relationship: 'ending-dropped',
      noteEn: 'The jarr kasra of the Quranic form disappears in speech; the word itself is identical.',
      noteTa: 'குர்ஆன் வடிவத்தின் ஜர் கஸ்ரா பேச்சில் மறைகிறது; சொல் மட்டும் அப்படியே நிலைக்கிறது.',
    },
    tags: ['proper-noun'],
  },
  {
    id: 'al-hamd',
    lemma: 'حَمْد',
    transliteration: 'ḥamd',
    root: {
      letters: ['ح', 'م', 'د'],
      display: 'ح-م-د',
      meaningEn: 'praise, to praise',
      meaningTa: 'புகழ், புகழ்தல்',
    },
    wazn: 'faʿl',
    quranic: {
      ref: { surah: 1, ayah: 2 },
      token: 'ٱلْحَمْدُ',
      ayahTextUthmani: 'ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ',
      wordIndex: 1,
      irab: {
        case: 'rafʿ',
        sign: 'damma',
        role: 'mubtadaʾ',
        explanationEn: 'It opens the nominal sentence as its mubtadaʾ, so it takes rafʿ with damma.',
        explanationTa: 'பெயர்ச்சொல் வாக்கியத்தின் முப்ததா (தொடக்கம்) என்பதால் ரஃப் (தம்மா) பெறுகிறது.',
        spokenBehavior: 'retained',
        spokenNoteEn: 'This phrase is spoken with its damma intact: "al-ḥamdu lillāh".',
        spokenNoteTa: 'இந்தத் தொடர் பேச்சிலும் தம்மாவுடனேயே வரும்: "அல்ஹம்து லில்லாஹ்".',
      },
    },
    requiresAnchor: true,
    spoken: {
      msa: 'الْحَمْدُ لِلَّهِ',
      transliteration: 'al-ḥamdu lillāh',
      glossEn: 'All praise belongs to God.',
      glossTa: 'எல்லாப் புகழும் அல்லாஹ்வுக்கே உரியது.',
    },
    bridge: {
      relationship: 'identical',
      noteEn: 'Both registers use the same wording — this is one of the few classical phrases retained verbatim in speech.',
      noteTa: 'இரு நிலைகளிலும் ஒரே சொற்கள் — பேச்சில் அப்படியே நிலைக்கும் சில குர்ஆன் தொடர்களில் இதுவும் ஒன்று.',
    },
    tags: ['noun'],
  },
  {
    id: 'rabb',
    lemma: 'رَبّ',
    transliteration: 'rabb',
    root: {
      letters: ['ر', 'ب', 'ب'],
      display: 'ر-ب-ب',
      meaningEn: 'lord, sustainer, master',
      meaningTa: 'இறைவன், பரிபாலிப்பவன், எஜமான்',
    },
    wazn: 'faʿl',
    quranic: {
      ref: { surah: 1, ayah: 2 },
      token: 'رَبِّ',
      ayahTextUthmani: 'ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ',
      wordIndex: 3,
      irab: {
        case: 'jarr',
        sign: 'kasra',
        role: 'badal',
        explanationEn: 'It restates ٱللَّهِ as a badal (appositive), so it is majrūr with kasra.',
        explanationTa: 'ٱللَّهِ என்பதை விளக்கும் பதல் என்பதால் ஜர் (கஸ்ரா) பெறுகிறது.',
        spokenBehavior: 'replaced-by-pronoun',
        spokenNoteEn: 'In speech the noun usually carries a possessive suffix instead: "rabbī" (my Lord).',
        spokenNoteTa: 'பேச்சில் இச்சொல் பொதுவாக உடைமைப் பின்னொட்டுடன் வரும்: "ரப்பீ" (என் இறைவன்).',
      },
    },
    requiresAnchor: true,
    spoken: {
      msa: 'رَبِّي كَرِيمٌ',
      transliteration: 'rabbī karīm',
      glossEn: 'My Lord is generous.',
      glossTa: 'என் இறைவன் கருணையாளன்.',
    },
    bridge: {
      relationship: 'replaced-by-pronoun',
      noteEn: 'Classical iḍāfa (رَبِّ ٱلْعَٰلَمِينَ) becomes a suffixed pronoun in speech (رَبِّي).',
      noteTa: 'குர்ஆனின் இளாஃபா (رَبِّ ٱلْعَٰلَمِينَ) பேச்சில் பின்னொட்டுப் பிரதிப்பெயராக மாறுகிறது (رَبِّي).',
    },
    tags: ['noun'],
  },
  {
    id: 'alamin',
    lemma: 'عَالَم',
    transliteration: 'ʿālam',
    root: {
      letters: ['ع', 'ل', 'م'],
      display: 'ع-ل-م',
      meaningEn: 'knowledge; a sign by which something is known',
      meaningTa: 'அறிவு; அடையாளம்',
    },
    wazn: 'fāʿil',
    quranic: {
      ref: { surah: 1, ayah: 2 },
      token: 'ٱلْعَٰلَمِينَ',
      ayahTextUthmani: 'ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ',
      wordIndex: 4,
      tajweedRule: 'madd_normal',
      irab: {
        case: 'jarr',
        sign: 'ya',
        role: 'mudāf ilayhi',
        explanationEn:
          'It is the muḍāf ilayhi of رَبِّ. As a sound masculine plural it is majrūr with ya instead of kasra.',
        explanationTa:
          'இது رَبِّ இன் முழாஃப் இலைஹி. ஒலி ஆண்பால் பன்மை என்பதால் கஸ்ராவுக்குப் பதிலாக யா கொண்டு ஜர் பெறுகிறது.',
        spokenBehavior: 'retained',
        spokenNoteEn: 'The long -īn ending is a vowel, not a case ending, so it survives in speech.',
        spokenNoteTa: 'நீண்ட -ஈன் முடிவு உயிரொலி என்பதால் பேச்சிலும் நிலைத்திருக்கும்.',
      },
    },
    requiresAnchor: true,
    spoken: {
      msa: 'نَحْنُ نَعِيشُ فِي عَالَمٍ وَاحِدٍ',
      transliteration: 'naḥnu naʿīshu fī ʿālamin wāḥid',
      glossEn: 'We live in one world.',
      glossTa: 'நாம் ஒரே உலகில் வாழ்கிறோம்.',
    },
    bridge: {
      relationship: 'lexical-shift',
      noteEn: 'Everyday speech prefers the singular عَالَم over the Quranic plural ٱلْعَٰلَمِينَ.',
      noteTa: 'அன்றாட பேச்சு குர்ஆனின் பன்மை ٱلْعَٰلَمِينَ க்குப் பதிலாக ஒருமை عَالَم ஐ விரும்புகிறது.',
    },
    tags: ['noun'],
  },

  // -------------------------------------------------------------------------
  // Book / pen / knowledge cluster — classroom vocabulary straight from Sūrat al-ʿAlaq
  // -------------------------------------------------------------------------
  {
    id: 'kitab',
    lemma: 'كِتَاب',
    transliteration: 'kitāb',
    root: {
      letters: ['ك', 'ت', 'ب'],
      display: 'ك-ت-ب',
      meaningEn: 'to write; writing, book',
      meaningTa: 'எழுதுதல்; எழுத்து, புத்தகம்',
    },
    wazn: 'fiʿāl',
    quranic: {
      ref: { surah: 2, ayah: 2 },
      token: 'ٱلْكِتَٰبُ',
      ayahTextUthmani: 'ذَٰلِكَ ٱلْكِتَٰبُ لَا رَيْبَ فِيهِ',
      wordIndex: 2,
      irab: {
        case: 'rafʿ',
        sign: 'damma',
        role: 'khabar',
        explanationEn: 'It is the khabar of the demonstrative ذلك, so it is marfūʿ with damma.',
        explanationTa: 'ذلك என்பதன் கபர் (பயனிலை) என்பதால் ரஃப் (தம்மா) பெறுகிறது.',
        spokenBehavior: 'neutralized',
        spokenNoteEn: 'Spoken MSA drops the damma: "al-kitāb".',
        spokenNoteTa: 'பேச்சு MSA வில் தம்மா விழும்: "அல்கிதாப்".',
      },
    },
    requiresAnchor: true,
    spoken: {
      msa: 'هَذَا كِتَابٌ جَدِيدٌ',
      transliteration: 'hādhā kitābun jadīd',
      glossEn: 'This is a new book.',
      glossTa: 'இது ஒரு புதிய புத்தகம்.',
    },
    bridge: {
      relationship: 'ending-dropped',
      noteEn: 'The rafʿ damma is written in both, but only recited in careful speech.',
      noteTa: 'ரஃப் தம்மா எழுத்தில் இரண்டிலும் உள்ளது; கவனமான பேச்சில் மட்டுமே ஒலிக்கும்.',
    },
    tags: ['noun', 'everyday'],
  },
  {
    id: 'yaktubun',
    lemma: 'كَتَبَ',
    transliteration: 'kataba',
    verbForm: 1,
    root: {
      letters: ['ك', 'ت', 'ب'],
      display: 'ك-ت-ب',
      meaningEn: 'to write',
      meaningTa: 'எழுதுதல்',
    },
    wazn: 'faʿala',
    quranic: {
      ref: { surah: 2, ayah: 79 },
      token: 'يَكْتُبُونَ',
      ayahTextUthmani: 'فَوَيْلٌ لِّلَّذِينَ يَكْتُبُونَ ٱلْكِتَٰبَ بِأَيْدِيهِمْ',
      wordIndex: 4,
      irab: {
        case: 'rafʿ',
        sign: 'waw',
        role: 'fīl',
        explanationEn:
          'Present-tense verb with the wāw of the doers; it is marfūʿ, and its sign of rafʿ is the wāw.',
        explanationTa:
          'செய்பவர் வாவுடன் கூடிய நிகழ்கால வினை; ரஃப் நிலையில் உள்ளது, அதன் அடையாளம் வாவ்.',
        spokenBehavior: 'retained',
        spokenNoteEn: 'The -ūna ending is a long vowel, so speech keeps it: "yaktubūn".',
        spokenNoteTa: '-ஊன முடிவு நீண்ட உயிரொலி என்பதால் பேச்சிலும் நிலைக்கும்: "யக்துபூன்".',
      },
    },
    requiresAnchor: true,
    spoken: {
      msa: 'هُمْ يَكْتُبُونَ الدَّرْسَ',
      transliteration: 'hum yaktubūna d-dars',
      glossEn: 'They write the lesson.',
      glossTa: 'அவர்கள் பாடத்தை எழுதுகிறார்கள்.',
    },
    bridge: {
      relationship: 'ending-retained',
      noteEn: 'Only the subject changes between the two sentences; the marfūʿ wāw ending is identical.',
      noteTa: 'இரு வாக்கியங்களிலும் எழுவாய் மட்டுமே மாறுகிறது; ரஃப் வாவ் முடிவு ஒன்றே.',
    },
    tags: ['verb'],
  },
  {
    id: 'yalid',
    lemma: 'وَلَدَ',
    transliteration: 'walada',
    verbForm: 1,
    root: {
      letters: ['و', 'ل', 'د'],
      display: 'و-ل-د',
      meaningEn: 'to give birth, to beget',
      meaningTa: 'பெற்றெடுத்தல், பிறப்பித்தல்',
    },
    quranic: {
      ref: { surah: 112, ayah: 3 },
      token: 'يَلِدْ',
      ayahTextUthmani: 'لَمْ يَلِدْ وَلَمْ يُولَدْ',
      wordIndex: 2,
      irab: {
        case: 'jazm',
        sign: 'sukun',
        role: 'fīl',
        explanationEn: 'Negated by لَمْ, so the present-tense verb is majzūm with sukun.',
        explanationTa: 'لَمْ வினையை மறுப்பதால் நிகழ்கால வினை ஜஸ்ம் (சுகூன்) நிலையில் உள்ளது.',
        spokenBehavior: 'retained',
        spokenNoteEn: 'Jazm with sukun is intrinsic to the word and unchanged in speech.',
        spokenNoteTa: 'சுகூன் ஜஸ்ம் சொல்லின் இயல்பான அமைப்பு; பேச்சில் மாறாது.',
      },
    },
    requiresAnchor: true,
    spoken: {
      msa: 'وُلِدَ عَلِيٌّ فِي مِصْرَ',
      transliteration: 'wulida ʿaliyyun fī miṣr',
      glossEn: 'Ali was born in Egypt.',
      glossTa: 'அலி எகிப்தில் பிறந்தார்.',
    },
    bridge: {
      relationship: 'lexical-shift',
      noteEn: 'Speech prefers the past tense وُلِدَ for birth; يَلِدْ belongs to the Quranic phrasing.',
      noteTa: 'பிறப்பைக் குறிக்கப் பேச்சில் கடந்த காலம் وُلِدَ விரும்பப்படுகிறது; يَلِدْ குர்ஆன் நடைக்கு உரியது.',
    },
    tags: ['verb'],
  },
  {
    id: 'qalam',
    lemma: 'قَلَم',
    transliteration: 'qalam',
    root: {
      letters: ['ق', 'ل', 'م'],
      display: 'ق-ل-م',
      meaningEn: 'to cut/trim a reed; a pen',
      meaningTa: 'நாணலைச் செப்பமிடுதல்; பேனா',
    },
    wazn: 'faʿal',
    quranic: {
      ref: { surah: 96, ayah: 4 },
      token: 'ٱلْقَلَمِ',
      ayahTextUthmani: 'ٱلَّذِي عَلَّمَ بِٱلْقَلَمِ',
      wordIndex: 3,
      irab: {
        case: 'jarr',
        sign: 'kasra',
        role: 'majrūr',
        explanationEn: 'Governed by the preposition بِـ, so it is majrūr with kasra.',
        explanationTa: 'بِـ முன்னிடைச் சொல்லால் ஆளப்படுவதால் ஜர் (கஸ்ரா) பெறுகிறது.',
        spokenBehavior: 'neutralized',
        spokenNoteEn: 'Speech drops the kasra: "bil-qalam".',
        spokenNoteTa: 'பேச்சில் கஸ்ரா விழும்: "பில்-கலம்".',
      },
    },
    requiresAnchor: true,
    spoken: {
      msa: 'أَكْتُبُ بِالْقَلَمِ',
      transliteration: 'aktubu bil-qalam',
      glossEn: 'I write with the pen.',
      glossTa: 'நான் பேனாவால் எழுதுகிறேன்.',
    },
    bridge: {
      relationship: 'ending-dropped',
      noteEn: 'The phrase بِٱلْقَلَمِ is used in both registers — only the kasra is silent in speech.',
      noteTa: 'بِٱلْقَلَمِ தொடர் இரு நிலைகளிலும் பயன்படுகிறது — பேச்சில் கஸ்ரா மட்டும் ஒலிக்காது.',
    },
    tags: ['noun', 'everyday'],
  },
  {
    id: 'allama',
    lemma: 'عَلَّمَ',
    transliteration: 'ʿallama',
    verbForm: 2,
    root: {
      letters: ['ع', 'ل', 'م'],
      display: 'ع-ل-م',
      meaningEn: 'knowledge; to know',
      meaningTa: 'அறிவு; அறிதல்',
    },
    wazn: 'faʿʿala',
    quranic: {
      ref: { surah: 96, ayah: 5 },
      token: 'عَلَّمَ',
      ayahTextUthmani: 'عَلَّمَ ٱلْإِنسَٰنَ مَا لَمْ يَعْلَمْ',
      wordIndex: 1,
      irab: {
        case: 'mabnī',
        sign: 'none',
        role: 'fīl',
        explanationEn:
          'A past-tense verb is indeclinable (mabnī) on the fatha — iʿrāb case endings do not apply to it.',
        explanationTa:
          'கடந்த கால வினை ஃபத்ஹாவின் மேல் மப்னீ (மாறாதது) — இஃராப் கேஸ் முடிவுகள் வினைக்குப் பொருந்தாது.',
        spokenBehavior: 'retained',
        spokenNoteEn: 'Past-tense verbs keep their fixed fatha in speech.',
        spokenNoteTa: 'கடந்த கால வினைகள் பேச்சிலும் தம் ஃபத்ஹாவைத் தக்கவைக்கும்.',
      },
    },
    requiresAnchor: true,
    spoken: {
      msa: 'الْمُعَلِّمُ يُعَلِّمُ الطُّلَّابَ',
      transliteration: 'al-muʿallimu yuʿallimu ṭ-ṭullāb',
      glossEn: 'The teacher teaches the students.',
      glossTa: 'ஆசிரியர் மாணவர்களுக்குக் கற்பிக்கிறார்.',
    },
    bridge: {
      relationship: 'lexical-shift',
      noteEn:
        'Form II عَلَّمَ carries the causative sense (to make someone know). Speech reuses the same form as يُعَلِّمُ and مُعَلِّم.',
      noteTa:
        'வடிவம் II عَلَّمَ கற்பிக்கும் பொருளைத் தருகிறது. பேச்சில் அதே வடிவம் يُعَلِّمُ, مُعَلِّم என வருகிறது.',
    },
    tags: ['verb'],
  },
  {
    id: 'insan',
    lemma: 'إِنْسَان',
    transliteration: 'insān',
    root: {
      letters: ['أ', 'ن', 'س'],
      display: 'أ-ن-س',
      meaningEn: 'to be sociable; a human being',
      meaningTa: 'பழகுதல்; மனிதன்',
    },
    quranic: {
      ref: { surah: 96, ayah: 5 },
      token: 'ٱلْإِنسَٰنَ',
      ayahTextUthmani: 'عَلَّمَ ٱلْإِنسَٰنَ مَا لَمْ يَعْلَمْ',
      wordIndex: 2,
      irab: {
        case: 'nasb',
        sign: 'fatha',
        role: 'mafʿūl bihi',
        explanationEn: 'It is the direct object of عَلَّمَ, so it is manṣūb with fatha.',
        explanationTa: 'عَلَّمَ இன் நேரடிப் பொருள் என்பதால் நஸ்ப் (ஃபத்ஹா) பெறுகிறது.',
        spokenBehavior: 'neutralized',
        spokenNoteEn: 'Speech drops the fatha: "al-insān".',
        spokenNoteTa: 'பேச்சில் ஃபத்ஹா விழும்: "அல்-இன்சான்".',
      },
    },
    requiresAnchor: true,
    spoken: {
      msa: 'الْإِنْسَانُ يَحْتَاجُ إِلَى الْعِلْمِ',
      transliteration: 'al-insānu yaḥtāju ilā l-ʿilm',
      glossEn: 'A human being needs knowledge.',
      glossTa: 'மனிதனுக்கு அறிவு தேவை.',
    },
    bridge: {
      relationship: 'ending-dropped',
      noteEn: 'The same lemma appears as manṣūb in the ayah and marfūʿ in the spoken sentence — only the vowel moves.',
      noteTa: 'அதே சொல் குர்ஆனில் நஸ்ப் ஆகவும், பேச்சில் ரஃப் ஆகவும் வருகிறது — மாறுவது உயிரொலி மட்டுமே.',
    },
    tags: ['noun'],
  },

  // -------------------------------------------------------------------------
  // Worship & community
  // -------------------------------------------------------------------------
  {
    id: 'salah',
    lemma: 'صَلَاة',
    transliteration: 'ṣalāh',
    root: {
      letters: ['ص', 'ل', 'و'],
      display: 'ص-ل-و',
      meaningEn: 'prayer, ritual prayer, blessing',
      meaningTa: 'தொழுகை, வணக்கம்',
    },
    quranic: {
      ref: { surah: 2, ayah: 3 },
      token: 'ٱلصَّلَاةَ',
      ayahTextUthmani: 'ٱلَّذِينَ يُؤْمِنُونَ بِٱلْغَيْبِ وَيُقِيمُونَ ٱلصَّلَاةَ',
      wordIndex: 5,
      tajweedRule: 'madd_normal',
      irab: {
        case: 'nasb',
        sign: 'fatha',
        role: 'mafʿūl bihi',
        explanationEn: 'It is the object of يُقِيمُونَ (they establish), so it is manṣūb with fatha.',
        explanationTa: 'يُقِيمُونَ இன் பொருள் என்பதால் நஸ்ப் (ஃபத்ஹா) பெறுகிறது.',
        spokenBehavior: 'neutralized',
        spokenNoteEn: 'Spoken MSA drops the fatha: aṣ-ṣalātu → aṣ-ṣalāh.',
        spokenNoteTa: 'பேச்சு MSA வில் ஃபத்ஹா விழும்: அஸ்-ஸலாத்து → அஸ்-ஸலாஹ்.',
      },
    },
    requiresAnchor: true,
    spoken: {
      msa: 'الصَّلَاةُ نُورٌ',
      transliteration: 'aṣ-ṣalātu nūr',
      glossEn: 'Prayer is light.',
      glossTa: 'தொழுகை ஒளியாகும்.',
    },
    bridge: {
      relationship: 'ending-dropped',
      noteEn: 'The damma in speech is written but usually not sounded: "aṣ-ṣalāh nūr".',
      noteTa: 'பேச்சில் தம்மா எழுதப்பட்டாலும் பொதுவாக ஒலிக்காது: "அஸ்-ஸலாஹ் நூர்".',
    },
    tags: ['noun'],
  },
  {
    id: 'masjid',
    lemma: 'مَسْجِد',
    transliteration: 'masjid',
    root: {
      letters: ['س', 'ج', 'د'],
      display: 'س-ج-د',
      meaningEn: 'to prostrate; place of prostration',
      meaningTa: 'சிரம் தாழ்த்துதல்; பள்ளிவாசல்',
    },
    quranic: {
      ref: { surah: 72, ayah: 18 },
      token: 'ٱلْمَسَٰجِدَ',
      ayahTextUthmani: 'وَأَنَّ ٱلْمَسَٰجِدَ لِلَّهِ فَلَا تَدْعُوا مَعَ ٱللَّهِ أَحَدًا',
      wordIndex: 2,
      irab: {
        case: 'nasb',
        sign: 'fatha',
        role: 'ism inna',
        explanationEn: 'It is the ism of أَنَّ, so it is manṣūb with fatha. The ayah uses the plural.',
        explanationTa: 'أَنَّ இன் இஸ்ம் என்பதால் நஸ்ப் (ஃபத்ஹா) பெறுகிறது. இவ்வசனத்தில் பன்மை வடிவம் வருகிறது.',
        spokenBehavior: 'neutralized',
        spokenNoteEn: 'Speech drops the fatha: "al-masājid".',
        spokenNoteTa: 'பேச்சில் ஃபத்ஹா விழும்: "அல்-மஸாஜித்".',
      },
    },
    requiresAnchor: true,
    spoken: {
      msa: 'أُصَلِّي فِي الْمَسْجِدِ',
      transliteration: 'uṣallī fī l-masjid',
      glossEn: 'I pray in the mosque.',
      glossTa: 'நான் பள்ளிவாசலில் தொழுகிறேன்.',
    },
    bridge: {
      relationship: 'lexical-shift',
      noteEn: 'The Quranic plural ٱلْمَسَٰجِدَ becomes the everyday singular الْمَسْجِد, now majrūr after فِي.',
      noteTa: 'குர்ஆனின் பன்மை ٱلْمَسَٰجِدَ அன்றாட பேச்சில் ஒருமை الْمَسْجِد ஆகி, فِي க்குப் பின் ஜர் பெறுகிறது.',
    },
    tags: ['noun', 'everyday'],
  },
  {
    id: 'muminun',
    lemma: 'مُؤْمِن',
    transliteration: 'muʾmin',
    root: {
      letters: ['أ', 'م', 'ن'],
      display: 'أ-م-ن',
      meaningEn: 'safety, trust, faith',
      meaningTa: 'பாதுகாப்பு, நம்பிக்கை, ஈமான்',
    },
    wazn: 'mufʿil',
    quranic: {
      ref: { surah: 23, ayah: 1 },
      token: 'ٱلْمُؤْمِنُونَ',
      ayahTextUthmani: 'قَدْ أَفْلَحَ ٱلْمُؤْمِنُونَ',
      wordIndex: 3,
      irab: {
        case: 'rafʿ',
        sign: 'waw',
        role: 'fāʿil',
        explanationEn:
          'It is the doer (fāʿil) of أَفْلَحَ. As a sound masculine plural it is marfūʿ with waw.',
        explanationTa: 'أَفْلَحَ இன் செய்பவர் (ஃபாஇல்). ஒலி ஆண்பால் பன்மை என்பதால் வாவ் கொண்டு ரஃப் பெறுகிறது.',
        spokenBehavior: 'retained',
        spokenNoteEn: 'The -ūna ending is a long vowel and survives in speech.',
        spokenNoteTa: '-ஊன முடிவு நீண்ட உயிரொலி என்பதால் பேச்சில் நிலைக்கும்.',
      },
    },
    requiresAnchor: true,
    spoken: {
      msa: 'الْمُؤْمِنُونَ إِخْوَةٌ',
      transliteration: 'al-muʾminūna ikhwatun',
      glossEn: 'The believers are brothers.',
      glossTa: 'நம்பிக்கையாளர்கள் சகோதரர்கள்.',
    },
    bridge: {
      relationship: 'identical',
      noteEn: 'Same plural form in both registers — a clean example of a Quranic ending that speech keeps.',
      noteTa: 'இரு நிலைகளிலும் ஒரே பன்மை வடிவம் — குர்ஆனின் முடிவு பேச்சிலும் நிலைக்கும் சிறந்த எடுத்துக்காட்டு.',
    },
    tags: ['noun'],
  },

  // -------------------------------------------------------------------------
  // Virtues + hardship/ease pair (short ayat, rich iʿrāb)
  // -------------------------------------------------------------------------
  {
    id: 'sabr',
    lemma: 'صَبْر',
    transliteration: 'ṣabr',
    root: {
      letters: ['ص', 'ب', 'ر'],
      display: 'ص-ب-ر',
      meaningEn: 'to be patient, to bind oneself',
      meaningTa: 'பொறுமையாக இருத்தல்',
    },
    wazn: 'faʿl',
    quranic: {
      ref: { surah: 103, ayah: 3 },
      token: 'بِٱلصَّبْرِ',
      ayahTextUthmani:
        'إِلَّا ٱلَّذِينَ آمَنُوا۟ وَعَمِلُوا۟ ٱلصَّٰلِحَٰتِ وَتَوَاصَوْا۟ بِٱلْحَقِّ وَتَوَاصَوْا۟ بِٱلصَّبْرِ',
      wordIndex: 6,
      irab: {
        case: 'jarr',
        sign: 'kasra',
        role: 'majrūr',
        explanationEn: 'Governed by the preposition بِـ, so it is majrūr with kasra.',
        explanationTa: 'بِـ முன்னிடைச் சொல்லால் ஆளப்படுவதால் ஜர் (கஸ்ரா) பெறுகிறது.',
        spokenBehavior: 'neutralized',
        spokenNoteEn: 'Speech drops the kasra: "biṣ-ṣabr".',
        spokenNoteTa: 'பேச்சில் கஸ்ரா விழும்: "பிஸ்-ஸப்ர்".',
      },
    },
    requiresAnchor: true,
    spoken: {
      msa: 'أَدْرُسُ بِصَبْرٍ',
      transliteration: 'adrusu bi-ṣabrin',
      glossEn: 'I study with patience.',
      glossTa: 'நான் பொறுமையுடன் படிக்கிறேன்.',
    },
    bridge: {
      relationship: 'ending-dropped',
      noteEn: 'The jarr construction بِـ + noun is identical in both registers; only the kasra goes silent.',
      noteTa: 'بِـ + பெயர்ச்சொல் அமைப்பு இரண்டிலும் ஒன்றே; கஸ்ரா மட்டும் ஒலிக்காது.',
    },
    tags: ['noun'],
  },
  {
    id: 'haqq',
    lemma: 'حَقّ',
    transliteration: 'ḥaqq',
    root: {
      letters: ['ح', 'ق', 'ق'],
      display: 'ح-ق-ق',
      meaningEn: 'to be true, to be due; truth, right',
      meaningTa: 'உண்மையாதல்; உண்மை, உரிமை',
    },
    wazn: 'faʿl',
    quranic: {
      ref: { surah: 103, ayah: 3 },
      token: 'بِٱلْحَقِّ',
      ayahTextUthmani:
        'إِلَّا ٱلَّذِينَ آمَنُوا۟ وَعَمِلُوا۟ ٱلصَّٰلِحَٰتِ وَتَوَاصَوْا۟ بِٱلْحَقِّ وَتَوَاصَوْا۟ بِٱلصَّبْرِ',
      wordIndex: 4,
      irab: {
        case: 'jarr',
        sign: 'kasra',
        role: 'majrūr',
        explanationEn: 'Governed by the preposition بِـ, so it is majrūr with kasra.',
        explanationTa: 'بِـ முன்னிடைச் சொல்லால் ஆளப்படுவதால் ஜர் (கஸ்ரா) பெறுகிறது.',
        spokenBehavior: 'neutralized',
        spokenNoteEn: 'Speech drops the kasra: "bil-ḥaqq".',
        spokenNoteTa: 'பேச்சில் கஸ்ரா விழும்: "பில்-ஹக்".',
      },
    },
    requiresAnchor: true,
    spoken: {
      msa: 'هَذَا هُوَ الْحَقُّ',
      transliteration: 'hādhā huwa l-ḥaqq',
      glossEn: 'This is the truth.',
      glossTa: 'இதுவே உண்மை.',
    },
    bridge: {
      relationship: 'ending-dropped',
      noteEn: 'Same word, same meaning; the case vowel is what differs between recitation and speech.',
      noteTa: 'ஒரே சொல், ஒரே பொருள்; ஓதுதலுக்கும் பேச்சுக்கும் இடையே மாறுவது கேஸ் உயிரொலி மட்டுமே.',
    },
    tags: ['noun'],
  },
  {
    id: 'usr',
    lemma: 'عُسْر',
    transliteration: 'ʿusr',
    root: {
      letters: ['ع', 'س', 'ر'],
      display: 'ع-س-ر',
      meaningEn: 'hardship, difficulty',
      meaningTa: 'சிரமம், கஷ்டம்',
    },
    wazn: 'faʿl',
    quranic: {
      ref: { surah: 94, ayah: 5 },
      token: 'ٱلْعُسْرِ',
      ayahTextUthmani: 'فَإِنَّ مَعَ ٱلْعُسْرِ يُسْرًا',
      wordIndex: 3,
      irab: {
        case: 'jarr',
        sign: 'kasra',
        role: 'majrūr',
        explanationEn: 'It follows the adverb مَعَ and is majrūr with kasra.',
        explanationTa: 'மஅ (مع) என்னும் பெயரிடைக்குப் பின் வருவதால் ஜர் (கஸ்ரா) பெறுகிறது.',
        spokenBehavior: 'neutralized',
        spokenNoteEn: 'Speech drops the kasra: "maʿa l-ʿusr".',
        spokenNoteTa: 'பேச்சில் கஸ்ரா விழும்: "மஅல்-உஸ்ர்".',
      },
    },
    requiresAnchor: true,
    spoken: {
      msa: 'بَعْدَ الْعُسْرِ يَأْتِي الْيُسْرُ',
      transliteration: 'baʿda l-ʿusri yaʾtī l-yusr',
      glossEn: 'After hardship comes ease.',
      glossTa: 'சிரமத்திற்குப் பின் வசதி வரும்.',
    },
    bridge: {
      relationship: 'ending-dropped',
      noteEn: 'The ayah’s framing (with مَعَ) becomes بَعْدَ in everyday speech; the noun is unchanged.',
      noteTa: 'குர்ஆனின் அமைப்பு (مع உடன்) பேச்சில் بَعْدَ ஆகிறது; பெயர்ச்சொல் மாறவில்லை.',
    },
    tags: ['noun'],
  },
  {
    id: 'yusr',
    lemma: 'يُسْر',
    transliteration: 'yusr',
    root: {
      letters: ['ي', 'س', 'ر'],
      display: 'ي-س-ر',
      meaningEn: 'ease, facility, to be easy',
      meaningTa: 'வசதி, எளிமை',
    },
    wazn: 'faʿl',
    quranic: {
      ref: { surah: 94, ayah: 5 },
      token: 'يُسْرًا',
      ayahTextUthmani: 'فَإِنَّ مَعَ ٱلْعُسْرِ يُسْرًا',
      wordIndex: 4,
      irab: {
        case: 'nasb',
        sign: 'fatha',
        role: 'khabar inna',
        explanationEn:
          'It is the delayed khabar of إِنَّ, so it is manṣūb with tanwīn fatha (a nunation the reciter sounds).',
        explanationTa:
          'إِنَّ இன் பிந்திய கபர் என்பதால் நஸ்ப் (தன்வீன் ஃபத்ஹா) — ஓதும்போது இறுதியில் ஒரு மெல்லிய ஒலி சேரும்.',
        spokenBehavior: 'neutralized',
        spokenNoteEn: 'Spoken MSA drops the tanwīn fatha: "yusr".',
        spokenNoteTa: 'பேச்சு MSA வில் தன்வீன் ஃபத்ஹா விழும்: "யுஸ்ர்".',
      },
    },
    requiresAnchor: true,
    spoken: {
      msa: 'أُرِيدُ يُسْرًا فِي الْعَمَلِ',
      transliteration: 'urīdu yusran fī l-ʿamal',
      glossEn: 'I want ease in my work.',
      glossTa: 'என் வேலையில் வசதி வேண்டும்.',
    },
    bridge: {
      relationship: 'ending-dropped',
      noteEn: 'The tanwīn is a recitation feature; spoken MSA simply says the noun.',
      noteTa: 'தன்வீன் என்பது ஓதுதல் சிறப்பம்சம்; பேச்சு MSA வெறுமனே பெயர்ச்சொல்லைச் சொல்லும்.',
    },
    tags: ['noun'],
  },
  {
    id: 'ahad',
    lemma: 'أَحَد',
    transliteration: 'aḥad',
    root: {
      letters: ['أ', 'ح', 'د'],
      display: 'أ-ح-د',
      meaningEn: 'one, unique, anyone',
      meaningTa: 'ஒருவன், ஒரே, யாராவது',
    },
    wazn: 'faʿal',
    quranic: {
      ref: { surah: 112, ayah: 1 },
      token: 'أَحَدٌ',
      ayahTextUthmani: 'قُلْ هُوَ ٱللَّهُ أَحَدٌ',
      wordIndex: 3,
      irab: {
        case: 'rafʿ',
        sign: 'damma',
        role: 'khabar',
        explanationEn:
          'It is the second khabar of the nominal sentence هُوَ ٱللَّهُ, so it is marfūʿ with damma and tanwīn.',
        explanationTa:
          'هُوَ ٱللَّهُ என்னும் பெயர்ச்சொல் வாக்கியத்தின் இரண்டாம் கபர் என்பதால் ரஃப் (தம்மா + தன்வீன்) பெறுகிறது.',
        spokenBehavior: 'neutralized',
        spokenNoteEn: 'Speech drops the tanwīn: "aḥad".',
        spokenNoteTa: 'பேச்சில் தன்வீன் விழும்: "அஹத்".',
      },
    },
    requiresAnchor: true,
    spoken: {
      msa: 'لَا أَحَدَ فِي الْبَيْتِ',
      transliteration: 'lā aḥada fī l-bayt',
      glossEn: 'There is no one in the house.',
      glossTa: 'வீட்டில் யாரும் இல்லை.',
    },
    bridge: {
      relationship: 'case-changed',
      noteEn:
        'Same word, but in speech لَا governs it into naṣb (aḥada) instead of the ayah’s rafʿ (aḥadun).',
      noteTa:
        'ஒரே சொல்; ஆனால் பேச்சில் لَا அதை நஸ்ப் (அஹத) ஆக்குகிறது, குர்ஆனில் ரஃப் (அஹதுன்).',
    },
    tags: ['noun'],
  },

  // -------------------------------------------------------------------------
  // Everyday MSA vocabulary — no Quranic occurrence, built from anchored roots
  // -------------------------------------------------------------------------
  {
    id: 'mualim',
    lemma: 'مُعَلِّم',
    transliteration: 'muʿallim',
    root: {
      letters: ['ع', 'ل', 'م'],
      display: 'ع-ل-م',
      meaningEn: 'knowledge; to know',
      meaningTa: 'அறிவு; அறிதல்',
    },
    wazn: 'mufaʿʿil',
    verbForm: 2,
    requiresAnchor: false,
    derivedFromEntryId: 'allama',
    spoken: {
      msa: 'هَذَا مُعَلِّمٌ مَاهِرٌ',
      transliteration: 'hādhā muʿallimun māhir',
      glossEn: 'This is a skilled teacher.',
      glossTa: 'இவர் ஒரு திறமையான ஆசிரியர்.',
    },
    bridge: {
      relationship: 'root-derived',
      noteEn: 'No Quranic occurrence of the participle; it is the form II active participle of عَلَّمَ (مُفَعِّل).',
      noteTa: 'இந்தப் பெயரெச்சம் குர்ஆனில் இல்லை; இது عَلَّمَ இன் வடிவம் II செய்பெயரெச்சம் (مُفَعِّل).',
    },
    tags: ['participle', 'everyday'],
  },
  {
    id: 'talib',
    lemma: 'طَالِب',
    transliteration: 'ṭālib',
    root: {
      letters: ['ط', 'ل', 'ب'],
      display: 'ط-ل-ب',
      meaningEn: 'to seek, to request',
      meaningTa: 'தேடுதல், கேட்டல்',
    },
    wazn: 'fāʿil',
    requiresAnchor: false,
    spoken: {
      msa: 'أَنَا طَالِبٌ فِي الْجَامِعَةِ',
      transliteration: 'anā ṭālibun fī l-jāmiʿa',
      glossEn: 'I am a student at the university.',
      glossTa: 'நான் பல்கலைக்கழகத்தில் மாணவன்.',
    },
    bridge: {
      relationship: 'root-derived',
      noteEn: 'Active participle (فَاعِل) of طَلَبَ — "the one who seeks", i.e. a student.',
      noteTa: 'طَلَبَ இன் செய்பெயரெச்சம் (فَاعِل) — "தேடுபவன்", அதாவது மாணவன்.',
    },
    tags: ['participle', 'everyday'],
  },
  {
    id: 'madrasa',
    lemma: 'مَدْرَسَة',
    transliteration: 'madrasa',
    root: {
      letters: ['د', 'ر', 'س'],
      display: 'د-ر-س',
      meaningEn: 'to study, to teach',
      meaningTa: 'படித்தல், கற்பித்தல்',
    },
    wazn: 'mafʿala',
    requiresAnchor: false,
    spoken: {
      msa: 'أَذْهَبُ إِلَى الْمَدْرَسَةِ كُلَّ صَبَاحٍ',
      transliteration: 'adhhabu ilā l-madrasati kulla ṣabāḥ',
      glossEn: 'I go to school every morning.',
      glossTa: 'நான் தினமும் காலையில் பள்ளிக்குச் செல்கிறேன்.',
    },
    bridge: {
      relationship: 'root-derived',
      noteEn: 'Noun of place (مَفْعَلَة) from دَرَسَ — literally "the place of studying".',
      noteTa: 'دَرَسَ இலிருந்து இடப்பெயர் (مَفْعَلَة) — "படிக்கும் இடம்".',
    },
    tags: ['noun', 'everyday'],
  },
  {
    id: 'suq',
    lemma: 'سُوق',
    transliteration: 'sūq',
    root: {
      letters: ['س', 'و', 'ق'],
      display: 'س-و-ق',
      meaningEn: 'to drive; a market',
      meaningTa: 'வழிநடத்துதல்; சந்தை',
    },
    wazn: 'faʿl',
    requiresAnchor: false,
    spoken: {
      msa: 'أَشْتَرِي الْفَاكِهَةَ مِنَ السُّوقِ',
      transliteration: 'ashtarī l-fākihatan mina s-sūq',
      glossEn: 'I buy fruit from the market.',
      glossTa: 'நான் சந்தையில் பழம் வாங்குகிறேன்.',
    },
    bridge: {
      relationship: 'root-derived',
      noteEn: 'Majrūr after مِنَ in the spoken sentence — the same jarr mechanic the classical anchors teach.',
      noteTa: 'பேச்சு வாக்கியத்தில் مِنَ க்குப் பின் ஜர் — குர்ஆன் எடுத்துக்காட்டுகள் கற்பிக்கும் அதே ஜர் விதி.',
    },
    tags: ['noun', 'everyday'],
  },
];

const ENTRY_BY_ID = new Map(ARABIC_LEXICON.map((entry) => [entry.id, entry]));

export function getArabicEntry(id: string): ArabicEntry | undefined {
  return ENTRY_BY_ID.get(id);
}

export function getArabicEntries(ids: readonly string[]): ArabicEntry[] {
  return ids.map((id) => ENTRY_BY_ID.get(id)).filter((entry): entry is ArabicEntry => Boolean(entry));
}

/** Sorted for stable UI listings. */
export const ARABIC_LEXICON_IDS: readonly string[] = [...ARABIC_LEXICON]
  .map((entry) => entry.id)
  .sort();
