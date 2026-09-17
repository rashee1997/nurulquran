/**
 * Tafseer lesson module — storyteller persona and dynamic context injection.
 *
 * Pure string builders shared by the browser (Gemini Live session setup) and the server
 * (reflection evaluation), so the child hears and is graded by the same persona.
 *
 * The grounding rules below are not decoration. Two facts found during API reconnaissance
 * are encoded in them directly:
 *
 *  1. The occasion-of-revelation edition is **sparse** — it carries only verses with a
 *     recorded cause, and it has no file at all for sūrahs 108, 112, 113 and 114, which are
 *     the first sūrahs a child studies. So "no historical cause is available" is the normal
 *     case, and the persona is forbidden from inventing one.
 *  2. The Arabic text is supplied by the app's verified Quran provider, not by this module,
 *     and is the only scripture the model may recite. Human exegesis is never delivered as
 *     if it were revelation.
 */

import type { TafsirLessonSegment } from './types';
import { ENGLISH_EDITION, TAMIL_EDITION } from './editions';

export type LanguagePreference = 'both' | 'en' | 'ta';

/**
 * Hard cap on exegesis injected into a single turn.
 *
 * The default Mukhtasar pair needs 2–4 KB. The optional scholarly edition reaches 51 KB for
 * a single ayah (its 1:1 carries a whole sūrah introduction), which would crowd out the
 * spoken conversation. Truncation is marked in-band so the model knows it is reading an
 * excerpt and does not present a cut-off sentence as complete.
 */
export const MAX_EXEGESIS_CHARS = 6_000;

export function truncateExegesis(text: string, limit: number = MAX_EXEGESIS_CHARS): string {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit).trimEnd()} […excerpt truncated at ${limit} characters]`;
}

/**
 * The fixed persona. Sent as the Live session's `systemInstruction` and prepended to the
 * reflection prompt, so the coach has the same voice in both directions.
 */
export const STORYTELLER_PERSONA = `You are Ustadh Ameen, a warm Quranic storyteller and teacher for a ten-year-old child.
You are speaking aloud: short sentences, everyday words, no lecturing.

## Register
- Explain the exegesis as a vivid, exciting story the child can retell to a friend.
- Use simple, concrete comparisons from a child's world — a lantern in a dark room, a
  friend who always keeps a promise, sharing a snack, a compass on a journey.
- Teach one idea at a time, then pause and ask one short reflective check-in question.
- Keep each answer to roughly 60–120 spoken words, then invite the child to speak.
  Never monologue.
- Praise effort specifically: "You noticed that Ar-Rahman means mercy — that is the key!"
- If the child seems confused or is silent, simplify and offer a different comparison.

## Grounding rules — non-negotiable
- The Arabic ayah in the context below is the ONLY scripture you may recite. Never add,
  complete, paraphrase or "correct" Quranic Arabic, and never produce an ayah that was not
  given to you.
- Never recite the English or Tamil commentary as if it were revelation. It is human
  explanation; retell it in your own child-friendly words.
- The supplied commentary is your source of truth for meaning. If it does not say
  something, you do not know it. Say so plainly: "That is a wonderful question, and I do
  not have it in our lesson today. Let us ask your teacher."
- Never invent a cause of revelation. If OCCASION OF REVELATION below is absent or marked
  ABSENT, you must not narrate any historical event, person, battle or incident as the
  reason this ayah was revealed. Instead say: "This surah teaches us a big idea…" and teach
  the theme.
- Never issue religious rulings, never contradict a scholar, and never speculate about the
  unseen.
- Attribute honestly: "our lesson's tafsir explains…", never "Allah says…" about anything
  that came from a commentary.`;

function languageGuidance(preference: LanguagePreference): string {
  if (preference === 'en') {
    return 'CHILD\'S LANGUAGE PREFERENCE: English only. Speak and write in English.';
  }
  if (preference === 'ta') {
    return 'CHILD\'S LANGUAGE PREFERENCE: Tamil only. Speak and write in authentic Tamil (தமிழ்).';
  }
  return `CHILD'S LANGUAGE PREFERENCE: Bilingual.
- Teach the idea in clear English first.
- Then restate the key sentence in simple Tamil (தமிழ்) so the child follows along.`;
}

/**
 * Builds the per-ayah context packet.
 *
 * Re-sent on every ayah change so the Live session never drifts onto the previous verse.
 */
export function buildLessonContextPacket(
  segment: TafsirLessonSegment,
  preference: LanguagePreference
): string {
  const english = segment.tafsir.en.text.trim();
  const tamil = segment.tafsir.ta.text.trim();
  const asbab = segment.asbab?.text.trim();

  return `=== LESSON CONTEXT (current ayah) ===
SURAH: ${segment.surah} — ${segment.surahNameSimple} (${segment.surahNameArabic}) · ${segment.versesCount} ayahs
LESSON SEGMENT: ayah ${segment.ayah} of ${segment.versesCount}

ARABIC AYAH (this is the only scripture you may recite):
${segment.textUthmani}

LITERAL TRANSLATION (English): ${segment.translationEn || '(not available)'}
LITERAL TRANSLATION (Tamil): ${segment.translationTa || '(not available)'}

EXEGESIS — ENGLISH (${ENGLISH_EDITION.name}, ${ENGLISH_EDITION.author}):
${english.length > 0 ? truncateExegesis(english) : '(no commentary available for this ayah — teach from the translation only, and say that the commentary is unavailable rather than inventing one)'}

EXEGESIS — TAMIL (${TAMIL_EDITION.name}, ${TAMIL_EDITION.author}):
${tamil.length > 0 ? truncateExegesis(tamil) : '(no Tamil commentary available for this ayah)'}

OCCASION OF REVELATION (Asbab al-Nuzul):
${
  asbab && asbab.length > 0
    ? truncateExegesis(asbab, 2_500)
    : 'ABSENT — no recorded occasion of revelation is available for this ayah. Do NOT narrate any historical cause. Teach the theme instead.'
}

${languageGuidance(preference)}`;
}

/** Persona + context, ready to hand to the Live session or the reflection route. */
export function buildStorytellerInstruction(
  segment: TafsirLessonSegment,
  preference: LanguagePreference
): string {
  return `${STORYTELLER_PERSONA}

${buildLessonContextPacket(segment, preference)}

## Opening beat for a newly loaded ayah
1. Say gently: "أعوذ بالله من الشيطان الرجيم", then "بسم الله الرحمن الرحيم".
2. Recite the Arabic ayah once, slowly.
3. Ask: "Would you like to hear the story behind this ayah?"
Then wait for the child.`;
}

/** Prompt for grading a child's spoken or typed reflection on one ayah. */
export function buildReflectionPrompt(
  segment: TafsirLessonSegment,
  preference: LanguagePreference,
  childWords: string | undefined,
  hasAudio: boolean
): string {
  const mode = hasAudio
    ? 'The child answered with their VOICE. Listen to the recording and grade only what you can actually hear.'
    : 'The child answered in writing.';

  const answerLabel =
    childWords && childWords.trim().length > 0
      ? `CHILD'S WRITTEN ANSWER: "${childWords.trim()}"`
      : 'CHILD\'S WRITTEN ANSWER: (none — the answer is in the voice recording)';

  return `You are grading a ten-year-old child's understanding of one ayah, as Ustadh Ameen.

${buildLessonContextPacket(segment, preference)}

${mode}
${answerLabel}

Judge only what the child actually said. If the recording is silent, unintelligible, or about
something else, set "verdict" to "needs_story" and gently offer to tell the story again —
never award understanding that was not demonstrated, and never invent a quote from the child.

Respond ONLY with valid JSON in exactly this shape:
{
  "encouragement": "<1-2 warm, specific sentences addressed to the child, naming something they actually said>",
  "explanation": "<3-5 short sentences that confirm or gently correct their answer, grounded strictly in the commentary above>",
  "followUpQuestion": "<one short question that invites the child to think further>",
  "verdict": "<understood | partly | needs_story>"
}`;
}
