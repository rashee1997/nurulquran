import type { AIProviderVendor } from './types';

/**
 * Single source of truth for model identifiers.
 *
 * These previously drifted across the codebase (`gemini-3.8-flash`,
 * `gemini-2.5-flash`, `gemini-3.1-flash-tts-preview`), so a settings screen could
 * configure a provider with a model id that every server route disagreed with.
 * Server routes may override the text model with the `GEMINI_MODEL` env var.
 */

export const DEFAULT_GEMINI_TEXT_MODEL = 'gemini-3.8-flash';
export const DEFAULT_GEMINI_TTS_MODEL = 'gemini-3.1-flash-tts-preview';

/**
 * Models the bidirectional Live (storyteller) session is opened with.
 *
 * Tried in order. This is a resolution *ladder*, not a claim about any single id: Live
 * audio support is model- and account-specific, so the first entry that successfully
 * mints an ephemeral token is the one actually used, and the route reports the winner back
 * to the client. An operator can pin one by setting `GEMINI_LIVE_MODEL`.
 */
export const DEFAULT_GEMINI_LIVE_MODEL = 'gemini-3.8-flash';

export const GEMINI_LIVE_MODEL_CANDIDATES: readonly string[] = [
  DEFAULT_GEMINI_LIVE_MODEL,
  'gemini-2.0-flash-live-001',
  'gemini-live-2.5-flash-preview',
];

/**
 * Resolves the ordered list of Live models to try, with an explicit override first.
 * Returns a single-element list when the operator has pinned a model, so a typo fails
 * visibly instead of silently falling through to a default.
 */
export function resolveServerGeminiLiveModels(): string[] {
  const override =
    typeof process !== 'undefined' && process.env ? process.env.GEMINI_LIVE_MODEL : undefined;
  const trimmed = override?.trim();
  return trimmed && trimmed.length > 0 ? [trimmed] : [...GEMINI_LIVE_MODEL_CANDIDATES];
}

/** Per-vendor fallback model shown when adding a provider in Settings → AI. */
export const PROVIDER_DEFAULT_MODELS: Record<AIProviderVendor, string> = {
  gemini: DEFAULT_GEMINI_TEXT_MODEL,
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-20241022',
  groq: 'llama-3.3-70b-versatile',
  mistral: 'mistral-small-latest',
  openrouter: 'google/gemini-2.5-flash',
  custom: 'local-model',
};

/**
 * Resolves the Gemini text model on the server, honouring an explicit override.
 * Returns the compile-time default when no override is configured.
 */
export function resolveServerGeminiModel(): string {
  const override =
    typeof process !== 'undefined' && process.env ? process.env.GEMINI_MODEL : undefined;
  const trimmed = override?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_GEMINI_TEXT_MODEL;
}
