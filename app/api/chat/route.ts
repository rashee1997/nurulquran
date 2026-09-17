import { streamText, tool, stepCountIs, type ToolSet } from 'ai';
import { z } from 'zod';
import { NextRequest } from 'next/server';
import { resolveAIModel, serverGeminiApiKey } from '@/lib/ai/resolver';
import { quranProvider, QuranWordNotFoundError } from '@/lib/quran/alquran-cloud';
import { getChapterMetadata } from '@/lib/quran/surahs';
import { TAJWEED_META } from '@/lib/quran/tajweed';
import { aiProviderVendorSchema, chatRequestSchema, parseWithSchema } from '@/lib/api/schemas';
import { apiError, guardRequest, NOT_CONFIGURED, RATE_LIMITED } from '@/lib/api/http';
import { callerKey, checkRateLimit } from '@/lib/api/rate-limit';
import { UnsafeProviderUrlError } from '@/lib/api/url-guard';
import { AIProviderConfig } from '@/lib/ai/types';
import { PROVIDER_DEFAULT_MODELS } from '@/lib/ai/models';

export const maxDuration = 45;

const RATE_LIMIT = { limit: 40, windowMs: 60_000 };
const MAX_REQUEST_BYTES = 256_000;

/** Deterministic ordering helper so quiz options are stable and unbiased. */
function seededOrder(seed: string, length: number): number[] {
  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const order = Array.from({ length }, (_, index) => index);
  for (let index = order.length - 1; index > 0; index--) {
    hash = (Math.imul(hash, 48271) + 11) % 2147483647;
    const swapWith = hash % (index + 1);
    [order[index], order[swapWith]] = [order[swapWith], order[index]];
  }
  return order;
}

function shuffleWithSeed<T>(items: readonly T[], seed: string): T[] {
  const order = seededOrder(seed, items.length);
  return order.map((index) => items[index]);
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = guardRequest(req, { maxBytes: MAX_REQUEST_BYTES });
  if (!guard.ok) return guard.response;

  const rate = checkRateLimit({ key: callerKey(req, 'study-assistant'), ...RATE_LIMIT });
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

  const parsed = parseWithSchema(chatRequestSchema, body);
  if (!parsed.ok) {
    return apiError({ status: 400, code: 'invalid_request', message: parsed.message });
  }

  const headerKey = req.headers.get('x-byok-key') ?? undefined;
  const headerBaseUrl = req.headers.get('x-byok-baseurl') ?? undefined;
  const headerProviderRaw = req.headers.get('x-byok-provider');
  const headerModel = req.headers.get('x-byok-model') ?? undefined;

  const headerProvider = headerProviderRaw
    ? aiProviderVendorSchema.safeParse(headerProviderRaw)
    : null;

  const providerConfig = parsed.data.providerConfig;
  const vendor = providerConfig?.type ?? headerProvider?.data ?? 'gemini';

  const config: Partial<AIProviderConfig> = {
    type: vendor,
    apiKey: providerConfig?.apiKey ?? headerKey,
    baseUrl: providerConfig?.baseUrl ?? headerBaseUrl,
    selectedModel: providerConfig?.selectedModel ?? headerModel ?? PROVIDER_DEFAULT_MODELS[vendor],
  };

  // A server-side Gemini call needs a server key unless the learner supplied their own.
  if (vendor === 'gemini' && !config.apiKey && !serverGeminiApiKey()) {
    return apiError({ status: 503, code: 'not_configured', message: NOT_CONFIGURED });
  }

  // Client-supplied system prompts could override the grounding rules, so only
  // user/assistant turns are forwarded.
  const messages = parsed.data.messages.filter(
    (message): message is { role: 'user' | 'assistant'; content: string } => message.role !== 'system'
  );

  if (messages.length === 0) {
    return apiError({
      status: 400,
      code: 'invalid_request',
      message: 'At least one user message is required.',
    });
  }

  const systemPrompt = `You are a scholarly, encouraging Quran tutor, Arabic linguist and Hifz mentor named "NurulQuran AI".
You guide students in Arabic reading, Quranic recitation with Tajweed, memorisation (Hifz) and linguistic understanding, with English and Tamil support.

CRITICAL INVARIANT — ZERO HALLUCINATION POLICY:
- You are STRICTLY PROHIBITED from generating, completing, paraphrasing or "correcting" Quranic verse text, word roots or translations from your own memory.
- For ANY citation or explanation involving verse text, you MUST call 'getVerse' or 'getWordDetails', and quote only what the tool returns.
- If a tool returns an error or no data, say plainly that you could not retrieve the text, and do not supply it from memory.
- Use authentic diacritics exactly as returned by the tools; never add or remove them.
- Be warm and encouraging, and remind students of patience and consistency.`;

  const tools: ToolSet = {
    getVerse: tool({
      description:
        'Fetch authentic Uthmani Quranic verse text with verified English and Tamil translations, audio URL and Tajweed rule count. Always call this before referencing a verse.',
      inputSchema: z.object({
        surah: z.number().int().min(1).max(114).describe('Surah number (1-114)'),
        ayah: z.number().int().min(1).describe('Ayah number within the surah'),
      }),
      execute: async ({ surah, ayah }) => {
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
            tajweedRulesCount: verse.tajweed?.segments.filter((segment) => segment.rule).length ?? 0,
            provenance: verse.provenance ?? 'network',
          };
        } catch (error: unknown) {
          return { error: `Verse ${surah}:${ayah} could not be retrieved. State that to the student and do not quote it.` };
        }
      },
    }),

    getWordDetails: tool({
      description:
        'Fetch the root, morphology, transliteration and English/Tamil meaning of a specific word in an ayah.',
      inputSchema: z.object({
        surah: z.number().int().min(1).max(114),
        ayah: z.number().int().min(1),
        wordIndex: z.number().int().min(1).describe('1-based word position in the verse'),
      }),
      execute: async ({ surah, ayah, wordIndex }) => {
        try {
          const word = await quranProvider.getWordData({ surah, ayah, word: wordIndex });
          return {
            wordKey: `${surah}:${ayah}:${wordIndex}`,
            arabic: word.arabic,
            transliteration: word.transliteration,
            root: word.root ?? null,
            morphology: word.morphology ?? null,
            translationEn: word.translationEn,
            translationTa: word.translationTa,
            note:
              word.root || word.translationEn
                ? undefined
                : 'No lexical entry is stored for this word; do not invent a root or meaning for it.',
          };
        } catch (error: unknown) {
          if (error instanceof QuranWordNotFoundError) {
            return { error: error.message };
          }
          return { error: `Word data for ${surah}:${ayah}:${wordIndex} is unavailable right now.` };
        }
      },
    }),

    searchQuranText: tool({
      description:
        'Search Quranic Arabic, English or Tamil text. Use this to find where a phrase occurs. Matching ignores diacritics.',
      inputSchema: z.object({
        query: z.string().min(1).max(120),
        surah: z.number().int().min(1).max(114).optional().describe('Restrict the search to one surah'),
        limit: z.number().int().min(1).max(25).optional(),
      }),
      execute: async ({ query, surah, limit }) => {
        const results = await quranProvider.search({ query, surah, limit });
        return {
          count: results.length,
          scope: results[0]?.scope ?? 'none',
          results: results.map((result) => ({
            ref: `${result.surah}:${result.ayah}`,
            surahName: result.surahName,
            matchedField: result.matchType,
            text: result.text,
          })),
        };
      },
    }),

    getStudySuggestions: tool({
      description:
        'Suggest verified verses to study for a surah. Spaced-repetition scheduling lives in the learner browser storage and is NOT available to this server, so never present these as "due" items.',
      inputSchema: z.object({
        surah: z.number().int().min(1).max(114).optional().describe('Surah to draw suggestions from'),
        count: z.number().int().min(1).max(6).optional(),
      }),
      execute: async ({ surah, count = 4 }) => {
        const targetSurah = surah ?? 1;
        const chapter = getChapterMetadata(targetSurah);
        const verses = await quranProvider
          .getVerses({ surah: targetSurah, startAyah: 1, endAyah: Math.min(chapter.versesCount, count) })
          .catch(() => []);
        return {
          note: 'These are study suggestions from the verified text, not the learner review queue.',
          surahNumber: targetSurah,
          surahName: chapter.nameSimple,
          verses: verses.map((verse) => ({
            ayah: verse.ayah,
            textUthmani: verse.textUthmani,
            translationEn: verse.translationEn,
          })),
        };
      },
    }),

    generateAdaptiveQuiz: tool({
      description:
        'Build a deterministic quiz question from verified verse data. Returns the answer so the assistant can evaluate the learner reply.',
      inputSchema: z.object({
        surah: z.number().int().min(1).max(114),
        ayah: z.number().int().min(1),
        type: z.enum(['word_meaning', 'complete_verse', 'tajweed_rule', 'tamil_translation']),
      }),
      execute: async ({ surah, ayah, type }) => {
        try {
          const verse = await quranProvider.getVerse({ surah, ayah });
          const chapter = getChapterMetadata(surah);
          const reference = `${chapter.nameSimple} ${surah}:${ayah}`;

          if (type === 'complete_verse') {
            const words = verse.textUthmani.split(/\s+/).filter((word) => word.length > 0);
            if (words.length < 2) {
              return { available: false, reason: 'This verse is too short to split into a prompt and an answer.' };
            }
            const splitAt = Math.max(1, Math.floor(words.length / 2));
            return {
              available: true,
              type,
              reference,
              prompt: `Complete this verse: "${words.slice(0, splitAt).join(' ')} …"`,
              correctAnswer: words.slice(splitAt).join(' '),
              fullVerse: verse.textUthmani,
              translationEn: verse.translationEn,
              translationTa: verse.translationTa,
              note: 'Recall question — do not show the answer until the learner has attempted it.',
            };
          }

          if (type === 'tajweed_rule') {
            const ruled = (verse.tajweed?.segments ?? []).filter((segment) => segment.rule);
            const target = ruled[0];
            if (!target?.rule) {
              return { available: false, reason: 'No Tajweed rule is detectable in this verse from the script.' };
            }
            const distractors = Object.keys(TAJWEED_META)
              .filter((rule) => rule !== target.rule)
              .slice(0, 3);
            const options = shuffleWithSeed([target.rule, ...distractors], `${surah}:${ayah}:tajweed`);
            return {
              available: true,
              type,
              reference,
              prompt: `Which Tajweed rule applies to "${target.text}" in ${reference}? Use the rule keys provided.`,
              options,
              correctAnswer: target.rule,
              correctRuleDescription: TAJWEED_META[target.rule].description,
            };
          }

          if (type === 'tamil_translation') {
            if (!verse.translationTa) {
              return { available: false, reason: 'No Tamil translation is available for this verse.' };
            }
            return {
              available: true,
              type,
              reference,
              prompt: `Give the Tamil meaning of ${reference}: "${verse.textUthmani}"`,
              correctAnswer: verse.translationTa,
              note: 'Recall question — reveal the answer only after the attempt.',
            };
          }

          const words = verse.words.filter((word) => word.translationEn.length > 0);
          if (words.length === 0) {
            return {
              available: false,
              reason: 'No word-level lexicon entry exists for this verse, so a word-meaning quiz cannot be built from verified data.',
            };
          }
          const target = words[0];
          const otherMeanings = words.slice(1, 4).map((word) => word.translationEn);
          const options = shuffleWithSeed(
            [target.translationEn, ...otherMeanings],
            `${surah}:${ayah}:words`
          );
          return {
            available: true,
            type,
            reference,
            prompt: `What does "${target.arabic}" mean in ${reference}?`,
            options,
            correctAnswer: target.translationEn,
          };
        } catch (error: unknown) {
          return { available: false, reason: 'Verified verse data could not be retrieved for this quiz.' };
        }
      },
    }),
  };

  try {
    const model = resolveAIModel(config);

    const result = streamText({
      model,
      system: systemPrompt,
      messages,
      stopWhen: stepCountIs(5),
      tools,
      // Force a deterministic tool call on the first step so the answer is always
      // grounded in retrieved scripture rather than model memory.
      prepareStep: ({ stepNumber }) => (stepNumber === 0 ? { toolChoice: 'required' as const } : {}),
    });

    return result.toTextStreamResponse();
  } catch (error: unknown) {
    if (error instanceof UnsafeProviderUrlError) {
      return apiError({ status: 400, code: 'invalid_request', message: error.message });
    }
    console.error('Study assistant request failed.');
    return apiError({
      status: 500,
      code: 'upstream_unavailable',
      message: 'The study assistant could not be reached. Please retry.',
    });
  }
}
