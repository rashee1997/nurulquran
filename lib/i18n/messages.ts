export type Locale = 'en' | 'ta';

/**
 * Message catalog for the app's chrome — navigation, dashboard headings and settings
 * section titles — not scripture or lesson content, which already carry their own
 * English/Tamil fields end to end. Keys are dotted paths; `t()` falls back to the key
 * itself (or an explicit English default) when a translation is missing, so a missing
 * key degrades to readable English rather than blank chrome.
 */
export const MESSAGES: Record<Locale, Record<string, string>> = {
  en: {
    'nav.category.core_study': 'Core Study',
    'nav.category.memorization': 'Memorization',
    'nav.category.preferences': 'Preferences',

    'nav.item.dashboard.label': 'Dashboard',
    'nav.item.dashboard.desc': 'Progress, streak and recent activity',
    'nav.item.quran.label': 'Quran Reader',
    'nav.item.quran.desc': 'Uthmani text with audio, morphology and translations',
    'nav.item.curriculum.label': 'Curriculum',
    'nav.item.curriculum.desc': 'Tajweed and Arabic lessons, Levels 1–10',
    'nav.item.arabic_lab.label': 'Arabic Lab',
    'nav.item.arabic_lab.desc': 'Quranic and spoken Arabic, writing and iʿrāb',
    'nav.item.tafsir.label': 'Tafseer Lessons',
    'nav.item.tafsir.desc': 'Bilingual exegesis with a live voice storyteller',
    'nav.item.library.label': 'Library',
    'nav.item.library.desc': 'Bookmarks, collections and your notes',
    'nav.item.games.label': 'Practice Games',
    'nav.item.games.desc': 'Word order, similar-verse and recall drills',
    'nav.item.memorize.label': 'Memorization Modes',
    'nav.item.memorize.desc': 'Ten recall drills linked to spaced repetition',
    'nav.item.planner.label': 'Hifz Planner',
    'nav.item.planner.desc': 'Daily portions and memorization targets',
    'nav.item.review.label': 'Review Queue',
    'nav.item.review.desc': 'Today’s spaced-repetition review queue',
    'nav.item.progress.label': 'Progress & Goals',
    'nav.item.progress.desc': 'Heatmap, goals, weak spots and reminders',
    'nav.item.settings.label': 'Settings',
    'nav.item.settings.desc': 'Audio, language, theme and data backup',
    'nav.search': 'Search',
    'nav.study_assistant': 'Study Assistant',

    'dashboard.hero.title': 'Bismillah, Welcome to NurulQuran',
    'dashboard.hero.subtitle':
      'Study Arabic reading, Tajweed and memorization with spaced repetition, plus English and Tamil translations.',
    'dashboard.streak.active': 'Active Streak',
    'dashboard.streak.day': 'Day Streak',
    'dashboard.streak.at_risk': 'Not practised yet today — your streak is at risk.',
    'dashboard.streak.freeze_available': 'freeze token(s) protect a missed day.',
    'dashboard.streak.practice_today': 'Practise today to keep your streak.',
    'dashboard.continue_reading': 'Continue reading',
    'dashboard.start_lesson': 'Start Lesson',
    'dashboard.resume_lesson': 'Resume Lesson',
    'dashboard.games.title': 'Practice Games',
    'dashboard.games.open': 'Open games',
    'dashboard.modes.title': 'Ten Memorization Modes',
    'dashboard.modes.explore_all': 'Explore All',
    'dashboard.surahs.title': 'Daily Surahs & Reader',
    'dashboard.surahs.all': 'All 114 Surahs',

    'settings.title': 'Settings',
    'settings.language.title': 'Interface language',
    'settings.language.desc': 'Language for navigation, dashboard and settings chrome — scripture translations are unaffected.',
    'settings.language.english': 'English',
    'settings.language.tamil': 'தமிழ்',
  },
  ta: {
    'nav.category.core_study': 'முதன்மைப் படிப்பு',
    'nav.category.memorization': 'மனனம்',
    'nav.category.preferences': 'விருப்பத்தேர்வுகள்',

    'nav.item.dashboard.label': 'முகப்புப் பலகை',
    'nav.item.dashboard.desc': 'முன்னேற்றம், தொடர்ச்சி மற்றும் சமீபத்திய செயல்பாடு',
    'nav.item.quran.label': 'குர்ஆன் வாசிப்பான்',
    'nav.item.quran.desc': 'ஒலி, சொல் அமைப்பு மற்றும் மொழிபெயர்ப்புகளுடன் உஸ்மானி வாசகம்',
    'nav.item.curriculum.label': 'பாடத்திட்டம்',
    'nav.item.curriculum.desc': 'தஜ்வீத் மற்றும் அரபு பாடங்கள், நிலைகள் 1–10',
    'nav.item.arabic_lab.label': 'அரபு ஆய்வகம்',
    'nav.item.arabic_lab.desc': 'குர்ஆனிய மற்றும் பேச்சு அரபு, எழுத்து மற்றும் இஃராப்',
    'nav.item.tafsir.label': 'தஃப்ஸீர் பாடங்கள்',
    'nav.item.tafsir.desc': 'நேரடி குரல் கதைசொல்லியுடன் இருமொழி விளக்கம்',
    'nav.item.library.label': 'நூலகம்',
    'nav.item.library.desc': 'புத்தகக்குறிகள், தொகுப்புகள் மற்றும் உங்கள் குறிப்புகள்',
    'nav.item.games.label': 'பயிற்சி விளையாட்டுகள்',
    'nav.item.games.desc': 'சொல் வரிசை, ஒத்த வசன வேறுபாடு மற்றும் நினைவுத் திறன் பயிற்சிகள்',
    'nav.item.memorize.label': 'மனனப் பயிற்சிகள்',
    'nav.item.memorize.desc': 'இடைவெளி மறுநினைவுடன் இணைந்த பத்து பயிற்சிகள்',
    'nav.item.planner.label': 'ஹிஃப்ழ் திட்டமிடல்',
    'nav.item.planner.desc': 'தினசரி பகுதிகள் மற்றும் மனனக் குறிக்கோள்கள்',
    'nav.item.review.label': 'மறுபார்வை வரிசை',
    'nav.item.review.desc': 'இன்றைய இடைவெளி-மறுநினைவு மறுபார்வை வரிசை',
    'nav.item.progress.label': 'முன்னேற்றம் & இலக்குகள்',
    'nav.item.progress.desc': 'செயல்பாடு வரைபடம், இலக்குகள், பலவீனங்கள் மற்றும் நினைவூட்டல்கள்',
    'nav.item.settings.label': 'அமைப்புகள்',
    'nav.item.settings.desc': 'ஒலி, மொழி, தோற்றம் மற்றும் தரவு காப்புப்பிரதி',
    'nav.search': 'தேடு',
    'nav.study_assistant': 'படிப்பு உதவியாளர்',

    'dashboard.hero.title': 'بِسْمِ اللَّهِ، நூருல் குர்ஆனுக்கு வரவேற்கிறோம்',
    'dashboard.hero.subtitle':
      'இடைவெளி மறுநினைவுடன் அரபு வாசிப்பு, தஜ்வீத் மற்றும் மனனம் கற்கவும், ஆங்கிலம் மற்றும் தமிழ் மொழிபெயர்ப்புகளுடன்.',
    'dashboard.streak.active': 'தொடரும் தொடர்ச்சி',
    'dashboard.streak.day': 'நாள் தொடர்ச்சி',
    'dashboard.streak.at_risk': 'இன்று இன்னும் பயிற்சி செய்யவில்லை — உங்கள் தொடர்ச்சி ஆபத்தில் உள்ளது.',
    'dashboard.streak.freeze_available': 'உறைவு டோக்கன்(கள்) தவறவிட்ட நாளைக் காக்கும்.',
    'dashboard.streak.practice_today': 'உங்கள் தொடர்ச்சியைத் தக்கவைக்க இன்று பயிற்சி செய்யுங்கள்.',
    'dashboard.continue_reading': 'வாசிப்பைத் தொடரவும்',
    'dashboard.start_lesson': 'பாடத்தைத் தொடங்கு',
    'dashboard.resume_lesson': 'பாடத்தைத் தொடரவும்',
    'dashboard.games.title': 'பயிற்சி விளையாட்டுகள்',
    'dashboard.games.open': 'விளையாட்டுகளைத் திற',
    'dashboard.modes.title': 'பத்து மனனப் பயிற்சிகள்',
    'dashboard.modes.explore_all': 'அனைத்தையும் காண்க',
    'dashboard.surahs.title': 'தினசரி ஸூராக்கள் & வாசிப்பான்',
    'dashboard.surahs.all': 'அனைத்து 114 ஸூராக்கள்',

    'settings.title': 'அமைப்புகள்',
    'settings.language.title': 'இடைமுக மொழி',
    'settings.language.desc': 'வழிசெலுத்தல், முகப்புப் பலகை மற்றும் அமைப்புகளுக்கான மொழி — வேத மொழிபெயர்ப்புகள் பாதிக்கப்படாது.',
    'settings.language.english': 'English',
    'settings.language.tamil': 'தமிழ்',
  },
};

export function translate(locale: Locale, key: string, fallback?: string): string {
  return MESSAGES[locale]?.[key] ?? fallback ?? MESSAGES.en[key] ?? key;
}
