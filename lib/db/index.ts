import Dexie, { type Table } from 'dexie';
import { z } from 'zod';
import { GameSessionResult } from './schemas/streak-schema';
import type { ArabicLabProgress } from '../arabic/types';
import { localDayKey } from '../time/day';
import { DEFAULT_GEMINI_TEXT_MODEL } from '../ai/models';

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
  /**
   * Reader display preferences.
   *
   * These three are the single source of truth for how the reader renders scripture. They
   * previously existed here *and* as session-only state inside `QuranReader`, with different
   * defaults, so a learner who enlarged the Arabic text lost the setting on the next
   * navigation. `dailyGoalMinutes` was removed: it was seeded, validated on backup import and
   * read by nothing at all, and a preference that silently does nothing is worse than no
   * preference.
   */
  preferredTranslationLang: 'en' | 'ta' | 'both';
  tajweedColorsEnabled: boolean;
  /** Overlay recent recitation mistakes on the Mushaf as weak-spot underlines; default off. */
  mistakeHighlightsEnabled?: boolean;
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
  /** Last ayah the reader was scrolled to, so the dashboard can resume it. */
  readingPosition?: ReadingPosition;
  /** Chosen memorisation pace in ayahs per day (Hifz planner). */
  hifzPace?: number;
  /** Surah the planner allocates the next Sabaq from, walking the Mushaf in order. */
  hifzTargetSurah?: number;
  /** Streak-freeze tokens: one missed day is forgiven per token. Earned weekly. */
  streakFreezes?: number;
  /** Local day key on which the last freeze token was granted. */
  lastFreezeGrantedAt?: string;
  /** Preferred hour (0-23, local) for the daily practice reminder; undefined = off. */
  reminderHour?: number;
  /** Last surah and mode used on the memorisation page, restored on the next visit. */
  lastMemorizeSurah?: number;
  lastMemorizeMode?: string;
  /** Interface language for chrome (navigation, dashboard, settings). */
  uiLocale?: 'en' | 'ta';
}

export interface ReadingPosition {
  surah: number;
  ayah: number;
  updatedAt: string;
}

/** A saved ayah, optionally filed under a collection (folder). */
export interface BookmarkRecord {
  verseKey: string;
  surah: number;
  ayah: number;
  /** Collection name; empty string means the default "Saved" list. */
  collection: string;
  createdAt: string;
}

/** A personal note on one ayah. */
export interface NoteRecord {
  verseKey: string;
  surah: number;
  ayah: number;
  text: string;
  updatedAt: string;
}

/**
 * One row of the local activity ledger.
 *
 * Every success metric the product tracks (continue-card clicks, reviews graded, offline
 * hits) is derived from these rows. They never leave the device unless the learner exports
 * them, which is why the ledger is a table and not a network call.
 */
export interface ActivityEvent {
  id?: number;
  name: string;
  at: string;
  /** Local day key, indexed for heatmaps and streak reconstruction. */
  day: string;
  props?: Record<string, string | number | boolean>;
}

export type RecitationMistakeKind = 'skipped' | 'substituted' | 'inserted';

/** A word-level recitation error detected in hidden-verse mode. */
export interface RecitationMistakeRecord {
  id?: number;
  verseKey: string;
  surah: number;
  ayah: number;
  wordIndex: number;
  kind: RecitationMistakeKind;
  expected: string;
  heard?: string;
  at: string;
}

/**
 * One saved recitation attempt: the learner's own recorded audio plus the mistake count it
 * produced. Audio stays on this device (it is deliberately excluded from backups and
 * included in reset), is bounded by eviction, and powers the "replay vs the Qari" loop.
 */
export interface RecitationSessionRecord {
  id: string;
  verseKey: string;
  surah: number;
  ayah: number;
  /** Raw 16 kHz mono PCM16, base64-encoded (no container header). */
  audioBase64: string;
  audioMimeType: string;
  mistakeCount: number;
  accuracy: number;
  createdAt: string;
}

export type HifzGoalKind = 'memorize' | 'review' | 'read';
export type HifzGoalCadence = 'daily' | 'weekly';

/**
 * A learner-defined target, e.g. "review Al-Kahf every Friday".
 *
 * `deadline` turns the goal into a dated one ("finish Juz' 'Amma by 2027-03-01", a local
 * `YYYY-MM-DD` key): progress is then also measured against the linear pace needed to hit
 * the date, not just the raw target count.
 */
export interface HifzGoalRecord {
  id: string;
  kind: HifzGoalKind;
  cadence: HifzGoalCadence;
  /** 0 = Sunday … 6 = Saturday; only for weekly goals. */
  weekday?: number;
  surah?: number;
  /** Target count of ayahs for the period. */
  targetAyahs: number;
  /** Local day key (YYYY-MM-DD) the goal must be complete by; absent for open-ended goals. */
  deadline?: string;
  createdAt: string;
  archived?: boolean;
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
  /** FSRS memory stability in days (time until recall probability drops to 90%). */
  stability?: number;
  /** FSRS difficulty, 1 (easy) – 10 (hard). */
  difficulty?: number;
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

/**
 * Cached Tafseer exegesis.
 *
 * Addressed by `tafsir:<slug>:<surah>` because the CDN serves a whole chapter in one
 * response, so caching per-ayah would issue one request per verse for identical data.
 * Like `quranCache`, this is public upstream content that can always be re-fetched, so it
 * is deliberately excluded from backups.
 */
export interface TafsirCacheRecord {
  key: string; // e.g. "tafsir:tamil-mokhtasar:112"
  data: unknown;
  cachedAt: number;
}

export type TafsirProgressState = 'visited' | 'reflected' | 'completed';

/** Learner-facing progress for one ayah of a Tafsir lesson. */
export interface TafsirProgressRecord {
  /** `<surah>:<ayah>` — mirrors the `verseKey` convention used by the SRS tables. */
  verseKey: string;
  surah: number;
  ayah: number;
  state: TafsirProgressState;
  /** How many reflections the learner has submitted for this ayah. */
  reflectionCount: number;
  lastReflectionAt?: string;
  updatedAt: string;
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
  tafsirCache!: Table<TafsirCacheRecord, string>;
  tafsirProgress!: Table<TafsirProgressRecord, string>;
  bookmarks!: Table<BookmarkRecord, string>;
  notes!: Table<NoteRecord, string>;
  events!: Table<ActivityEvent, number>;
  recitationMistakes!: Table<RecitationMistakeRecord, number>;
  hifzGoals!: Table<HifzGoalRecord, string>;
  recitationSessions!: Table<RecitationSessionRecord, string>;

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
    // Tafseer lesson module. Additive: every earlier table carries forward untouched.
    this.version(4).stores({
      tafsirCache: 'key, cachedAt',
      tafsirProgress: 'verseKey, surah, state',
    });
    // Bookmarks, notes, the activity ledger, recitation mistakes and goals. Additive.
    this.version(5).stores({
      bookmarks: 'verseKey, surah, collection, createdAt',
      notes: 'verseKey, surah, updatedAt',
      events: '++id, name, day, at',
      recitationMistakes: '++id, verseKey, surah, at',
      hifzGoals: 'id, kind, archived',
    });
    // Saved recitation attempts for the replay loop. Additive: earlier tables untouched.
    this.version(6).stores({
      recitationSessions: 'id, verseKey, createdAt',
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
      models: [DEFAULT_GEMINI_TEXT_MODEL],
      selectedModel: DEFAULT_GEMINI_TEXT_MODEL,
      isDefault: true,
    });
  } else if (existingProvider.selectedModel !== DEFAULT_GEMINI_TEXT_MODEL) {
    // Re-point the built-in provider at whatever the single source of truth currently says.
    // Comparing against one hardcoded legacy id (as this did) only repaired the one stale value
    // its author happened to know about; any other drift stayed broken. This row is app-managed
    // and not user-editable, so normalising it is always safe.
    await db.aiProviders.update(SERVER_DEFAULT_PROVIDER_ID, {
      models: [DEFAULT_GEMINI_TEXT_MODEL],
      selectedModel: DEFAULT_GEMINI_TEXT_MODEL,
    });
  }

  // Re-read rather than returning the object read before the corrective updates above, which
  // could hand callers pre-migration values (e.g. the legacy seeded 50 XP).
  return (await db.userProfile.get('default_user')) ?? profile;
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
export const BACKUP_FORMAT_VERSION = 5;

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
  preferredTranslationLang: z.enum(['en', 'ta', 'both']),
  tajweedColorsEnabled: z.boolean(),
  mistakeHighlightsEnabled: z.boolean().optional(),
  arabicFontSize: z.number().min(1),
  reciterId: z.string().min(1),
  unlockedLevels: z.array(z.number().int().min(1)).optional(),
  tajweedCertifiedLevel: z.number().int().min(1).optional(),
  placementExamPassedAt: z.string().optional(),
  aiVoiceId: z.string().optional(),
  aiTeacherPersona: z.enum(['gentle', 'balanced', 'strict']).optional(),
  aiFeedbackLanguage: feedbackLanguageSchema.optional(),
  aiSpeechRate: z.number().min(0.5).max(2).optional(),
  readingPosition: z
    .object({ surah: surahNumberSchema, ayah: ayahNumberSchema, updatedAt: z.string().min(1) })
    .optional(),
  hifzPace: z.number().int().min(1).max(100).optional(),
  hifzTargetSurah: surahNumberSchema.optional(),
  streakFreezes: z.number().int().min(0).max(10).optional(),
  lastFreezeGrantedAt: z.string().optional(),
  reminderHour: z.number().int().min(0).max(23).optional(),
  lastMemorizeSurah: surahNumberSchema.optional(),
  lastMemorizeMode: z.string().max(4).optional(),
  uiLocale: z.enum(['en', 'ta']).optional(),
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
  stability: z.number().min(0).optional(),
  difficulty: z.number().min(1).max(10).optional(),
});

const bookmarkRowSchema = z.object({
  verseKey: z.string().min(1),
  surah: surahNumberSchema,
  ayah: ayahNumberSchema,
  collection: z.string().max(80),
  createdAt: z.string().min(1),
});

const noteRowSchema = z.object({
  verseKey: z.string().min(1),
  surah: surahNumberSchema,
  ayah: ayahNumberSchema,
  text: z.string().max(20_000),
  updatedAt: z.string().min(1),
});

const eventRowSchema = z.object({
  id: z.number().int().optional(),
  name: z.string().min(1).max(80),
  at: z.string().min(1),
  day: z.string().min(1),
  props: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

const recitationMistakeRowSchema = z.object({
  id: z.number().int().optional(),
  verseKey: z.string().min(1),
  surah: surahNumberSchema,
  ayah: ayahNumberSchema,
  wordIndex: z.number().int().min(0),
  kind: z.enum(['skipped', 'substituted', 'inserted']),
  expected: z.string(),
  heard: z.string().optional(),
  at: z.string().min(1),
});

const hifzGoalRowSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['memorize', 'review', 'read']),
  cadence: z.enum(['daily', 'weekly']),
  weekday: z.number().int().min(0).max(6).optional(),
  surah: surahNumberSchema.optional(),
  targetAyahs: z.number().int().min(1).max(6236),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  createdAt: z.string().min(1),
  archived: z.boolean().optional(),
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

const tafsirProgressRowSchema = z.object({
  verseKey: z.string().min(1),
  surah: surahNumberSchema,
  ayah: ayahNumberSchema,
  state: z.enum(['visited', 'reflected', 'completed']),
  reflectionCount: z.number().int().min(0).max(10_000),
  lastReflectionAt: z.string().optional(),
  updatedAt: z.string().min(1),
});

const backupEnvelopeSchema = z.object({
  // v1 files predate the game-session, Arabic Lab and Tafsir tables; still importable.
  version: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  exportedAt: z.string().optional(),
  userProfile: z.array(userProfileRowSchema).optional(),
  verseProgress: z.array(verseProgressRowSchema).optional(),
  wordProgress: z.array(wordProgressRowSchema).optional(),
  lessonHistory: z.array(lessonHistoryRowSchema).optional(),
  aiProviders: z.array(aiProviderRowSchema).optional(),
  aiConversations: z.array(aiConversationRowSchema).optional(),
  gameSessions: z.array(gameSessionRowSchema).optional(),
  arabicLabProgress: z.array(arabicLabProgressRowSchema).optional(),
  tafsirProgress: z.array(tafsirProgressRowSchema).optional(),
  bookmarks: z.array(bookmarkRowSchema).optional(),
  notes: z.array(noteRowSchema).optional(),
  events: z.array(eventRowSchema).optional(),
  recitationMistakes: z.array(recitationMistakeRowSchema).optional(),
  hifzGoals: z.array(hifzGoalRowSchema).optional(),
});

/**
 * Every table that holds learner data, in injection order.
 *
 * `recitationSessions` holds device-local voice recordings: reset clears it, but a backup
 * import never touches it because backups do not carry audio.
 */
const PROGRESS_TABLES = [
  db.userProfile,
  db.verseProgress,
  db.wordProgress,
  db.lessonHistory,
  db.aiProviders,
  db.aiConversations,
  db.gameSessions,
  db.arabicLabProgress,
  db.tafsirProgress,
  db.bookmarks,
  db.notes,
  db.events,
  db.recitationMistakes,
  db.hifzGoals,
  db.recitationSessions,
] as const;

/**
 * Serializes every table that holds learner data.
 *
 * Game sessions and Arabic Lab progress were missing from the export, so restoring a
 * backup silently dropped streak history and the Arabic Lab track.
 *
 * `recitationSessions` is deliberately NOT exported: it holds the learner's own voice
 * recordings, which a shareable backup file must not carry. Resetting progress clears it.
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
    tafsirProgress,
    bookmarks,
    notes,
    events,
    recitationMistakes,
    hifzGoals,
  ] = await Promise.all([
    db.userProfile.toArray(),
    db.verseProgress.toArray(),
    db.wordProgress.toArray(),
    db.lessonHistory.toArray(),
    db.aiProviders.toArray(),
    db.aiConversations.toArray(),
    db.gameSessions.toArray(),
    db.arabicLabProgress.toArray(),
    db.tafsirProgress.toArray(),
    db.bookmarks.toArray(),
    db.notes.toArray(),
    db.events.toArray(),
    db.recitationMistakes.toArray(),
    db.hifzGoals.toArray(),
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
      tafsirProgress,
      bookmarks,
      notes,
      events,
      recitationMistakes,
      hifzGoals,
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

export type BackupEnvelope = z.infer<typeof backupEnvelopeSchema>;

/**
 * Validates a backup file's shape without writing anything — the read-only half of
 * `importDatabaseJson`, used wherever a backup needs to be inspected rather than
 * restored (e.g. the teacher/halaqa share viewer).
 */
export function parseBackupJson(jsonString: string): { success: true; data: BackupEnvelope } | { success: false; error: string } {
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

  return { success: true, data: result.data };
}

export async function importDatabaseJson(jsonString: string): Promise<DatabaseImportResult> {
  const parsed = parseBackupJson(jsonString);
  if (!parsed.success) {
    return { success: false, error: parsed.error };
  }

  const backup = parsed.data;

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
      if (backup.tafsirProgress) {
        await db.tafsirProgress.clear();
        await db.tafsirProgress.bulkPut(backup.tafsirProgress);
      }
      if (backup.bookmarks) {
        await db.bookmarks.clear();
        await db.bookmarks.bulkPut(backup.bookmarks);
      }
      if (backup.notes) {
        await db.notes.clear();
        await db.notes.bulkPut(backup.notes);
      }
      if (backup.events) {
        await db.events.clear();
        await db.events.bulkPut(backup.events);
      }
      if (backup.recitationMistakes) {
        await db.recitationMistakes.clear();
        await db.recitationMistakes.bulkPut(backup.recitationMistakes);
      }
      if (backup.hifzGoals) {
        await db.hifzGoals.clear();
        await db.hifzGoals.bulkPut(backup.hifzGoals);
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
      [backup.tafsirProgress?.length, 'Tafsir lesson record'],
      [backup.bookmarks?.length, 'bookmark'],
      [backup.notes?.length, 'note'],
      [backup.hifzGoals?.length, 'goal'],
      [backup.recitationMistakes?.length, 'recitation mistake'],
      [backup.events?.length, 'activity event'],
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
 * Saved recitation audio is cleared with everything else.
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
