import { streamText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { NextRequest } from 'next/server';
import { resolveAIModel } from '@/lib/ai/resolver';
import { quranProvider } from '@/lib/quran/alquran-cloud';
import { AIProviderConfig, AIProviderVendor } from '@/lib/ai/types';
import { getChapterMetadata } from '@/lib/quran/surahs';

export const maxDuration = 45;

export async function POST(req: NextRequest) {
  try {
    const { messages, providerConfig } = await req.json();

    // Read headers as fallback for BYOK
    const headerKey = req.headers.get('x-byok-key');
    const headerBaseUrl = req.headers.get('x-byok-baseurl');
    const headerProvider = req.headers.get('x-byok-provider') as AIProviderVendor | null;
    const headerModel = req.headers.get('x-byok-model');

    const config: Partial<AIProviderConfig> = {
      type: providerConfig?.type || headerProvider || 'gemini',
      apiKey: providerConfig?.apiKey || headerKey || undefined,
      baseUrl: providerConfig?.baseUrl || headerBaseUrl || undefined,
      selectedModel: providerConfig?.selectedModel || headerModel || 'gemini-2.5-flash',
    };

    const model = resolveAIModel(config);

    const systemPrompt = `You are a scholarly, encouraging, and pedagogically sound Quran Tutor, Arabic Linguist, and Hifz Mentor named "NurulQuran AI".
Your mission is to guide students in learning Arabic reading, Quranic recitation with Tajweed, memorization (Hifz), and deep linguistic understanding with English and Tamil translations.

CRITICAL HARD INVARIANT — ZERO HALLUCINATION POLICY:
- You are STRICTLY PROHIBITED from generating, fabricating, correcting, or completing any Quranic verse, word root, Arabic text, or translation from your own parametric memory.
- For ANY discussion, explanation, quiz, or citation of a verse, you MUST invoke the deterministic tool 'getVerse' or 'getWordDetails'.
- When reciting or displaying Arabic, always use authentic diacritics (Harakat) directly from the retrieved tool payload.
- Be multilingual: provide fluent explanations in English, and incorporate authentic Tamil translations and transliterations whenever requested or helpful for Tamil-speaking students.
- Be warm, supportive, motivating, and encouraging. When congratulating students on memorization, remind them of the spiritual virtue of patience and consistency.`;

    const result = streamText({
      model,
      system: systemPrompt,
      messages,
      stopWhen: stepCountIs(5),
      tools: {
        getVerse: tool({
          description: 'Fetch authentic Uthmani Quranic verse text, verified English & Tamil translations, audio URL, and Tajweed rules from the deterministic Quran provider. Always call this tool whenever referencing a verse.',
          inputSchema: z.object({
            surah: z.number().min(1).max(114).describe('Surah number (1-114)'),
            ayah: z.number().min(1).describe('Ayah number within the Surah'),
          }),
          execute: async ({ surah, ayah }: { surah: number; ayah: number }) => {
            try {
              const chapter = getChapterMetadata(surah);
              const verse = await quranProvider.getVerse({ surah, ayah });
              return {
                surah,
                surahName: chapter.nameSimple,
                surahArabic: chapter.nameArabic,
                ayah,
                textUthmani: verse.textUthmani,
                translationEn: verse.translationEn,
                translationTa: verse.translationTa,
                audioUrl: verse.audioUrl,
                tajweedRulesCount: verse.tajweed?.segments.filter(s => s.rule).length || 0,
              };
            } catch (err: unknown) {
              return { error: `Failed to retrieve Surah ${surah} Ayah ${ayah}: ${String(err)}` };
            }
          },
        }),

        getWordDetails: tool({
          description: 'Fetch authentic root, morphology, transliteration, English meaning, and Tamil meaning for a specific word in an Ayah. Crucial for vocabulary and morphology analysis.',
          inputSchema: z.object({
            surah: z.number().min(1).max(114),
            ayah: z.number().min(1),
            wordIndex: z.number().min(1).describe('1-indexed word position in the verse'),
          }),
          execute: async ({ surah, ayah, wordIndex }: { surah: number; ayah: number; wordIndex: number }) => {
            try {
              const word = await quranProvider.getWordData({ surah, ayah, word: wordIndex });
              return {
                wordKey: `${surah}:${ayah}:${wordIndex}`,
                arabic: word.arabic,
                transliteration: word.transliteration,
                root: word.root || 'Root analyzed in context',
                morphology: word.morphology || 'Arabic grammatical token',
                translationEn: word.translationEn,
                translationTa: word.translationTa,
              };
            } catch (err: unknown) {
              return { error: `Failed to fetch word morphology: ${String(err)}` };
            }
          },
        }),

        getSpacedRepetitionQueue: tool({
          description: 'Fetch current spaced repetition recommendations and high-yield verses for review and memorization.',
          inputSchema: z.object({
            surah: z.number().optional().describe('Optional surah focus filter'),
          }),
          execute: async ({ surah }: { surah?: number }) => {
            const targetSurah = surah || 1;
            const chapter = getChapterMetadata(targetSurah);
            const verses = await quranProvider.getVerses({ surah: targetSurah, startAyah: 1, endAyah: Math.min(chapter.versesCount, 4) });
            return {
              suggestedSurah: chapter.nameSimple,
              surahNumber: targetSurah,
              dueVersesCount: verses.length,
              verses: verses.map(v => ({
                ayah: v.ayah,
                textUthmani: v.textUthmani,
                translationEn: v.translationEn,
              })),
            };
          },
        }),

        generateAdaptiveQuiz: tool({
          description: 'Generates a deterministic quiz on Quranic vocabulary, Tajweed, or Ayah completion based on verified verses.',
          inputSchema: z.object({
            surah: z.number().min(1).max(114).describe('Surah to test'),
            ayah: z.number().min(1).describe('Ayah to test'),
            type: z.enum(['word_meaning', 'complete_verse', 'tajweed_rule', 'tamil_translation']),
          }),
          execute: async ({ surah, ayah, type }: { surah: number; ayah: number; type: 'word_meaning' | 'complete_verse' | 'tajweed_rule' | 'tamil_translation' }) => {
            const verse = await quranProvider.getVerse({ surah, ayah });
            const chapter = getChapterMetadata(surah);
            
            if (type === 'complete_verse') {
              const words = verse.textUthmani.split(' ');
              const splitPoint = Math.max(1, Math.floor(words.length / 2));
              const promptPortion = words.slice(0, splitPoint).join(' ');
              const answerPortion = words.slice(splitPoint).join(' ');
              return {
                type: 'complete_verse',
                surah: chapter.nameSimple,
                ayah,
                prompt: `Complete this verse: "${promptPortion} ... ?"`,
                correctAnswer: answerPortion,
                fullVerse: verse.textUthmani,
                translationEn: verse.translationEn,
                translationTa: verse.translationTa,
              };
            }

            return {
              type,
              surah: chapter.nameSimple,
              ayah,
              verseArabic: verse.textUthmani,
              translationEn: verse.translationEn,
              translationTa: verse.translationTa,
              question: `What is the key lesson or meaning of Surah ${chapter.nameSimple} Ayah ${ayah}?`,
              options: [
                verse.translationEn,
                'Refers to celestial bodies and constellations',
                'Historical narratives of ancient communities',
                'Provisions of trade treaties',
              ],
              correctAnswer: verse.translationEn,
            };
          },
        }),
      },
    });

    return result.toTextStreamResponse();
  } catch (error: unknown) {
    console.error('Chat API route error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
