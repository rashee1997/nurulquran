import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const maxDuration = 45;

interface LiveCoachRequestBody {
  audioBase64?: string;
  audioMimeType?: string;
  userQuery?: string;
  currentLessonTitle?: string;
  currentActivityTitle?: string;
  promptArabic?: string;
  targetRule?: string;
  voiceId?: string;
  teacherPersona?: 'gentle' | 'balanced' | 'strict';
  language?: 'both' | 'en' | 'ta';
}

export async function POST(req: NextRequest) {
  const startTime = performance.now();

  try {
    const body = (await req.json()) as LiveCoachRequestBody;
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
    } = body;

    const apiKey = process.env.GEMINI_API_KEY;

    // Define persona instructions
    let personaGuidance = '';
    if (teacherPersona === 'gentle') {
      personaGuidance = `
TEACHER PERSONA: Gentle Encourager.
- Prioritize praise, build student confidence, and do not nitpick minor acoustic variations.
- Only correct major makhraj misplacements (e.g. confusing 'Ain with Hamzah, or Haa with Khaa).
- Always include an encouraging remark.
`;
    } else if (teacherPersona === 'strict') {
      personaGuidance = `
TEACHER PERSONA: Strict Qari & Hafiz Examiner (Hafs 'an 'Asim Sanad Standard).
- Scrutinize precise letter articulation (Makhraj) and intrinsic characteristics (Sifaat).
- Check exact Harakah vowel timing (2 counts for Madd Tabee'ee, exact 4-5 counts for Muttasil/Munfasil).
- Check Ghunnah duration (full 2 counts on Noon/Meem Mushaddadah, Ikhfa, Idgham bi-Ghunnah).
- Demand crisp Qalqalah on قطب جد when sakin, and verify Tafkheem (heaviness) vs Tarqeeq (lightness).
`;
    } else {
      personaGuidance = `
TEACHER PERSONA: Balanced Mentor.
- Blend warm pedagogical encouragement with actionable, clear corrections.
- Focus on correct letter origin (Makhraj), avoiding vowel swallowing or elongation, and foundational Tajweed rules.
`;
    }

    // Define language instructions
    let languageGuidance = '';
    if (language === 'en') {
      languageGuidance = 'Provide coach responses primarily in English. Tamil can be brief.';
    } else if (language === 'ta') {
      languageGuidance = 'Provide coach responses comprehensively in authentic Tamil (தமிழ் விளக்கம்), with English summary.';
    } else {
      languageGuidance = 'Provide both a high-clarity English explanation and an authentic Tamil explanation (தமிழ் வழிகாட்டல்) for bilingual comprehension.';
    }

    if (!apiKey) {
      const serverLatency = Math.round(performance.now() - startTime);
      return NextResponse.json({
        coachResponseEn: `For "${promptArabic || currentLessonTitle}": Pronounce clearly from its primary articulation point (Makhraj). Maintain consistent Harakah count and smooth airflow.`,
        coachResponseTa: `"${promptArabic || currentLessonTitle}" க்கான வழிகாட்டல்: அதன் சரியான உச்சரிப்பு தானத்திலிருந்து (மக்ரிஜ்) தெளிவாக உச்சரிக்கவும். ஹரக்கத் அளவைச் சரியாகப் பேணவும்.`,
        makhrajTip: 'Relax jaw and align tongue firmly with the designated palate or dental ridge.',
        makhrajTipTa: 'தாடையைத் தளர்த்தி, நாவை மேல் அண்ணம் அல்லது பல்லடியுடன் சரியாகப் பொருத்தவும்.',
        tajweedRuleName: targetRule || 'Makharij & Tajweed Precision',
        accuracyRating: 'Good',
        suggestedPractice: 'Recite 3 times steadily with full breath.',
        latencyMs: serverLatency,
        voiceId,
        persona: teacherPersona,
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

    const systemPrompt = `
You are the interactive "NurulQuran Live Tajweed Coach", a certified world-class Quran Qari and compassionate Mu'allim.
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

EVALUATION CRITERIA:
1. Makhraj (Throat: ء هـ ع ح غ خ | Tongue: ق ك ض ل ن ر ط د ت ص ز س ظ ذ ث | Lips: ف ب م و | Nasal: Ghunnah).
2. Harakat & Madd timing (2, 4, 5, or 6 counts).
3. Sifaat (Hams, Jahr, Qalqalah on قطب جد, Tafkheem vs Tarqeeq).
4. Concrete physical guidance (where to place tongue, teeth, or lips).

OUTPUT FORMAT:
Respond ONLY in valid, parseable JSON matching:
{
  "coachResponseEn": "<2-3 clear, constructive, encouraging sentences in English>",
  "coachResponseTa": "<2-3 accurate sentences in Tamil explaining the pronunciation and correction>",
  "makhrajTip": "<Specific physical/anatomical tip for tongue, throat, or lips>",
  "makhrajTipTa": "<Physical anatomical tip in Tamil>",
  "tajweedRuleName": "<Exact Tajweed rule name>",
  "accuracyRating": "<Excellent | Good | Needs Practice | Polished>",
  "suggestedPractice": "<1 concise practice exercise for the student>",
  "detectedErrors": ["<specific error 1 if any>", "<specific error 2 if any>"]
}
`;

    const contents: any[] = [{ text: systemPrompt }];

    if (audioBase64) {
      contents.push({
        inlineData: {
          mimeType: audioMimeType,
          data: audioBase64.replace(/^data:audio\/[a-z0-9\-]+;base64,/, ''),
        },
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.25,
      },
    });

    const responseText = response.text?.trim() || '{}';
    let result: Record<string, any>;
    try {
      result = JSON.parse(responseText);
    } catch {
      result = {
        coachResponseEn: 'Articulate this letter firmly from its makhraj. Maintain proper vowel duration and smooth breath.',
        coachResponseTa: 'இந்த எழுத்தை அதன் அசல் மக்ரிஜிலிருந்து துல்லியமாக உச்சரித்து ஹரக்கத் அளவை நிலைநிறுத்தவும்.',
        makhrajTip: 'Ensure correct contact between tongue and palate.',
        makhrajTipTa: 'நாவுக்கும் மேல் அண்ணத்திற்கும் இடையே சரியான தொடர்பை உறுதிப்படுத்தவும்.',
        tajweedRuleName: targetRule,
        accuracyRating: 'Good',
        suggestedPractice: 'Repeat 3 times at a steady, deliberate pace.',
      };
    }

    const serverLatency = Math.round(performance.now() - startTime);
    result.latencyMs = serverLatency;
    result.voiceId = voiceId;
    result.persona = teacherPersona;

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Live Tajweed Coach Error:', error);
    const serverLatency = Math.round(performance.now() - startTime);

    return NextResponse.json(
      {
        coachResponseEn:
          'Remember to articulate clearly from the primary articulation point (Makhraj) and hold vowel lengths evenly.',
        coachResponseTa:
          'எழுத்தின் அசல் தானத்திலிருந்து (மக்ரிஜ்) தெளிவாக உச்சரித்து, ஹரக்கத் கால அளவைச் சரியாகப் பேணவும்.',
        makhrajTip: 'Keep mouth relaxed and focus breath at the exact point of articulation.',
        makhrajTipTa: 'வாயைத் தளர்த்தி, உச்சரிப்பு தானத்தில் கவனத்தைச் செலுத்தவும்.',
        tajweedRuleName: 'Makharij & Tajweed Foundation',
        accuracyRating: 'Good',
        suggestedPractice: 'Repeat 3 times with steady breath control.',
        latencyMs: serverLatency,
      },
      { status: 200 }
    );
  }
}
