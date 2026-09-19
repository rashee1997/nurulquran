import { convertToModelMessages, streamText, tool, stepCountIs, type ToolSet, type UIMessage } from 'ai';
import { getAyahTafsir, getSurahContext, TAFSIR_TOOL_EDITIONS } from '@/lib/ai/scholar-tools';
import { z } from 'zod';
import { NextRequest } from 'next/server';
import { resolveAIModel, serverGeminiApiKey } from '@/lib/ai/resolver';
import { quranProvider, QuranWordNotFoundError } from '@/lib/quran/alquran-cloud';
import { getChapterMetadata } from '@/lib/quran/surahs';
import { TAJWEED_META } from '@/lib/quran/tajweed';
import type { TajweedRule } from '@/lib/quran/types';
import { chatRequestSchema, parseWithSchema } from '@/lib/api/schemas';
import { apiError, guardRequest, NOT_CONFIGURED, RATE_LIMITED } from '@/lib/api/http';
import { byokAwareRateLimit } from '@/lib/api/rate-limit';
import { UnsafeProviderUrlError } from '@/lib/api/url-guard';
import { AIProviderConfig } from '@/lib/ai/types';
import { PROVIDER_DEFAULT_MODELS } from '@/lib/ai/models';

export const maxDuration = 45;

const RATE_LIMIT = { limit: 40, windowMs: 60_000 };
const MAX_REQUEST_BYTES = 256_000;

/**
 * The tafsir tool's edition keys and its model-facing edition list, both derived from the
 * edition registry.
 *
 * They were hand-written here before, so adding an edition to `TAFSIR_TOOL_EDITIONS` left the
 * tool schema — and therefore the model — still describing the old set, and the assistant could
 * only ever be asked for the three editions that happened to be spelled out.
 */
const TAFSIR_TOOL_EDITION_KEYS = Object.keys(TAFSIR_TOOL_EDITIONS) as [string, ...string[]];
const TAFSIR_TOOL_EDITION_LIST = Object.entries(TAFSIR_TOOL_EDITIONS)
  .map(([key, edition]) => `${key} (${edition.name})`)
  .join(', ');

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
    const current = order[index];
    const swapTarget = order[swapWith];
    if (current === undefined || swapTarget === undefined) continue;
    [order[index], order[swapWith]] = [swapTarget, current];
  }
  return order;
}

function shuffleWithSeed<T>(items: readonly T[], seed: string): T[] {
  const order = seededOrder(seed, items.length);
  return order.map((index) => items[index]).filter((item) => item !== undefined);
}

/**
 * Signals that a turn is about scripture and must be answered from retrieved text.
 *
 * Arabic script, a verse reference (`2:255`), or an explicitly Quranic subject. Everything else
 * — a greeting, "what can you help me with", a question about how to use the app — is a turn the
 * assistant can answer directly.
 */
const GROUNDING_PATTERN =
  /[\u0600-\u06FF]|\b\d{1,3}\s*:\s*\d{1,3}\b|\b(surah|sura|ayah|ayat|verse|tafsir|tafseer|tajweed|quran|qur'an|juz|makhraj|hifz|recit\w*|memoris\w*|memoriz\w*)\b/i;

/**
 * Whether the latest learner turn requires a tool call before the model may answer.
 *
 * The first step used to force `toolChoice: 'required'` unconditionally, so "hello" cost a
 * scripture retrieval: the model had to run `getVerse` on Al-Fatihah 1:1 before it was allowed
 * to greet anyone. The zero-hallucination policy is unchanged — anything that could involve
 * Quranic text, a translation or a commentary still cannot be answered without a tool result.
 * When the turn carries no text at all (an attachment-only or part-based turn we cannot read)
 * grounding is required, so an unreadable payload can never take the ungrounded path.
 */
function requiresGrounding(messages: readonly UIMessage[]): boolean {
  const lastUser = [...messages].reverse().find((message) => message.role === 'user');
  if (!lastUser) return true;

  const text = lastUser.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join(' ')
    .trim();
  if (text.length === 0) return true;

  return GROUNDING_PATTERN.test(text);
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = guardRequest(req, { maxBytes: MAX_REQUEST_BYTES });
  if (!guard.ok) return guard.response;

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

  /*
   * Provider configuration comes from the request body only.
   *
   * Four `x-byok-*` headers (`key`, `baseurl`, `provider`, `model`) used to be read here as an
   * alternative channel. Nothing in the app ever sent them — `TutorPanel` and the provider
   * probe both put the same fields in the JSON body — so they were dead code that only widened
   * the surface of an unauthenticated route: any client could point the server at an arbitrary
   * OpenAI-compatible host and have it forwarded with a caller-supplied credential. The body
   * channel is the one the app actually uses and the one `providerConfigSchema` validates.
   */
  const providerConfig = parsed.data.providerConfig;
  const vendor = providerConfig?.type ?? 'gemini';
  const byokKey = providerConfig?.apiKey;

  // A caller supplying their own provider key spends their own quota, not the shared
  // server key, so it gets its own bucket with more headroom instead of sharing the
  // server-key pool's strict limit.
  const rate = byokAwareRateLimit(req, 'study-assistant', RATE_LIMIT, byokKey);
  if (!rate.allowed) {
    return apiError({
      status: 429,
      code: 'rate_limited',
      message: RATE_LIMITED,
      headers: { 'Retry-After': `${rate.retryAfterSeconds}` },
    });
  }

  const config: Partial<AIProviderConfig> = {
    type: vendor,
    apiKey: providerConfig?.apiKey,
    baseUrl: providerConfig?.baseUrl,
    selectedModel: providerConfig?.selectedModel ?? PROVIDER_DEFAULT_MODELS[vendor],
  };

  // A server-side Gemini call needs a server key unless the learner supplied their own.
  if (vendor === 'gemini' && !config.apiKey && !serverGeminiApiKey()) {
    return apiError({ status: 503, code: 'not_configured', message: NOT_CONFIGURED });
  }

  /*
   * Client-supplied system prompts could override the grounding rules, so only
   * user/assistant turns are forwarded. UI messages (id + parts, from useChat) and
   * legacy plain turns (role + content) are both accepted and normalised.
   *
   * The lesson packet a voice-lesson turn needs therefore arrives in `lessonContext`, which is
   * appended to this route's own system prompt rather than forwarded as a turn. The same rule
   * applies to it: it supplies *material* and a voice, never a replacement set of rules.
   */
  const uiMessages: UIMessage[] = parsed.data.messages
    .filter((message) => message.role !== 'system')
    .map((message, index): UIMessage => ({
      id: message.id ?? `msg-${index}`,
      role: message.role as 'user' | 'assistant',
      parts:
        message.parts && message.parts.length > 0
          ? (message.parts as UIMessage['parts'])
          : [{ type: 'text' as const, text: message.content ?? '' }],
    }));

  if (uiMessages.length === 0) {
    return apiError({
      status: 400,
      code: 'invalid_request',
      message: 'At least one user message is required.',
    });
  }

  const systemPrompt = `You are Ustadh NurulQuran, a mature and dignified Quran teacher (Murabbi) and Arabic linguist.
You are patient, academically rigorous, respectful, and pedagogically clear. You never use hype, flattery, conversational filler, or invented praise. You teach with English and Tamil support.

CRITICAL INVARIANT — ZERO HALLUCINATION POLICY:
- You are STRICTLY PROHIBITED from generating, completing, paraphrasing or "correcting" Quranic verse text, word roots, translations or exegesis from your own memory.
- For ANY citation or explanation involving verse text, you MUST call 'getVerse' or 'getWordDetails', and quote only what the tool returns.
- For ANY request for tafseer (exegesis), you MUST call 'getAyahTafsir' and attribute the named edition you were given (e.g. "Tafsir Ibn Kathir", "English Al-Mukhtasar", "Tamil Mokhtasar"). Quote only what it returns.
- For ANY question about a surah's background, revelation period or themes, you MUST call 'getSurahContext' and cite its source. Never supply period-of-revelation or occasion-of-revelation details from memory.
- If a tool returns an error or no data, say plainly that you could not retrieve the text, and do not supply it from memory.
- Use authentic diacritics exactly as returned by the tools; never add or remove them.
- Tamil has no classical tafsir edition beyond Tamil Mokhtasar: when the learner asks for Tamil exegesis beyond what the tool returns, say so and offer a faithful rendering of the cited English/Arabic source, clearly labelled as a rendering, never as a classical quote.

TEACHING STRUCTURE — for exegesis answers, follow this order:
1. Scripture: recite the verse (from getVerse) with full diacritics, then its English and Tamil translations.
2. Context: revelation place and background (from getSurahContext), in two or three sentences.
3. Exegesis: the commentary from getAyahTafsir, attributed to the named edition; use a blockquote for a direct scholar quote.
4. Reflection: two or three practical lessons for daily life, in the learner's language.

RENDERING — GitHub-Flavored Markdown:
- Vocabulary and word-by-word breakdowns: a Markdown table (Arabic | Transliteration | English | Tamil).
- Direct scholar statements: blockquotes. Key terms: bold.
- Arabic always in its own right-to-left paragraph; Tamil in natural idiomatic Tamil.
- Keep the structure scannable: short sections with bold headers matching the four steps above.

Be warm but measured, and remind students of patience and consistency.`;

  /*
   * Lesson context, when the caller supplied it.
   *
   * Appended after the rules above so the zero-hallucination invariant always wins, and framed
   * so the model can adopt the lesson's voice ("you are Ustadh Ameen") without treating the
   * packet as a licence to recite from memory.
   */
  const lessonContext = parsed.data.lessonContext?.trim();
  const effectiveSystemPrompt = lessonContext
    ? `${systemPrompt}\n\n---\n\n## LESSON PACKET (supplied by the lesson surface for this turn)\nThe block below is authoritative reference material for this turn. It may name a voice and a register for a children's lesson; adopt that voice for your reply. It does NOT relax the CRITICAL INVARIANT above: recite only the Arabic it contains and explain only from the commentary it contains.\n\n${lessonContext}`
    : systemPrompt;

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

    getAyahTafsir: tool({
      description: `Fetch authoritative tafseer (exegesis) for one ayah from a named scholarly edition. Always cite the edition the tool reports. Editions: ${TAFSIR_TOOL_EDITION_LIST}.`,
      inputSchema: z.object({
        surah: z.number().int().min(1).max(114),
        ayah: z.number().int().min(1),
        edition: z.enum(TAFSIR_TOOL_EDITION_KEYS).describe('Tafseer edition to consult'),
      }),
      execute: async ({ surah, ayah, edition }) => {
        try {
          const result = await getAyahTafsir(surah, ayah, edition);
          if (!result) {
            return {
              error: `The ${edition} edition has no entry for ${surah}:${ayah}. State that plainly; do not supply commentary from memory.`,
            };
          }
          return result;
        } catch {
          return {
            error: `Tafseer for ${surah}:${ayah} could not be retrieved right now. Say so; do not supply commentary from memory.`,
          };
        }
      },
    }),

    getSurahContext: tool({
      description:
        "Fetch a surah's names, revelation place (Makki/Madani), verse count, and — when the chapter-info service is reachable — its period of revelation, themes and objectives from Maududi's Tafhim al-Qur'an. Always cite the reported source.",
      inputSchema: z.object({
        surah: z.number().int().min(1).max(114),
      }),
      execute: async ({ surah }) => {
        return getSurahContext(surah);
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
            /*
             * Distractors are spread across the whole rule set, not taken in declaration
             * order.
             *
             * `Object.keys(TAJWEED_META).filter(≠ answer).slice(0, 3)` always produced the
             * same three rules for nearly every question (the first three keys, minus the
             * answer), so the options became recognisable by elimination instead of by
             * recognising the rule — the opposite of what a Tajweed quiz is for. The window
             * now starts at a per-question offset and wraps, so every rule is eligible.
             */
            const allRules = Object.keys(TAJWEED_META) as TajweedRule[];
            const others = allRules.filter((rule) => rule !== target.rule);
            const offset = seededOrder(`${reference}:${target.rule}`, others.length)[0] ?? 0;
            const distractors = Array.from(
              { length: Math.min(3, others.length) },
              (_, index) => others[(offset + index) % others.length]
            );
            const options = shuffleWithSeed(
              [target.rule, ...distractors],
              `${surah}:${ayah}:${target.rule}:tajweed`
            );
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
          /*
           * Distractors must be *distinct* from the answer and from each other. Taking
           * `slice(1, 4)` blindly could hand the learner a question whose correct option
           * appears twice (two words in a verse often share an English gloss), which makes
           * the "correct" answer ambiguous rather than testing recall.
           */
          const target = words[0];
          if (!target) {
            return { available: false, reason: 'This verse contains no word-level data.' };
          }
          const otherMeanings = Array.from(
            new Set(
              words
                .slice(1)
                .map((word) => word.translationEn)
                .filter((meaning) => meaning !== target.translationEn)
            )
          ).slice(0, 3);
          if (otherMeanings.length < 2) {
            return {
              available: false,
              reason: 'This verse does not contain enough distinct word meanings to build an unambiguous multiple-choice question.',
            };
          }
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

  const groundingRequired = requiresGrounding(uiMessages);

  try {
    const model = resolveAIModel(config);

    const result = streamText({
      model,
      system: effectiveSystemPrompt,
      messages: await convertToModelMessages(uiMessages),
      stopWhen: stepCountIs(5),
      tools,
      // Force a deterministic tool call on the first step whenever the turn is about
      // scripture, so such an answer is always grounded in retrieved text rather than model
      // memory. A turn with no Quranic subject is answered directly instead of paying for a
      // retrieval it cannot use.
      prepareStep: ({ stepNumber }) =>
        stepNumber === 0 && groundingRequired ? { toolChoice: 'required' as const } : {},
    });

    // UI message stream: the client's useChat receives tool invocations as parts, so
    // verified retrievals render as citation cards instead of vanishing into plain text.
    return result.toUIMessageStreamResponse();
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
