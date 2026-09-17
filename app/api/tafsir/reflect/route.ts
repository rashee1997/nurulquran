import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import {
  apiError,
  guardRequest,
  NOT_CONFIGURED,
  RATE_LIMITED,
  UPSTREAM_UNAVAILABLE,
} from '@/lib/api/http';
import { callerKey, checkRateLimit } from '@/lib/api/rate-limit';
import { parseWithSchema } from '@/lib/api/schemas';
import { resolveServerGeminiModel } from '@/lib/ai/models';
import { serverGeminiApiKey } from '@/lib/ai/resolver';
import { quranProvider } from '@/lib/quran/alquran-cloud';
import { SURAHS } from '@/lib/quran/surahs';
import { buildLessonSegment, type LessonVerse } from '@/lib/tafsir/lesson';
import { buildReflectionPrompt } from '@/lib/tafsir/prompts';
import {
  reflectionModelResponseSchema,
  reflectionRequestSchema,
  reflectionVerdictSchema,
  type ReflectionReply,
} from '@/lib/tafsir/types';

export const maxDuration = 45;

const RATE_LIMIT = { limit: 20, windowMs: 60_000 };

/**
 * Grades a child's spoken or typed reflection on one ayah.
 *
 * The lesson context is rebuilt **server-side** from the same editions the reader used,
 * rather than accepting exegesis text from the client. That matters for two reasons: the
 * prompt cannot be re-pointed at arbitrary content by a crafted request, and the model is
 * always given the same grounded commentary the child actually read.
 *
 * The Arabic verse comes from the app's verified Quran provider, so the model is never
 * asked to recall scripture from memory.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = guardRequest(req);
  if (!guard.ok) return guard.response;

  const rate = checkRateLimit({ key: callerKey(req, 'tafsir-reflect'), ...RATE_LIMIT });
  if (!rate.allowed) {
    return apiError({
      status: 429,
      code: 'rate_limited',
      message: RATE_LIMITED,
      headers: { 'Retry-After': `${rate.retryAfterSeconds}` },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError({ status: 400, code: 'invalid_request', message: 'Request body must be valid JSON.' });
  }

  const parsed = parseWithSchema(reflectionRequestSchema, body);
  if (!parsed.ok) {
    return apiError({ status: 400, code: 'invalid_request', message: parsed.message });
  }

  const {
    surah,
    ayah,
    question,
    audioBase64,
    audioMimeType = 'audio/pcm;rate=16000',
    language = 'both',
  } = parsed.data;

  const writtenAnswer = question?.trim() ?? '';
  if (writtenAnswer.length === 0 && (!audioBase64 || audioBase64.length === 0)) {
    return apiError({
      status: 400,
      code: 'invalid_request',
      message: 'A reflection needs either a written answer or a voice recording.',
    });
  }

  const apiKey = serverGeminiApiKey();
  if (!apiKey) {
    return apiError({ status: 503, code: 'not_configured', message: NOT_CONFIGURED, unavailable: true });
  }

  // Looked up rather than fetched through `getChapterMetadata`, which throws for an unknown
  // sūrah. A crafted request must produce a 400, not an unhandled exception in a route.
  const chapter = SURAHS.find((entry) => entry.id === surah);
  if (!chapter || ayah < 1 || ayah > chapter.versesCount) {
    return apiError({
      status: 400,
      code: 'invalid_request',
      message: chapter
        ? `Ayah ${surah}:${ayah} does not exist; ${chapter.nameSimple} has ${chapter.versesCount} ayahs.`
        : `Surah ${surah} is not a valid surah number.`,
    });
  }

  let verse: LessonVerse;
  try {
    const resolved = await quranProvider.getVerse({ surah, ayah });
    verse = {
      surah,
      ayah,
      versesCount: chapter.versesCount,
      surahNameSimple: chapter.nameSimple,
      surahNameArabic: chapter.nameArabic,
      surahNameEnglish: chapter.nameEnglish,
      textUthmani: resolved.textUthmani,
      textSimple: resolved.textSimple,
      translationEn: resolved.translationEn,
      translationTa: resolved.translationTa,
      audioUrl: resolved.audioUrl,
      provenance: resolved.provenance ?? 'network',
    };
  } catch (error: unknown) {
    console.error('Reflection could not resolve the verse text:', error);
    return apiError({
      status: 503,
      code: 'upstream_unavailable',
      message:
        'The verified verse text could not be retrieved, so the reflection was not graded. Please retry.',
      unavailable: true,
    });
  }

  let prompt: string;
  try {
    const { segment } = await buildLessonSegment(verse);
    prompt = buildReflectionPrompt(segment, language, writtenAnswer, Boolean(audioBase64));
  } catch (error: unknown) {
    console.error('Reflection could not assemble the lesson context:', error);
    return apiError({
      status: 503,
      code: 'upstream_unavailable',
      message: 'The lesson commentary could not be retrieved, so the reflection was not graded. Please retry.',
      unavailable: true,
    });
  }

  const contents: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: prompt },
  ];

  if (audioBase64) {
    contents.push({
      inlineData: {
        mimeType: audioMimeType,
        data: audioBase64.replace(/^data:audio\/[a-z0-9-]+;base64,/, ''),
      },
    });
  }

  const startedAt = performance.now();

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: resolveServerGeminiModel(),
      contents,
      config: {
        responseMimeType: 'application/json',
        // Low but non-zero: the child should hear warmth in the wording, never new facts.
        temperature: 0.35,
      },
    });

    const responseText = response.text?.trim() ?? '';
    let raw: unknown;
    try {
      raw = JSON.parse(responseText);
    } catch {
      console.error('Reflection evaluation returned non-JSON output.');
      return apiError({
        status: 503,
        code: 'upstream_unavailable',
        message: UPSTREAM_UNAVAILABLE,
        unavailable: true,
      });
    }

    const validated = parseWithSchema(reflectionModelResponseSchema, raw);
    if (!validated.ok) {
      console.error('Reflection output failed schema validation:', validated.message);
      return apiError({
        status: 503,
        code: 'upstream_unavailable',
        message: UPSTREAM_UNAVAILABLE,
        unavailable: true,
      });
    }

    const verdictCandidate = validated.data.verdict
      ? reflectionVerdictSchema.safeParse(validated.data.verdict)
      : null;

    const reply: ReflectionReply = {
      encouragement: validated.data.encouragement.trim(),
      explanation: validated.data.explanation.trim(),
      ...(validated.data.followUpQuestion?.trim()
        ? { followUpQuestion: validated.data.followUpQuestion.trim() }
        : {}),
      ...(verdictCandidate?.success ? { verdict: verdictCandidate.data } : {}),
      latencyMs: Math.round(performance.now() - startedAt),
    };

    return NextResponse.json(reply);
  } catch (error: unknown) {
    console.error('Reflection evaluation request failed:', error);
    return apiError({
      status: 503,
      code: 'upstream_unavailable',
      message: UPSTREAM_UNAVAILABLE,
      unavailable: true,
    });
  }
}
