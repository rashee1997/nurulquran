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
  PLACEMENT_BONUS_XP,
  PLACEMENT_PASS_SCORE,
  parseWithSchema,
  tajweedEvaluationModelResponseSchema,
  tajweedEvaluationRequestSchema,
  type FeedbackLanguagePayload,
  type TajweedEvaluationModelResponse,
} from '@/lib/api/schemas';
import { resolveServerGeminiModel } from '@/lib/ai/models';
import { serverGeminiApiKey } from '@/lib/ai/resolver';

export const maxDuration = 60;

const RATE_LIMIT = { limit: 10, windowMs: 60_000 };

interface PlacementEvaluation {
  score: number;
  passed: boolean;
  accuracyPercent: number;
  feedbackEn: string;
  feedbackTa: string;
  tajweedRulesObserved: string[];
  makhrajTipsEn: string;
  makhrajTipsTa: string;
  strengths: string[];
  areasForImprovement: string[];
  unlockedLevel: number;
  bonusXp: number;
}

/** Blanks out the language the learner did not ask for. */
function alignWithLanguage(
  payload: PlacementEvaluation,
  language: FeedbackLanguagePayload
): PlacementEvaluation {
  if (language === 'en') {
    return { ...payload, feedbackTa: '', makhrajTipsTa: '' };
  }
  if (language === 'ta') {
    return { ...payload, feedbackEn: '', makhrajTipsEn: '' };
  }
  return payload;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = guardRequest(req);
  if (!guard.ok) return guard.response;

  const rate = checkRateLimit({ key: callerKey(req, 'tajweed-evaluate'), ...RATE_LIMIT });
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

  const parsed = parseWithSchema(tajweedEvaluationRequestSchema, body);
  if (!parsed.ok) {
    return apiError({ status: 400, code: 'invalid_request', message: parsed.message });
  }

  const {
    audioBase64,
    audioMimeType = 'audio/webm',
    targetVerseArabic,
    targetRule,
    answers,
    userLevel = 1,
    language = 'both',
  } = parsed.data;

  if (!audioBase64 || audioBase64.length === 0) {
    return apiError({
      status: 400,
      code: 'invalid_request',
      message: 'A recorded recitation is required for a placement evaluation.',
    });
  }

  const apiKey = serverGeminiApiKey();
  if (!apiKey) {
    return apiError({ status: 503, code: 'not_configured', message: NOT_CONFIGURED, unavailable: true });
  }

  const languageGuidance =
    language === 'en'
      ? 'Write the feedback in English only. Leave every Tamil field as an empty string.'
      : language === 'ta'
        ? 'Write the feedback in authentic Tamil (தமிழ்) only. Leave every English field as an empty string.'
        : 'Write the feedback in both clear English and authentic Tamil (தமிழ்), keeping them equivalent.';

  const promptText = `
You are a senior Quranic Tajweed examiner (Hafs 'an 'Asim). Evaluate the student's recorded recitation.

FEEDBACK LANGUAGE: ${languageGuidance}

EXAMINATION CONTEXT:
- Target text: "${targetVerseArabic || 'Surah Al-Fatihah / Juz Amma passage'}"
- Specific rule tested: "${targetRule || 'Comprehensive Tajweed (Makharij, Noon Sakinah, Meem Sakinah, Madd, Qalqalah)'}"
- Written diagnostic answers: ${JSON.stringify(answers ?? {})}
- Current level: ${userLevel}

Assess only what is audible in the recording. If the recording is silent, unintelligible or does not
match the target text, return a low score (below 50). Do not award a pass for absent evidence.

CRITERIA:
1. Makharij al-Huroof (throat, tongue, lips)
2. Noon Sakinah & Tanween (Izhar, Idgham, Iqlab, Ikhfa)
3. Meem Sakinah (Ikhfa Shafawi, Idgham Shafawi, Izhar Shafawi)
4. Ahkam al-Madd (natural 2 counts versus extended 4-6 counts)
5. Qalqalah (echoing on قطب جد)
6. Tafkheem and Tarqeeq (heavy versus light letters)

Respond ONLY with valid JSON in this exact structure:
{
  "score": <integer 0-100>,
  "accuracyPercent": <integer 0-100>,
  "feedbackEn": "<2-3 constructive sentences in English>",
  "feedbackTa": "<equivalent Tamil feedback>",
  "tajweedRulesObserved": ["<rule 1>", "<rule 2>"],
  "makhrajTipsEn": "<specific anatomical advice>",
  "makhrajTipsTa": "<anatomical advice in Tamil>",
  "strengths": ["<strength 1>"],
  "areasForImprovement": ["<area 1>"]
}
`;

  const startedAt = performance.now();

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: resolveServerGeminiModel(),
      contents: [
        { text: promptText },
        {
          inlineData: {
            mimeType: audioMimeType,
            data: audioBase64.replace(/^data:audio\/[a-z0-9-]+;base64,/, ''),
          },
        },
      ],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });

    const responseText = response.text?.trim() ?? '';
    let rawAssessment: unknown;
    try {
      rawAssessment = JSON.parse(responseText);
    } catch {
      console.error('Placement evaluation returned non-JSON output.');
      return apiError({
        status: 503,
        code: 'upstream_unavailable',
        message: UPSTREAM_UNAVAILABLE,
        unavailable: true,
      });
    }

    const validated = parseWithSchema(tajweedEvaluationModelResponseSchema, rawAssessment);
    if (!validated.ok) {
      console.error('Placement evaluation failed schema validation:', validated.message);
      return apiError({
        status: 503,
        code: 'upstream_unavailable',
        message: UPSTREAM_UNAVAILABLE,
        unavailable: true,
      });
    }

    // The pass decision and any reward are derived here, never taken from the model,
    // so the certificate always matches the score the learner can see.
    const assessment: TajweedEvaluationModelResponse = validated.data;
    const score = Math.round(assessment.score);
    const passed = score >= PLACEMENT_PASS_SCORE;

    const payload: PlacementEvaluation = {
      score,
      passed,
      accuracyPercent: Math.round(assessment.accuracyPercent ?? score),
      feedbackEn: assessment.feedbackEn ?? '',
      feedbackTa: assessment.feedbackTa ?? '',
      tajweedRulesObserved: assessment.tajweedRulesObserved ?? [],
      makhrajTipsEn: assessment.makhrajTipsEn ?? '',
      makhrajTipsTa: assessment.makhrajTipsTa ?? '',
      strengths: assessment.strengths ?? [],
      areasForImprovement: assessment.areasForImprovement ?? [],
      unlockedLevel: passed ? 10 : Math.max(1, userLevel),
      bonusXp: passed ? PLACEMENT_BONUS_XP : 0,
    };

    if (payload.feedbackEn.length === 0 && payload.feedbackTa.length === 0) {
      return apiError({
        status: 502,
        code: 'upstream_unavailable',
        message: UPSTREAM_UNAVAILABLE,
        unavailable: true,
      });
    }

    return NextResponse.json({
      ...alignWithLanguage(payload, language),
      evaluatedAt: new Date().toISOString(),
      latencyMs: Math.round(performance.now() - startedAt),
    });
  } catch (error: unknown) {
    console.error('Placement evaluation request failed:', error);
    return apiError({
      status: 503,
      code: 'upstream_unavailable',
      message: UPSTREAM_UNAVAILABLE,
      unavailable: true,
    });
  }
}
