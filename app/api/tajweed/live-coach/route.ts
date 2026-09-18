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
import {
  accuracyRatingSchema,
  liveCoachModelResponseSchema,
  liveCoachRequestSchema,
  parseWithSchema,
  type AccuracyRating,
  type FeedbackLanguagePayload,
} from '@/lib/api/schemas';
import { resolveServerGeminiModel } from '@/lib/ai/models';
import { serverGeminiApiKey } from '@/lib/ai/resolver';

export const maxDuration = 45;

const RATE_LIMIT = { limit: 30, windowMs: 60_000 };

interface LiveCoachResponse {
  coachResponseEn: string;
  coachResponseTa: string;
  makhrajTip: string;
  makhrajTipTa: string;
  tajweedRuleName: string;
  accuracyRating?: AccuracyRating;
  suggestedPractice: string;
  detectedErrors: string[];
  latencyMs: number;
  voiceId: string;
  persona: string;
  /** Verbatim words heard, only when the client asked for a transcript. */
  transcript?: string;
}

/** Blanks out the language the learner did not ask for. */
function alignWithLanguage(payload: LiveCoachResponse, language: FeedbackLanguagePayload): LiveCoachResponse {
  if (language === 'en') {
    return { ...payload, coachResponseTa: '', makhrajTipTa: '' };
  }
  if (language === 'ta') {
    return { ...payload, coachResponseEn: '', makhrajTip: '' };
  }
  return payload;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = guardRequest(req);
  if (!guard.ok) return guard.response;

  const rate = checkRateLimit({ key: callerKey(req, 'live-coach'), ...RATE_LIMIT });
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

  const parsed = parseWithSchema(liveCoachRequestSchema, body);
  if (!parsed.ok) {
    return apiError({ status: 400, code: 'invalid_request', message: parsed.message });
  }

  const {
    audioBase64,
    audioMimeType = 'audio/pcm;rate=16000',
    userQuery,
    currentLessonTitle = 'Quranic Recitation & Tajweed',
    currentActivityTitle = 'Oral Recitation & Pronunciation',
    promptArabic = '',
    targetRule = 'Makharij al-Huroof & Ahkam at-Tajweed',
    voiceId = 'Kore',
    teacherPersona = 'balanced',
    language = 'both',
    requestTranscript = false,
  } = parsed.data;

  if ((!audioBase64 || audioBase64.length === 0) && !userQuery) {
    return apiError({
      status: 400,
      code: 'invalid_request',
      message: 'Provide either recorded audio or a written question.',
    });
  }

  const apiKey = serverGeminiApiKey();
  if (!apiKey) {
    // No key means no evaluation. Never stand in for the assessment with canned praise.
    return apiError({ status: 503, code: 'not_configured', message: NOT_CONFIGURED, unavailable: true });
  }

  const personaGuidance =
    teacherPersona === 'gentle'
      ? `
TEACHER PERSONA: Gentle Encourager.
- Prioritize praise, build student confidence, and do not nitpick minor acoustic variations.
- Only correct major makhraj misplacements (e.g. confusing 'Ain with Hamzah, or Haa with Khaa).
- Always include an encouraging remark.`
      : teacherPersona === 'strict'
        ? `
TEACHER PERSONA: Strict Qari & Hafiz Examiner (Hafs 'an 'Asim Sanad Standard).
- Scrutinize precise letter articulation (Makhraj) and intrinsic characteristics (Sifaat).
- Check exact Harakah vowel timing (2 counts for Madd Tabee'ee, 4-5 counts for Muttasil/Munfasil).
- Check Ghunnah duration (full 2 counts on Noon/Meem Mushaddadah, Ikhfa, Idgham bi-Ghunnah).
- Demand crisp Qalqalah on قطب جد when sakin, and verify Tafkheem versus Tarqeeq.`
        : `
TEACHER PERSONA: Balanced Mentor.
- Blend warm pedagogical encouragement with actionable, clear corrections.
- Focus on correct letter origin (Makhraj), avoiding vowel swallowing or elongation, and foundational Tajweed rules.`;

  const languageGuidance =
    language === 'en'
      ? 'FEEDBACK LANGUAGE: English only. Write every response in English and return empty strings for all Tamil fields (coachResponseTa, makhrajTipTa).'
      : language === 'ta'
        ? 'FEEDBACK LANGUAGE: Tamil only. Write every response in authentic Tamil (தமிழ் விளக்கம்) and return empty strings for all English fields (coachResponseEn, makhrajTip).'
        : 'FEEDBACK LANGUAGE: Bilingual. Provide a high-clarity English explanation and an equally complete authentic Tamil explanation (தமிழ் வழிகாட்டல்).';

  const systemPrompt = `
You are the interactive "NurulQuran Live Tajweed Coach", a certified Quran Qari and compassionate Mu'allim.
You are evaluating a student reciting:
- Lesson: "${currentLessonTitle}"
- Activity: "${currentActivityTitle}"
- Arabic Target: "${promptArabic || 'Quranic recitation'}"
- Focused Tajweed Rule: "${targetRule}"
- Selected Voice Profile: ${voiceId}
${personaGuidance}
${languageGuidance}

STUDENT INPUT:
${userQuery ? `Question: "${userQuery}"` : 'The student submitted a live voice audio recitation for Tajweed evaluation.'}

Evaluate only what is actually present in the submission. If the audio is silent, unintelligible, or
unrelated to the target, say so plainly and rate it "Needs Practice" — never invent praise.

${
  requestTranscript
    ? `TRANSCRIPT REQUIREMENT: Also return "transcript" — the exact Arabic words you heard in the audio, in order, in plain Arabic script without diacritics. This is a verbatim record of the student's recitation, NOT the correct verse: if the student skipped, repeated or substituted a word, the transcript must reflect exactly that. Never "correct" it toward the Quranic text. If nothing intelligible was said, return an empty string.`
    : ''
}

OUTPUT FORMAT — respond ONLY with valid JSON matching:
{
  ${requestTranscript ? '"transcript": "<verbatim Arabic words heard, without diacritics>",\n  ' : ''}"coachResponseEn": "<2-3 clear, constructive sentences — or an empty string when the feedback language is Tamil only>",
  "coachResponseTa": "<2-3 accurate sentences in Tamil — or an empty string when the feedback language is English only>",
  "makhrajTip": "<specific physical tip for tongue, throat or lips — or an empty string for Tamil only>",
  "makhrajTipTa": "<physical anatomical tip in Tamil — or an empty string for English only>",
  "tajweedRuleName": "<exact Tajweed rule name>",
  "accuracyRating": "<Excellent | Good | Needs Practice | Polished>",
  "suggestedPractice": "<1 concise practice exercise>",
  "detectedErrors": ["<specific error 1 if any>", "<specific error 2 if any>"]
}
`;

  const contents: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: systemPrompt },
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
        temperature: 0.25,
      },
    });

    const responseText = response.text?.trim() ?? '';
    let rawVerdict: unknown;
    try {
      rawVerdict = JSON.parse(responseText);
    } catch {
      // Unparsable model output is a service failure, not a passing grade.
      console.error('Live coach returned non-JSON output.');
      return apiError({
        status: 503,
        code: 'upstream_unavailable',
        message: UPSTREAM_UNAVAILABLE,
        unavailable: true,
      });
    }

    const verdict = parseWithSchema(liveCoachModelResponseSchema, rawVerdict);
    if (!verdict.ok) {
      console.error('Live coach output failed schema validation:', verdict.message);
      return apiError({
        status: 503,
        code: 'upstream_unavailable',
        message: UPSTREAM_UNAVAILABLE,
        unavailable: true,
      });
    }

    const ratingCandidate = verdict.data.accuracyRating;
    const ratingParsed = ratingCandidate ? accuracyRatingSchema.safeParse(ratingCandidate) : null;

    const payload: LiveCoachResponse = {
      coachResponseEn: verdict.data.coachResponseEn ?? '',
      coachResponseTa: verdict.data.coachResponseTa ?? '',
      makhrajTip: verdict.data.makhrajTip ?? '',
      makhrajTipTa: verdict.data.makhrajTipTa ?? '',
      tajweedRuleName: verdict.data.tajweedRuleName ?? targetRule,
      suggestedPractice: verdict.data.suggestedPractice ?? 'Recite the passage three times at a measured pace.',
      detectedErrors: verdict.data.detectedErrors ?? [],
      latencyMs: Math.round(performance.now() - startedAt),
      voiceId,
      persona: teacherPersona,
      ...(ratingParsed?.success ? { accuracyRating: ratingParsed.data } : {}),
      ...(requestTranscript ? { transcript: verdict.data.transcript ?? '' } : {}),
    };

    if (payload.coachResponseEn.length === 0 && payload.coachResponseTa.length === 0) {
      return apiError({
        status: 502,
        code: 'upstream_unavailable',
        message: UPSTREAM_UNAVAILABLE,
        unavailable: true,
      });
    }

    return NextResponse.json(alignWithLanguage(payload, language));
  } catch (error: unknown) {
    console.error('Live Tajweed coach request failed:', error);
    return apiError({
      status: 503,
      code: 'upstream_unavailable',
      message: UPSTREAM_UNAVAILABLE,
      unavailable: true,
    });
  }
}
