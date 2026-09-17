import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Modality } from '@google/genai';
import { apiError, guardRequest, NOT_CONFIGURED, RATE_LIMITED } from '@/lib/api/http';
import { callerKey, checkRateLimit } from '@/lib/api/rate-limit';
import { parseWithSchema, voicePreviewRequestSchema, type FeedbackLanguagePayload } from '@/lib/api/schemas';
import { DEFAULT_GEMINI_TTS_MODEL } from '@/lib/ai/models';
import { serverGeminiApiKey } from '@/lib/ai/resolver';

export const maxDuration = 30;

const RATE_LIMIT = { limit: 15, windowMs: 60_000 };

/** Voices the Gemini TTS preview accepts. Anything else falls back to Kore. */
const SUPPORTED_VOICES = ['Kore', 'Zephyr', 'Puck', 'Fenrir', 'Charon'] as const;

const SAMPLE_PHRASES: Record<(typeof SUPPORTED_VOICES)[number], { en: string; ta: string }> = {
  Kore: {
    en: 'As-salamu alaykum. I am your Tajweed teacher. Practice reciting with clear articulation and balanced breath.',
    ta: 'அஸ்ஸலாமு அலைக்கும். நான் உங்கள் தஜ்வீத் ஆசிரியர். தெளிவான உச்சரிப்புடனும் சீரான மூச்சுடனும் ஓதிப் பயிற்சி செய்யுங்கள்.',
  },
  Zephyr: {
    en: 'As-salamu alaykum. Welcome. Let us recite with calmness and reflection.',
    ta: 'அஸ்ஸலாமு அலைக்கும். வருக. அமைதியுடனும் சிந்தனையுடனும் ஓதுவோம்.',
  },
  Puck: {
    en: 'As-salamu alaykum! Ready to practice your Tajweed today? Let us begin!',
    ta: 'அஸ்ஸலாமு அலைக்கும்! இன்று தஜ்வீத் பயிற்சிக்குத் தயாரா? தொடங்குவோம்!',
  },
  Fenrir: {
    en: 'As-salamu alaykum. Observe the exact Makharij and rules of Hafs an Asim.',
    ta: 'அஸ்ஸலாமு அலைக்கும். ஹஃப்ஸ் அன் ஆஸிமின் துல்லியமான மகாரிஜ் மற்றும் விதிகளைக் கவனியுங்கள்.',
  },
  Charon: {
    en: 'As-salamu alaykum. Recite deliberately, giving every letter its full right and due.',
    ta: 'அஸ்ஸலாமு அலைக்கும். ஒவ்வொரு எழுத்துக்கும் அதன் முழு உரிமையை வழங்கி நிதானமாக ஓதுங்கள்.',
  },
};

function isSupportedVoice(value: string): value is (typeof SUPPORTED_VOICES)[number] {
  return (SUPPORTED_VOICES as readonly string[]).includes(value);
}

function buildPhrase(
  voiceId: (typeof SUPPORTED_VOICES)[number],
  language: FeedbackLanguagePayload,
  customText?: string
): string {
  if (customText && customText.trim().length > 0) return customText.trim();
  const phrase = SAMPLE_PHRASES[voiceId];
  if (language === 'en') return phrase.en;
  if (language === 'ta') return phrase.ta;
  return `${phrase.en} ... ${phrase.ta}`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = guardRequest(req, { maxBytes: 32_000 });
  if (!guard.ok) return guard.response;

  const rate = checkRateLimit({ key: callerKey(req, 'voice-preview'), ...RATE_LIMIT });
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

  const parsed = parseWithSchema(voicePreviewRequestSchema, body);
  if (!parsed.ok) {
    return apiError({ status: 400, code: 'invalid_request', message: parsed.message });
  }

  const { voiceId: requestedVoice = 'Kore', customText, language = 'both' } = parsed.data;
  const voiceId = isSupportedVoice(requestedVoice) ? requestedVoice : 'Kore';

  const apiKey = serverGeminiApiKey();
  if (!apiKey) {
    return apiError({ status: 503, code: 'not_configured', message: NOT_CONFIGURED });
  }

  const textToSpeak = buildPhrase(voiceId, language, customText);
  const languageCode = language === 'ta' ? 'ta-IN' : language === 'en' ? 'en-US' : undefined;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: DEFAULT_GEMINI_TTS_MODEL,
      contents: [{ parts: [{ text: textToSpeak }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voiceId },
          },
          ...(languageCode ? { languageCode } : {}),
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      return apiError({
        status: 502,
        code: 'upstream_unavailable',
        message: 'The speech service returned no audio for this voice.',
        unavailable: true,
      });
    }

    return NextResponse.json({
      success: true,
      audioBase64: base64Audio,
      sampleRate: 24000,
      mimeType: 'audio/pcm;rate=24000',
      voiceId,
      language,
      textSpoken: textToSpeak,
    });
  } catch (error: unknown) {
    console.error('Voice preview synthesis failed:', error);
    return apiError({
      status: 503,
      code: 'upstream_unavailable',
      message: 'Speech preview is unavailable right now. A synthesized fallback preview will play instead.',
      unavailable: true,
    });
  }
}
