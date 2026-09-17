export interface GameSessionResult {
  sessionId: string;
  gameId: 'ayah-assembly' | 'mutashabihat-radar' | 'memory-matrix';
  gameTitle: string;
  surahNumber: number;
  surahName: string;
  ayahNumber?: number;
  accuracy: number; // 0 - 100%
  score: number;
  timeSeconds: number;
  comboMax: number;
  xpEarned: number;
  timestamp: number; // Date.now()
}

export interface DayStreakActivity {
  date: string; // YYYY-MM-DD
  count: number; // total games/activities played
  xpEarned: number;
  accuracyAvg: number;
}

export interface UserHifzStreak {
  id: string; // 'current'
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string; // YYYY-MM-DD
  freezeTokens: number;
  totalGamesPlayed: number;
  totalScore: number;
  history: Record<string, DayStreakActivity>; // keyed by YYYY-MM-DD
}
