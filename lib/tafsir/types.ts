/**
 * Tafseer lesson module — model layer.
 *
 * Every payload that crosses a boundary (CDN, route handler, model output) is described
 * by a zod schema here, so nothing untrusted is ever cast into a domain type. The shapes
 * below were derived from live probes of the spa5k/tafsir_api CDN, which serves two
 * *different* sūrah payload layouts — see `surahTafsirPayloadSchema`.
 */

import { z } from 'zod';

/* -------------------------------------------------------------------------- */
/* Edition index (`tafsir/editions.json`)                                     */
/* -------------------------------------------------------------------------- */

/**
 * One row of the CDN's global edition index.
 *
 * Fields are optional where the live index is inconsistent: the published file omits
 * `source` on some rows, and only `slug` / `id` / `language_name` are guaranteed.
 */
export const tafsirEditionSchema = z.object({
  id: z.number().int().positive(),
  slug: z.string().min(1),
  name: z.string().min(1),
  author_name: z.string().optional(),
  language_name: z.string().min(1),
  source: z.string().optional(),
});

export type TafsirEdition = z.infer<typeof tafsirEditionSchema>;

/**
 * The index is large (122 editions, 28 KB) and changes only when the upstream repo is
 * regenerated, so a malformed row is skipped rather than failing the whole module.
 */
export const tafsirEditionIndexSchema = z.array(tafsirEditionSchema);

/* -------------------------------------------------------------------------- */
/* Ayah payloads                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A single ayah's exegesis.
 *
 * `surah` / `ayah` are optional on purpose: not every edition echoes them back, and the
 * caller already knows which verse it asked for. The client fills them in from the
 * request rather than trusting the body, which also means a CDN response that describes
 * a *different* verse cannot masquerade as the requested one.
 */
export const tafsirAyahRecordSchema = z.object({
  surah: z.number().int().min(1).max(114).optional(),
  ayah: z.number().int().min(1).max(286).optional(),
  text: z.string(),
});

export type TafsirAyahRecord = z.infer<typeof tafsirAyahRecordSchema>;

/**
 * The sūrah batch endpoint returns one of two shapes depending on the edition:
 *   - a top-level array  → tamil-mokhtasar, en-tafsir-al-mukhtasar, en-tafisr-ibn-kathir
 *   - `{ "ayahs": [...] }` → en-al-jalalayn
 * Both are accepted and normalized to `TafsirAyahRecord[]`.
 */
export const surahTafsirPayloadSchema = z.union([
  z.array(tafsirAyahRecordSchema),
  z.object({ ayahs: z.array(tafsirAyahRecordSchema) }),
]);

export type SurahTafsirPayload = z.infer<typeof surahTafsirPayloadSchema>;

/** Where an exegesis string came from, so the UI can label it honestly. */
export type TafsirProvenance = 'network' | 'cache' | 'unavailable';

export type TafsirLanguage = 'en' | 'ta';

/** One language's exegesis for one ayah. */
export interface TafsirEntry {
  language: TafsirLanguage;
  /** Empty when `provenance` is `unavailable`. */
  text: string;
  editionSlug: string;
  editionName: string;
  /** Editorially stated for the learner to see; never implied. */
  editionAuthor: string;
  provenance: TafsirProvenance;
}

/**
 * Occasion of revelation.
 *
 * `null` is the common case, not an edge case: the Asbab al-Nuzul edition only carries
 * verses that have a recorded occasion, and it 404s entirely for sūrahs 108, 112, 113
 * and 114. The storyteller prompt treats `null` as "do not narrate a historical cause".
 */
export interface TafsirAsbabEntry {
  text: string;
  editionSlug: string;
  editionName: string;
}

/** A fully assembled lesson segment for one ayah. */
export interface TafsirLessonSegment {
  surah: number;
  ayah: number;
  versesCount: number;
  surahNameSimple: string;
  surahNameArabic: string;
  surahNameEnglish: string;
  /** Uthmani script from the app's verified Quran provider — never from this module. */
  textUthmani: string;
  textSimple: string;
  translationEn: string;
  translationTa: string;
  audioUrl: string;
  /** Verse text provenance, surfaced so a cached/offline verse is never mistaken for live. */
  verseProvenance: 'network' | 'verified-offline';
  tafsir: Record<TafsirLanguage, TafsirEntry>;
  asbab: TafsirAsbabEntry | null;
}

/** How far along a lesson load is, so the viewport can reserve space and avoid CLS. */
export type TafsirLoadState = 'idle' | 'loading' | 'ready' | 'partial' | 'error';

export interface TafsirLessonError {
  message: string;
  /** True when the CDN could not be reached at all (retryable) rather than missing data. */
  retryable: boolean;
}

/*
 * The two IndexedDB row shapes this module persists (`TafsirCacheRecord` and
 * `TafsirProgressRecord`) are declared in `lib/db` next to every other table row, which
 * is where the rest of the app imports its persistence types from.
 */

/* -------------------------------------------------------------------------- */
/* Reflection (Phase 7)                                                       */
/* -------------------------------------------------------------------------- */

export const reflectionVerdictSchema = z.enum(['understood', 'partly', 'needs_story']);

export type ReflectionVerdict = z.infer<typeof reflectionVerdictSchema>;

export const reflectionRequestSchema = z.object({
  surah: z.number().int().min(1).max(114),
  ayah: z.number().int().min(1).max(286),
  /** The child's own words. Optional because a reflection may be voice-only. */
  question: z.string().max(2000).optional(),
  /** Base64 16 kHz mono PCM, captured by the client. */
  audioBase64: z.string().max(6_000_000).optional(),
  audioMimeType: z.string().max(80).optional(),
  language: z.enum(['both', 'en', 'ta']).optional(),
});

export type ReflectionRequest = z.infer<typeof reflectionRequestSchema>;

/**
 * The model's reply to a reflection.
 *
 * `encouragement` is required: the route refuses to render a reply that has no
 * acknowledgement for the child, so an empty result surfaces as an error instead of a
 * bare explanation.
 */
export const reflectionModelResponseSchema = z.object({
  encouragement: z.string().min(1).max(600),
  explanation: z.string().max(3000),
  followUpQuestion: z.string().max(400).optional(),
  verdict: z.string().max(40).optional(),
});

export interface ReflectionReply {
  encouragement: string;
  explanation: string;
  followUpQuestion?: string;
  verdict?: ReflectionVerdict;
  latencyMs: number;
}

/* -------------------------------------------------------------------------- */
/* Gemini Live storyteller                                                    */
/* -------------------------------------------------------------------------- */

export type LiveStorytellerStatus =
  | 'idle'
  | 'requesting_token'
  | 'connecting'
  /** The socket dropped and a bounded automatic retry is queued. */
  | 'reconnecting'
  | 'active'
  | 'speaking'
  | 'interrupted'
  | 'error'
  | 'unsupported';

export interface LiveTranscriptLine {
  id: string;
  speaker: 'ameen' | 'student';
  text: string;
  at: number;
}

/** What the browser receives from the token route. Never contains the API key. */
export const liveSessionTicketSchema = z.object({
  token: z.string().min(1),
  model: z.string().min(1),
  /** ISO timestamp after which new sessions using this token are rejected. */
  newSessionExpireTime: z.string().min(1),
  expiresAt: z.string().min(1),
});

export type LiveSessionTicket = z.infer<typeof liveSessionTicketSchema>;
