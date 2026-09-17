import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Modality } from '@google/genai';

export const maxDuration = 30;

// Authentic sample phrase for Tajweed teacher voice demonstration
const SAMPLE_PHRASES: Record<string, string> = {
  Kore: 'As-salamu alaykum. I am your Tajweed teacher. Practice reciting with clear articulation and balanced breath.',
  Zephyr: 'As-salamu alaykum. Welcome. Let us recite with calmness and reflection.',
  Puck: 'As-salamu alaykum! Ready to practice your Tajweed today? Let us begin!',
  Fenrir: 'As-salamu alaykum. Observe the exact Makharij and rules of Hafs an Asim.',
  Charon: 'As-salamu alaykum. Recite deliberately, giving every letter its full right and due.',
};

export async function POST(req: NextRequest) {
  try {
    const { voiceId = 'Kore', customText } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY not configured on server' },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });
    const textToSpeak =
      customText ||
      SAMPLE_PHRASES[voiceId] ||
      'As-salamu alaykum. Welcome to your Quran Tajweed practice.';

    // Call Gemini 3.1 TTS Preview for real spoken speech
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
