/**
 * Zod schemas for every request payload and every model-produced payload.
 *
 * Nothing crosses an API boundary here without being parsed: previously the routes
 * cast `await req.json()` to an interface and trusted the model's JSON verbatim.
 */

import { z } from 'zod';
import { AI_PROVIDER_VENDORS } from '@/lib/ai/types';
import { ACCURACY_RATINGS, type AccuracyRating } from '@/lib/ai/verdict';

export const feedbackLanguageSchema = z.enum(['both', 'en', 'ta']);
export type FeedbackLanguagePayload = z.infer<typeof feedbackLanguageSchema>;

export const accuracyRatingSchema = z.enum(ACCURACY_RATINGS);
export type { AccuracyRating };

export const teacherPersonaSchema = z.enum(['gentle', 'balanced', 'strict']);
export type TeacherPersona = z.infer<typeof teacherPersonaSchema>;

/** Maximum length of a base64 audio string (≈4.5 MB of decoded audio). */
const AUDIO_BASE64_MAX = 6_000_000;

const shortText = (max: number) => z.string().max(max);

/* -------------------------------------------------------------------------- */
/* Tajweed live coach                                                         */
/* -------------------------------------------------------------------------- */

export const liveCoachRequestSchema = z.object({
  audioBase64: z.string().max(AUDIO_BASE64_MAX).optional(),
  audioMimeType: shortText(80).optional(),
  userQuery: shortText(4000).optional(),
  currentLessonTitle: shortText(200).optional(),
  currentActivityTitle: shortText(200).optional(),
  promptArabic: shortText(500).optional(),
  targetRule: shortText(500).optional(),
  voiceId: shortText(60).optional(),
  teacherPersona: teacherPersonaSchema.optional(),
  language: feedbackLanguageSchema.optional(),
  /** When true the model also returns a verbatim transcript of the words it heard. */
  requestTranscript: z.boolean().optional(),
});
export type LiveCoachRequest = z.infer<typeof liveCoachRequestSchema>;

export const liveCoachModelResponseSchema = z.object({
  coachResponseEn: z.string().max(4000).optional(),
  coachResponseTa: z.string().max(4000).optional(),
  makhrajTip: z.string().max(2000).optional(),
  makhrajTipTa: z.string().max(2000).optional(),
  tajweedRuleName: z.string().max(200).optional(),
  accuracyRating: z.string().max(40).optional(),
  suggestedPractice: z.string().max(1000).optional(),
  detectedErrors: z.array(z.string().max(300)).max(12).optional(),
  transcript: z.string().max(4000).optional(),
});

/* -------------------------------------------------------------------------- */
/* Tajweed placement evaluation                                               */
/* -------------------------------------------------------------------------- */

export const tajweedEvaluationRequestSchema = z.object({
  audioBase64: z.string().max(AUDIO_BASE64_MAX).optional(),
  audioMimeType: shortText(80).optional(),
  targetVerseArabic: shortText(500).optional(),
  targetRule: shortText(500).optional(),
  answers: z
    .record(z.string(), z.union([z.string().max(500), z.number()]))
    .optional(),
  examType: z.enum(['placement', 'recitation']).optional(),
  userLevel: z.number().int().min(1).max(50).optional(),
  language: feedbackLanguageSchema.optional(),
});
export type TajweedEvaluationRequest = z.infer<typeof tajweedEvaluationRequestSchema>;

export const tajweedEvaluationModelResponseSchema = z.object({
  score: z.number().min(0).max(100),
  accuracyPercent: z.number().min(0).max(100).optional(),
  feedbackEn: z.string().max(4000).optional(),
  feedbackTa: z.string().max(4000).optional(),
  tajweedRulesObserved: z.array(z.string().max(120)).max(12).optional(),
  makhrajTipsEn: z.string().max(2000).optional(),
  makhrajTipsTa: z.string().max(2000).optional(),
  strengths: z.array(z.string().max(300)).max(8).optional(),
  areasForImprovement: z.array(z.string().max(300)).max(8).optional(),
});
export type TajweedEvaluationModelResponse = z.infer<typeof tajweedEvaluationModelResponseSchema>;

/** Score at or above which a placement attempt counts as passed. */
export const PLACEMENT_PASS_SCORE = 75;
export const PLACEMENT_BONUS_XP = 150;

/* -------------------------------------------------------------------------- */
/* Voice preview                                                              */
/* -------------------------------------------------------------------------- */

export const voicePreviewRequestSchema = z.object({
  voiceId: shortText(60).optional(),
  customText: z.string().max(600).optional(),
  language: feedbackLanguageSchema.optional(),
});
export type VoicePreviewRequest = z.infer<typeof voicePreviewRequestSchema>;

/* -------------------------------------------------------------------------- */
/* Study assistant (streaming chat + provider probe)                          */
/* -------------------------------------------------------------------------- */

export const aiProviderVendorSchema = z.enum(AI_PROVIDER_VENDORS);

export const providerConfigSchema = z.object({
  type: aiProviderVendorSchema.optional(),
  apiKey: z.string().max(400).optional(),
  baseUrl: z.string().max(500).optional(),
  selectedModel: z.string().max(120).optional(),
  models: z.array(z.string().max(120)).max(40).optional(),
});

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().max(20_000),
});

export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(60),
  providerConfig: providerConfigSchema.optional(),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const providerTestRequestSchema = z.object({
  providerConfig: providerConfigSchema.optional(),
  type: aiProviderVendorSchema.optional(),
  apiKey: z.string().max(400).optional(),
  baseUrl: z.string().max(500).optional(),
  selectedModel: z.string().max(120).optional(),
});
export type ProviderTestRequest = z.infer<typeof providerTestRequestSchema>;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

export interface SchemaParseFailure {
  ok: false;
  message: string;
}

export type SchemaParseResult<T> = { ok: true; data: T } | SchemaParseFailure;

/** Parses an unknown payload, returning a caller-safe failure message. */
export function parseWithSchema<T>(schema: z.ZodType<T>, payload: unknown): SchemaParseResult<T> {
  const result = schema.safeParse(payload);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  const first = result.error.issues[0];
  const path = first?.path.join('.') ?? 'body';
  return { ok: false, message: `${path}: ${first?.message ?? 'invalid payload'}` };
}
