import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Modality } from '@google/genai';

export const maxDuration = 30;

type FeedbackLanguage = 'both' | 'en' | 'ta';

// Authentic bilingual sample phrases for Tajweed teacher voice demonstration.
// The spoken language follows the learner's saved feedback-language preference.
const SAMPLE_PHRASES: Record<string, { en: string; ta: string }> = {
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

function buildPhrase(voiceId: string, language: FeedbackLanguage, customText?: string): string {
  if (customText) return customText;

  const phrase = SAMPLE_PHRASES[voiceId] || SAMPLE_PHRASES.Kore;
  if (language === 'en') return phrase.en;
  if (language === 'ta') return phrase.ta;
  return `${phrase.en} ... ${phrase.ta}`;
}

export async function POST(req: NextRequest) {
  try {
    const {
      voiceId = 'Kore',
      customText,
      language = 'both',
    }: { voiceId?: string; customText?: string; language?: FeedbackLanguage } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY not configured on server' },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });
    const textToSpeak = buildPhrase(voiceId, language, customText);
    // Steer single-language previews explicitly; bilingual previews let the model switch naturally
    const languageCode = language === 'ta' ? 'ta-IN' : language === 'en' ? 'en-US' : undefined;

    // Call Gemini 3.1 TTS Preview for real spoken speech in the selected language(s)
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-tts-preview',
      contents: [
        {
          parts: [
            {
              text: textToSpeak,
            },
          ],
        },
      ],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voiceId,
            },
          },
          ...(languageCode ? { languageCode } : {}),
        },
      },
    });

    const base64Audio =
      response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!base64Audio) {
      return NextResponse.json(
        { error: 'No audio candidate returned from Gemini TTS' },
        { status: 502 }
      );
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
  } catch (err: any) {
    console.error('Gemini TTS voice preview API error:', err);
    return NextResponse.json(
      {
        error: err.message || 'Failed to generate speech with Gemini',
      },
      { status: 500 }
    );
  }
}
