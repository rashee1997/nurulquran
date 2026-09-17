import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { voiceId = 'Kore', phrase = 'Bismillahir Rahmanir Raheem' } = body;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        voiceId,
        available: false,
        message: 'Synthesizing with local harmonic voice generator',
      });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build-nurulquran',
        },
      },
    });

    // Request short vocal confirmation from Gemini
    const prompt = `Say in a warm, welcoming teacher voice: "As-salamu alaykum! I am your Tajweed teacher ${voiceId}. Let us recite with precision and beauty."`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
    });

    return NextResponse.json({
      voiceId,
      sampleText: response.text?.trim() || `As-salamu alaykum, I am your Tajweed coach ${voiceId}.`,
      available: true,
    });
  } catch (err) {
    return NextResponse.json({
      voiceId: 'Kore',
      available: false,
      error: 'Fallback to client synthesizer',
    });
  }
}
