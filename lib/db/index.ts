import Dexie, { type Table } from 'dexie';
import { GameSessionResult } from './schemas/streak-schema';

export type SrsState = 'new' | 'learning' | 'familiar' | 'memorized' | 'review' | 'weak' | 'mastered';
export type HifzTier = 'sabaq' | 'sabqi' | 'manzil';

export interface UserProfile {
  id: string;
  level: number;
  totalXp: number;
  streakCount: number;
  lastActiveDate: string; // YYYY-MM-DD
  dailyGoalMinutes: number;
  preferredTranslationLang: 'en' | 'ta' | 'both';
  tajweedColorsEnabled: boolean;
  arabicFontSize: number;
  reciterId: string;
  unlockedLevels?: number[]; // Explicitly unlocked level tiers (e.g. from Tajweed Placement Exam)
  tajweedCertifiedLevel?: number; // Advanced Tajweed certification tier (e.g. 10)
  placementExamPassedAt?: string;
  // Gemini Live AI Tajweed Teacher Preferences
  aiVoiceId?: 'Kore' | 'Zephyr' | 'Puck' | 'Fenrir' | 'Charon' | string;
  aiTeacherPersona?: 'gentle' | 'balanced' | 'strict';
  aiFeedbackLanguage?: 'both' | 'en' | 'ta';
  aiSpeechRate?: number;
}

export interface VerseProgress {
  verseKey: string; // e.g. "1:1"
  surah: number;
  ayah: number;
  state: SrsState;
  interval: number; // in days
  easeFactor: number; // default 2.5
  dueDate: string; // ISO string
  lapses: number;
  repetitions: number;
  lastReviewedAt?: string;
  hifzTier?: HifzTier; // 'sabaq' | 'sabqi' | 'manzil'
}

export interface WordProgress {
  wordKey: string; // e.g. "1:1:2"
  surah: number;
  ayah: number;
  wordIndex: number;
  arabic: string;
  memorized: boolean;
  mistakesCount: number;
  lastSeenAt: string;
}

export interface LessonHistory {
  lessonId: string;
  score: number; // 0 - 100
  xpEarned: number;
  completedAt: string;
}

export interface AIProviderRecord {
  id: string;
  name: string;
  type: 'gemini' | 'openai' | 'anthropic' | 'groq' | 'mistral' | 'openrouter' | 'custom';
  baseUrl?: string;
  encryptedKey?: string;
  models: string[];
  selectedModel: string;
  isDefault: boolean;
}

export interface AIConversationRecord {
  id: string;
  title: string;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    createdAt?: string;
    toolInvocations?: unknown[];
  }>;
  updatedAt: string;
}

export interface QuranCacheRecord {
  key: string; // e.g. "surah:1" or "ayah:1:1"
  data: unknown;
  cachedAt: number;
}

export class NurulQuranDatabase extends Dexie {
  userProfile!: Table<UserProfile, string>;
  verseProgress!: Table<VerseProgress, string>;
  wordProgress!: Table<WordProgress, string>;
  lessonHistory!: Table<LessonHistory, string>;
  aiProviders!: Table<AIProviderRecord, string>;
  aiConversations!: Table<AIConversationRecord, string>;
  quranCache!: Table<QuranCacheRecord, string>;
  gameSessions!: Table<GameSessionResult, string>;

  constructor() {
    super('NurulQuranDB');
    this.version(1).stores({
      userProfile: 'id',
      verseProgress: 'verseKey, surah, state, dueDate',
      wordProgress: 'wordKey, surah, ayah, memorized',
      lessonHistory: 'lessonId, completedAt',
      aiProviders: 'id, type, isDefault',
      aiConversations: 'id, updatedAt',
      quranCache: 'key, cachedAt',
    });
    this.version(2).stores({
      gameSessions: 'sessionId, gameId, surahNumber, timestamp',
    });
  }
}

export const db = new NurulQuranDatabase();

/**
 * Initializes the default user profile and default AI provider if not present.
 */
export async function initializeDatabase(): Promise<UserProfile> {
  if (typeof window === 'undefined') {
    return {
      id: 'default_user',
      level: 1,
      totalXp: 0,
      streakCount: 1,
      lastActiveDate: new Date().toISOString().split('T')[0],
      dailyGoalMinutes: 15,
      preferredTranslationLang: 'both',
      tajweedColorsEnabled: true,
      arabicFontSize: 28,
      reciterId: 'ar.alafasy',
      aiVoiceId: 'Kore',
      aiTeacherPersona: 'balanced',
      aiFeedbackLanguage: 'both',
      aiSpeechRate: 1.0,
    };
  }

  let profile = await db.userProfile.get('default_user');
  const today = new Date().toISOString().split('T')[0];

  if (!profile) {
    profile = {
      id: 'default_user',
      level: 1,
      totalXp: 0,
      streakCount: 1,
      lastActiveDate: today,
      dailyGoalMinutes: 15,
      preferredTranslationLang: 'both',
      tajweedColorsEnabled: true,
      arabicFontSize: 28,
      reciterId: 'ar.alafasy',
      aiVoiceId: 'Kore',
      aiTeacherPersona: 'balanced',
      aiFeedbackLanguage: 'both',
      aiSpeechRate: 1.0,
    };
    await db.userProfile.put(profile);
  } else {
    // Ensure AI voice preferences exist on existing profiles
    if (!profile.aiVoiceId) {
      profile.aiVoiceId = 'Kore';
      profile.aiTeacherPersona = 'balanced';
      profile.aiFeedbackLanguage = 'both';
      profile.aiSpeechRate = 1.0;
      await db.userProfile.update('default_user', {
        aiVoiceId: 'Kore',
        aiTeacherPersona: 'balanced',
        aiFeedbackLanguage: 'both',
        aiSpeechRate: 1.0,
      });
    }
    if (profile.totalXp === 50) {
      // Migration: reset legacy default seeded 50 XP so new accounts start at 0 XP / 0%
      const historyCount = await db.lessonHistory.count();
      if (historyCount === 0) {
        profile.totalXp = 0;
        await db.userProfile.update('default_user', { totalXp: 0 });
      }
    }
  }

  // Ensure default Gemini provider exists
  const existingProvider = await db.aiProviders.get('gemini-default');
  if (!existingProvider) {
    await db.aiProviders.put({
      id: 'gemini-default',
      name: 'Google Gemini (Server Default)',
      type: 'gemini',
      models: ['gemini-3.8-flash'],
      selectedModel: 'gemini-3.8-flash',
      isDefault: true,
    });
  } else if (existingProvider.selectedModel === 'gemini-2.5-flash') {
    await db.aiProviders.update('gemini-default', {
      models: ['gemini-3.8-flash'],
      selectedModel: 'gemini-3.8-flash',
    });
  }

  return profile;
}

export async function exportDatabaseJson(): Promise<string> {
  const profile = await db.userProfile.toArray();
  const verseProgress = await db.verseProgress.toArray();
  const wordProgress = await db.wordProgress.toArray();
  const lessonHistory = await db.lessonHistory.toArray();
  const aiProviders = await db.aiProviders.toArray();
  const aiConversations = await db.aiConversations.toArray();

  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      userProfile: profile,
      verseProgress,
      wordProgress,
      lessonHistory,
      aiProviders,
      aiConversations,
    },
    null,
    2
  );
}

export async function importDatabaseJson(jsonString: string): Promise<{ success: boolean; error?: string }> {
  try {
    const data = JSON.parse(jsonString);
    if (!data || typeof data !== 'object') {
      return { success: false, error: 'Invalid JSON backup format' };
    }

    await db.transaction('rw', [db.userProfile, db.verseProgress, db.wordProgress, db.lessonHistory, db.aiProviders, db.aiConversations], async () => {
      if (Array.isArray(data.userProfile)) {
        await db.userProfile.clear();
        await db.userProfile.bulkPut(data.userProfile);
      }
      if (Array.isArray(data.verseProgress)) {
        await db.verseProgress.clear();
        await db.verseProgress.bulkPut(data.verseProgress);
      }
      if (Array.isArray(data.wordProgress)) {
        await db.wordProgress.clear();
        await db.wordProgress.bulkPut(data.wordProgress);
      }
      if (Array.isArray(data.lessonHistory)) {
        await db.lessonHistory.clear();
        await db.lessonHistory.bulkPut(data.lessonHistory);
      }
      if (Array.isArray(data.aiProviders)) {
        await db.aiProviders.clear();
        await db.aiProviders.bulkPut(data.aiProviders);
      }
      if (Array.isArray(data.aiConversations)) {
        await db.aiConversations.clear();
        await db.aiConversations.bulkPut(data.aiConversations);
      }
    });

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

export async function resetDatabase(): Promise<void> {
  await db.transaction('rw', [db.userProfile, db.verseProgress, db.wordProgress, db.lessonHistory, db.aiProviders, db.aiConversations], async () => {
    await db.userProfile.clear();
    await db.verseProgress.clear();
    await db.wordProgress.clear();
    await db.lessonHistory.clear();
    await db.aiProviders.clear();
    await db.aiConversations.clear();
  });
  await initializeDatabase();
}
