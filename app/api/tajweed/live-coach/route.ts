import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const maxDuration = 45;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      audioBase64,
      audioMimeType = 'audio/webm',
      userQuery,
      currentLessonTitle,
      currentActivityTitle,
      promptArabic,
      targetRule,
      language = 'both', // 'en' | 'ta' | 'both'
    } = body;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        coachResponseEn: `For "${promptArabic || currentLessonTitle}": Pronounce clearly from its primary articulation point (Makhraj). Keep the Harakah duration exact and apply Tajweed rules steadily.`,
        coachResponseTa: `"${promptArabic || currentLessonTitle}" க்கான வழிகாட்டல்: அதன் சரியான உச்சரிப்பு தானத்திலிருந்து (மக்ரிஜ்) தெளிவாக உச்சரிக்கவும். ஹரக்கத் அளவைச் சரியாகப் பேணவும்.`,
        makhrajTip: 'Al-Halq / Al-Lisan articulation focus.',
        suggestedPractice: 'Repeat 3 times focusing on throat/tongue elevation.',
        tajweedRuleName: targetRule || 'Makharij & Tajweed Foundation',
      });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const promptText = `
You are the interactive "NurulQuran Live Tajweed Coach & Pronunciation Mentor".
You are tutoring a student currently studying:
- Lesson: "${currentLessonTitle || 'Quranic Recitation'}"
- Activity: "${currentActivityTitle || 'Pronunciation Practice'}"
- Arabic Word / Letter / Verse: "${promptArabic || 'N/A'}"
- Specific Tajweed Topic: "${targetRule || 'General Tajweed & Makharij'}"

Student Question / Speech: "${userQuery || (audioBase64 ? 'Student submitted live voice recitation for evaluation' : 'Explain this rule and how to pronounce correctly.')}"

YOUR TASK:
1. If voice audio was provided, analyze their pronunciation, letter articulation, harakat length, and Tajweed execution.
2. If student asked a question, provide an encouraging, crystal-clear explanation.
3. Provide both an English explanation and an authentic Tamil explanation (தமிழ் விளக்கம்).
4. Give specific physical/anatomical advice on where the tongue, lips, or throat should be placed.

Respond ONLY in valid JSON matching:
{
  "coachResponseEn": "<Clear, concise guidance in English (2-3 sentences)>",
  "coachResponseTa": "<Clear Tamil explanation and guidance (2-3 sentences)>",
  "makhrajTip": "<Specific anatomical tip for tongue/lips/throat>",
  "makhrajTipTa": "<Anatomical tip in Tamil>",
  "tajweedRuleName": "<Exact Tajweed rule name in Arabic/English>",
  "accuracyRating": "<Excellent | Good | Needs Practice | Polished>",
  "suggestedPractice": "<Quick 1-step exercise for the student>"
}
`;

    const contents: any[] = [{ text: promptText }];

    if (audioBase64) {
      contents.push({
        inlineData: {
          mimeType: audioMimeType,
          data: audioBase64.replace(/^data:audio\/[a-z0-9]+;base64,/, ''),
        },
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    });

    const text = response.text?.trim() || '{}';
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      result = {
        coachResponseEn: 'Articulate this letter with precision from its makhraj. Maintain proper vowel duration.',
        coachResponseTa: 'இந்த எழுத்தை அதன் மக்ரிஜிலிருந்து துல்லியமாக உச்சரிக்கவும். ஹரக்கத் கால அளவை சரியாக நிலைநிறுத்தவும்.',
        makhrajTip: 'Ensure proper contact between tongue and palate.',
        makhrajTipTa: 'நாவுக்கும் மேல் அண்ணத்திற்கும் இடையே சரியான தொடர்பை உறுதிப்படுத்தவும்.',
        tajweedRuleName: targetRule || 'Makharij Precision',
        accuracyRating: 'Good',
        suggestedPractice: 'Recite slowly with deep breath and verify resonance.',
      };
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Live Coach API Error:', error);
    return NextResponse.json(
      {
        coachResponseEn: 'Remember to pronounce this letter firmly from its exact makhraj, giving each Harakah its full measure.',
        coachResponseTa: 'ஒவ்வொரு எழுத்தையும் அதன் அசல் தானத்திலிருந்து (மக்ரிஜ்) தெளிவாக உச்சரித்து, ஹரக்கத் அளவை பூரணமாக கொடுக்கவும்.',
        makhrajTip: 'Keep jaw relaxed and focus breath at the articulation point.',
        makhrajTipTa: 'தாடையை தளர்த்தி, உச்சரிப்பு தானத்தில் மூச்சை ஒருமுகப்படுத்தவும்.',
        tajweedRuleName: 'Makharij & Tajweed Guide',
        accuracyRating: 'Good',
        suggestedPractice: 'Repeat 3 times with steady tempo.',
      },
      { status: 200 }
    );
  }
}
