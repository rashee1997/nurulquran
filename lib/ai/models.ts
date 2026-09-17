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
