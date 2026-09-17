import { localDayDelta, localDayKey, shiftLocalDayKey } from '../time/day';

export interface LevelInfo {
  level: number;
  title: string;
  titleArabic: string;
  totalXp: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progressPercent: number;
}

const LEVEL_TITLES: Array<{ title: string; titleArabic: string }> = [
  { title: 'Seeker of Knowledge', titleArabic: 'طالب العلم' },
  { title: 'Reader of Letters', titleArabic: 'قارئ الحروف' },
  { title: 'Diligent Reciter', titleArabic: 'المرتل' },
  { title: 'Tajweed Apprentice', titleArabic: 'طالب التجويد' },
  { title: 'Guardian of Verses', titleArabic: 'حافظ الآيات' },
  { title: 'Hifz Companion', titleArabic: 'رفيق الحفظ' },
  { title: 'Steadfast Memorizer', titleArabic: 'الحافظ المتقن' },
  { title: 'Beacon of Light', titleArabic: 'نور القرآن' },
  { title: 'Master of Melody', titleArabic: 'صاحب الترتيل' },
  { title: 'Quranic Scholar', titleArabic: 'عالم القرآن' },
];

export const LEVEL_REQUIRED_XP: Record<number, number> = {
  1: 0,     // Level 1: Alphabet & Noorani Qaida (Always Open)
  2: 120,   // Level 2: Letter Forms & Joining
  3: 250,   // Level 3: Short & Long Vowels (Harakat, Tanween, Madd Tabee'i)
  4: 450,   // Level 4: Noon Sakinah & Tanween Rules (Izhar, Idgham, Iqlab, Ikhfa)
  5: 700,   // Level 5: Meem Sakinah & Ghunnah Rules
  6: 1000,  // Level 6: Rules of Raa & Laam al-Jalalah (Tafkheem & Tarqeeq)
  7: 1350,  // Level 7: Ahkam al-Madd (Madd Asli, Muttasil, Munfasil, Lazim)
  8: 1750,  // Level 8: Ahkam al-Qalqalah & 17 Makharij
  9: 2200,  // Level 9: Sifaat al-Huroof & Waqf/Stopping Rules
  10: 2700, // Level 10: Master Recitation & Juz 30 Hifz
};

export interface LevelUnlockStatus {
  isUnlocked: boolean;
  unlocked: boolean;
  requiredXp: number;
  currentXp: number;
  remainingXp: number;
  percentToUnlock: number;
  isDirectlyCertified: boolean;
  unlockedByCertification: boolean;
}

export function checkLevelUnlockStatus(
  targetLevel: number,
  userProfileOrXp?: { totalXp?: number; unlockedLevels?: number[]; tajweedCertifiedLevel?: number } | number | null,
  unlockedLevelsParam?: number[],
  tajweedCertifiedLevelParam?: number
): LevelUnlockStatus {
  const userTotalXp = typeof userProfileOrXp === 'number'
    ? userProfileOrXp
    : (userProfileOrXp?.totalXp ?? 0);

  const unlockedLevels = typeof userProfileOrXp === 'object' && userProfileOrXp !== null
    ? (userProfileOrXp.unlockedLevels ?? unlockedLevelsParam)
    : unlockedLevelsParam;

  const tajweedCertifiedLevel = typeof userProfileOrXp === 'object' && userProfileOrXp !== null
    ? (userProfileOrXp.tajweedCertifiedLevel ?? tajweedCertifiedLevelParam)
    : tajweedCertifiedLevelParam;

  const requiredXp = LEVEL_REQUIRED_XP[targetLevel] ?? 0;

  // Directly certified via Gemini Live Tajweed Placement Exam
  const isDirectlyCertified =
    (tajweedCertifiedLevel !== undefined && tajweedCertifiedLevel >= targetLevel) ||
    Boolean(unlockedLevels?.includes(targetLevel));

  if (targetLevel <= 1 || isDirectlyCertified) {
    return {
      isUnlocked: true,
      unlocked: true,
      requiredXp,
      currentXp: userTotalXp,
      remainingXp: 0,
      percentToUnlock: 100,
      isDirectlyCertified: Boolean(isDirectlyCertified && targetLevel > 1),
      unlockedByCertification: Boolean(isDirectlyCertified && targetLevel > 1),
    };
  }

  const isUnlocked = userTotalXp >= requiredXp;
  const remainingXp = Math.max(0, requiredXp - userTotalXp);
  const percentToUnlock = Math.min(100, Math.round((userTotalXp / Math.max(1, requiredXp)) * 100));

  return {
    isUnlocked,
    unlocked: isUnlocked,
    requiredXp,
    currentXp: userTotalXp,
    remainingXp,
    percentToUnlock,
    isDirectlyCertified: false,
    unlockedByCertification: false,
  };
}

/**
 * Calculates user level based on deterministic XP thresholds
 * Formula: XP needed for level L = 100 * (L ^ 1.5)
 */
export function calculateLevel(totalXp: number): LevelInfo {
  let level = 1;
  let prevThreshold = 0;
  let nextThreshold = 150;

  while (totalXp >= nextThreshold && level < 50) {
    level += 1;
    prevThreshold = nextThreshold;
    nextThreshold = Math.round(150 * Math.pow(level, 1.4));
  }

  const currentLevelXp = Math.max(0, totalXp - prevThreshold);
  const xpNeededForNext = Math.max(1, nextThreshold - prevThreshold);
  const progressPercent = Math.min(100, Math.round((currentLevelXp / xpNeededForNext) * 100));

  const titleMeta = LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)];

  return {
    level,
    title: titleMeta.title,
    titleArabic: titleMeta.titleArabic,
    totalXp,
    currentLevelXp,
    nextLevelXp: xpNeededForNext,
    progressPercent,
  };
}

/**
 * Evaluates streak status against the learner's LOCAL calendar day.
 *
 * `lastActiveDate` is a `YYYY-MM-DD` local day key. Comparing it to a UTC-derived
 * date (the previous implementation) rolls the day over at 05:30 for UTC+05:30
 * learners, so an evening session could reset a streak that was never broken.
 */
export function evaluateStreak(lastActiveDate: string, currentStreak: number): {
  newStreak: number;
  isNewDay: boolean;
  status: 'maintained' | 'incremented' | 'reset';
} {
  const today = localDayKey();
  const elapsedDays = localDayDelta(lastActiveDate, today);

  if (elapsedDays <= 0) {
    // Same local day (or a future-dated record from a clock change).
    return { newStreak: currentStreak, isNewDay: false, status: 'maintained' };
  }

  if (elapsedDays === 1) {
    return { newStreak: currentStreak + 1, isNewDay: true, status: 'incremented' };
  }

  // Streak broken: more than one local day missed.
  return { newStreak: 1, isNewDay: true, status: 'reset' };
}

/** Yesterday's local day key, useful for grace-period checks. */
export function yesterdayKey(from: Date = new Date()): string {
  return shiftLocalDayKey(localDayKey(from), -1);
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'learning' | 'memorization' | 'streak' | 'tajweed';
  xpReward: number;
  unlocked: boolean;
  progress: number; // 0 to 100
}

export function getAchievementsList(stats: {
  totalXp: number;
  streakCount: number;
  memorizedCount: number;
  completedLessonsCount: number;
}): Achievement[] {
  return [
    {
      id: 'first_step',
      name: 'Bismillah',
      description: 'Complete your first Arabic or Quran lesson',
      icon: 'Sparkles',
      category: 'learning',
      xpReward: 50,
      unlocked: stats.completedLessonsCount >= 1,
      progress: Math.min(100, (stats.completedLessonsCount / 1) * 100),
    },
    {
      id: 'alphabet_master',
      name: 'Letter Craftsman',
      description: 'Complete all Arabic alphabet foundation lessons',
      icon: 'BookOpen',
      category: 'learning',
      xpReward: 150,
      unlocked: stats.completedLessonsCount >= 3,
      progress: Math.min(100, (stats.completedLessonsCount / 3) * 100),
    },
    {
      id: 'first_ayah',
      name: 'Hafiz Initiate',
      description: 'Memorize your first Ayah into the spaced repetition system',
      icon: 'Heart',
      category: 'memorization',
      xpReward: 100,
      unlocked: stats.memorizedCount >= 1,
      progress: Math.min(100, (stats.memorizedCount / 1) * 100),
    },
    {
      id: 'ten_ayahs',
      name: 'Treasury of Light',
      description: 'Memorize 10 verses with Good or Perfect retention',
      icon: 'Award',
      category: 'memorization',
      xpReward: 300,
      unlocked: stats.memorizedCount >= 10,
      progress: Math.min(100, (stats.memorizedCount / 10) * 100),
    },
    {
      id: 'streak_3',
      name: 'Steadfast Devotion',
      description: 'Maintain a 3-day continuous learning streak',
      icon: 'Flame',
      category: 'streak',
      xpReward: 120,
      unlocked: stats.streakCount >= 3,
      progress: Math.min(100, (stats.streakCount / 3) * 100),
    },
    {
      id: 'streak_7',
      name: 'Golden Week',
      description: 'Maintain a 7-day continuous learning streak',
      icon: 'Crown',
      category: 'streak',
      xpReward: 350,
      unlocked: stats.streakCount >= 7,
      progress: Math.min(100, (stats.streakCount / 7) * 100),
    },
  ];
}
