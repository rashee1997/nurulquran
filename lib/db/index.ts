import Dexie, { type Table } from 'dexie';
import { z } from 'zod';
import { GameSessionResult } from './schemas/streak-schema';
import type { ArabicLabProgress } from '../arabic/types';
import { localDayKey } from '../time/day';

export type SrsState = 'new' | 'learning' | 'familiar' | 'memorized' | 'review' | 'weak' | 'mastered';
export type HifzTier = 'sabaq' | 'sabqi' | 'manzil';

/**
 * Row id of the built-in server-backed Gemini provider.
 * Shared so the settings screen cannot offer to delete a provider that always exists.
 */
export const SERVER_DEFAULT_PROVIDER_ID = 'gemini-default';

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
  arabicLabProgress!: Table<ArabicLabProgress, string>;

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
    // Arabic Lab (dual-track Quranic + spoken Arabic). Additive: v1/v2 tables untouched.
    this.version(3).stores({
      arabicLabProgress: 'id',
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
      lastActiveDate: localDayKey(),
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
  const today = localDayKey();

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
  const existingProvider = await db.aiProviders.get(SERVER_DEFAULT_PROVIDER_ID);
  if (!existingProvider) {
    await db.aiProviders.put({
      id: SERVER_DEFAULT_PROVIDER_ID,
      name: 'Google Gemini (Server Default)',
      type: 'gemini',
      models: ['gemini-3.8-flash'],
      selectedModel: 'gemini-3.8-flash',
      isDefault: true,
    });
  } else if (existingProvider.selectedModel === 'gemini-2.5-flash') {
    await db.aiProviders.update(SERVER_DEFAULT_PROVIDER_ID, {
      models: ['gemini-3.8-flash'],
      selectedModel: 'gemini-3.8-flash',
    });
  }

  return profile;
}

/* -------------------------------------------------------------------------- */
/* Backup (export / import)                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Two things are deliberately NOT in a backup:
 *  - `quranCache` — public, immutable scripture text that is re-fetched for free;
 *    including it would multiply the file size by the whole cached Mushaf.
 * A backup file is untrusted input (it is a file the user picked from disk), so every
 * row is parsed against the same field rules the app uses. The previous version
 * called `JSON.parse` and `bulkPut` with the raw `any` payload, which let a malformed
 * or hand-edited file write rows that later crashed the reader, the SRS engine and
 * the streak engine on typed field access.
 */
export const BACKUP_FORMAT_VERSION = 2;

const srsStateSchema = z.enum(['new', 'learning', 'familiar', 'memorized', 'review', 'weak', 'mastered']);
const hifzTierSchema = z.enum(['sabaq', 'sabqi', 'manzil']);
const feedbackLanguageSchema = z.enum(['both', 'en', 'ta']);
const surahNumberSchema = z.number().int().min(1).max(114);
const ayahNumberSchema = z.number().int().min(1).max(286);

const userProfileRowSchema = z.object({
  id: z.string().min(1),
  level: z.number().int().min(1),
  totalXp: z.number().int().min(0),
  streakCount: z.number().int().min(0),
  lastActiveDate: z.string().min(1),
  dailyGoalMinutes: z.number().min(1),
  preferredTranslationLang: z.enum(['en', 'ta', 'both']),
  tajweedColorsEnabled: z.boolean(),
  arabicFontSize: z.number().min(1),
  reciterId: z.string().min(1),
  unlockedLevels: z.array(z.number().int().min(1)).optional(),
  tajweedCertifiedLevel: z.number().int().min(1).optional(),
  placementExamPassedAt: z.string().optional(),
  aiVoiceId: z.string().optional(),
  aiTeacherPersona: z.enum(['gentle', 'balanced', 'strict']).optional(),
  aiFeedbackLanguage: feedbackLanguageSchema.optional(),
  aiSpeechRate: z.number().min(0.5).max(2).optional(),
});

const verseProgressRowSchema = z.object({
  verseKey: z.string().min(1),
  surah: surahNumberSchema,
  ayah: ayahNumberSchema,
  state: srsStateSchema,
  interval: z.number().min(0),
  easeFactor: z.number().min(1),
  dueDate: z.string().min(1),
  lapses: z.number().int().min(0),
  repetitions: z.number().int().min(0),
  lastReviewedAt: z.string().optional(),
  hifzTier: hifzTierSchema.optional(),
});

const wordProgressRowSchema = z.object({
  wordKey: z.string().min(1),
  surah: surahNumberSchema,
  ayah: ayahNumberSchema,
  wordIndex: z.number().int().min(1),
  arabic: z.string(),
  memorized: z.boolean(),
  mistakesCount: z.number().int().min(0),
  lastSeenAt: z.string().min(1),
});

const lessonHistoryRowSchema = z.object({
  lessonId: z.string().min(1),
  score: z.number().min(0).max(100),
  xpEarned: z.number().int().min(0),
  completedAt: z.string().min(1),
});

const aiProviderRowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['gemini', 'openai', 'anthropic', 'groq', 'mistral', 'openrouter', 'custom']),
  baseUrl: z.string().optional(),
  encryptedKey: z.string().optional(),
  models: z.array(z.string()),
  selectedModel: z.string(),
  isDefault: z.boolean(),
});

const aiConversationRowSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  messages: z.array(
    z.object({
      id: z.string().min(1),
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string(),
      createdAt: z.string().optional(),
      toolInvocations: z.array(z.unknown()).optional(),
    })
  ),
  updatedAt: z.string().min(1),
});

const gameSessionRowSchema = z.object({
  sessionId: z.string().min(1),
  gameId: z.enum(['ayah-assembly', 'mutashabihat-radar', 'memory-matrix']),
  gameTitle: z.string().min(1),
  surahNumber: surahNumberSchema,
  surahName: z.string().min(1),
  ayahNumber: ayahNumberSchema.optional(),
  accuracy: z.number().min(0).max(100),
  score: z.number().int().min(0),
  timeSeconds: z.number().min(0),
  comboMax: z.number().int().min(0),
  xpEarned: z.number().int().min(0),
  timestamp: z.number().int().nonnegative(),
});

const arabicLabProgressRowSchema = z.object({
  id: z.string().min(1),
  completedLessonIds: z.array(z.string()),
  masteredEntryIds: z.array(z.string()),
  strokeScores: z.record(z.string(), z.number().min(0).max(100)),
  updatedAt: z.string().min(1),
});

const backupEnvelopeSchema = z.object({
  // v1 files predate the game-session and Arabic Lab tables; they are still importable.
  version: z.union([z.literal(1), z.literal(2)]),
  exportedAt: z.string().optional(),
  userProfile: z.array(userProfileRowSchema).optional(),
  verseProgress: z.array(verseProgressRowSchema).optional(),
  wordProgress: z.array(wordProgressRowSchema).optional(),
  lessonHistory: z.array(lessonHistoryRowSchema).optional(),
  aiProviders: z.array(aiProviderRowSchema).optional(),
  aiConversations: z.array(aiConversationRowSchema).optional(),
  gameSessions: z.array(gameSessionRowSchema).optional(),
  arabicLabProgress: z.array(arabicLabProgressRowSchema).optional(),
});

/** Every table that holds learner data, in injection order. */
const PROGRESS_TABLES = [
  db.userProfile,
  db.verseProgress,
  db.wordProgress,
  db.lessonHistory,
  db.aiProviders,
  db.aiConversations,
  db.gameSessions,
  db.arabicLabProgress,
] as const;

/**
 * Serializes every table that holds learner data.
 *
 * Game sessions and Arabic Lab progress were missing from the export, so restoring a
 * backup silently dropped streak history and the Arabic Lab track.
 */
export async function exportDatabaseJson(): Promise<string> {
  const [
    userProfile,
    verseProgress,
    wordProgress,
    lessonHistory,
    aiProviders,
    aiConversations,
    gameSessions,
    arabicLabProgress,
  ] = await Promise.all([
    db.userProfile.toArray(),
    db.verseProgress.toArray(),
    db.wordProgress.toArray(),
    db.lessonHistory.toArray(),
    db.aiProviders.toArray(),
    db.aiConversations.toArray(),
    db.gameSessions.toArray(),
    db.arabicLabProgress.toArray(),
  ]);

  return JSON.stringify(
    {
      version: BACKUP_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      userProfile,
      verseProgress,
      wordProgress,
      lessonHistory,
      aiProviders,
      aiConversations,
      gameSessions,
      arabicLabProgress,
    },
    null,
    2
  );
}

/**
 * Restores a backup file.
 *
 * The payload is validated before anything is written, and the writes run in one
 * transaction, so an invalid file leaves the existing data exactly as it was. Tables
 * absent from the file are left untouched rather than cleared.
 */
export interface DatabaseImportResult {
  success: boolean;
  error?: string;
  /** Plain-language inventory of what a successful restore wrote. */
  summary?: string;
}

export async function importDatabaseJson(jsonString: string): Promise<DatabaseImportResult> {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(jsonString);
  } catch {
    return { success: false, error: 'That file is not valid JSON.' };
  }

  const result = backupEnvelopeSchema.safeParse(parsedJson);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.join('.') || 'file';
    return {
      success: false,
      error: `unexpected value at “${path}” (${issue?.message ?? 'invalid backup'}).`,
    };
  }

  const backup = result.data;

  try {
    await db.transaction('rw', PROGRESS_TABLES, async () => {
      if (backup.userProfile) {
        await db.userProfile.clear();
        await db.userProfile.bulkPut(backup.userProfile);
      }
      if (backup.verseProgress) {
        await db.verseProgress.clear();
        await db.verseProgress.bulkPut(backup.verseProgress);
      }
      if (backup.wordProgress) {
        await db.wordProgress.clear();
        await db.wordProgress.bulkPut(backup.wordProgress);
      }
      if (backup.lessonHistory) {
        await db.lessonHistory.clear();
        await db.lessonHistory.bulkPut(backup.lessonHistory);
      }
      if (backup.aiProviders) {
        await db.aiProviders.clear();
        await db.aiProviders.bulkPut(backup.aiProviders);
      }
      if (backup.aiConversations) {
        await db.aiConversations.clear();
        await db.aiConversations.bulkPut(backup.aiConversations);
      }
      if (backup.gameSessions) {
        await db.gameSessions.clear();
        await db.gameSessions.bulkPut(backup.gameSessions);
      }
      if (backup.arabicLabProgress) {
        await db.arabicLabProgress.clear();
        await db.arabicLabProgress.bulkPut(backup.arabicLabProgress);
      }
    });

    // A v1 file may not carry a profile; make sure the app still has a usable one.
    await initializeDatabase();

    const restoredParts = [
      [backup.verseProgress?.length, 'review item'],
      [backup.wordProgress?.length, 'word'],
      [backup.lessonHistory?.length, 'lesson result'],
      [backup.gameSessions?.length, 'game session'],
      [backup.arabicLabProgress?.length, 'Arabic Lab record'],
      [backup.aiConversations?.length, 'conversation'],
      [backup.aiProviders?.length, 'provider'],
    ]
      .filter((entry): entry is [number, string] => typeof entry[0] === 'number' && entry[0] > 0)
      .map(([count, label]) => `${count} ${label}${count === 1 ? '' : 's'}`);

    return {
      success: true,
      summary: restoredParts.length > 0 ? `Restored ${restoredParts.join(', ')}.` : 'Backup restored.',
    };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'unknown storage error' };
  }
}

/**
 * Clears every table that holds learner data and re-seeds the defaults.
 *
 * The game sessions, Arabic Lab progress and the streak records derived from them were
 * previously left behind, so "Reset progress" kept showing the old streak and XP.
 * The Quran text cache is intentionally preserved: it is public, immutable scripture,
 * not learner data.
 */
export async function resetDatabase(): Promise<void> {
  await db.transaction('rw', PROGRESS_TABLES, async () => {
    for (const table of PROGRESS_TABLES) {
      await table.clear();
    }
  });
  await initializeDatabase();
}
