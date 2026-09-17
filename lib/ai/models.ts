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
 * Model the bidirectional Live (storyteller) session is opened with.
 *
 * Verified against the live API, not assumed. Two separate facts were established by
 * probing, and both matter when editing this constant:
 *
 *  1. **The id is `gemini-3.8-live`, not `gemini-3.8-flash-live`.** The `-flash-` variant
 *     does not exist. It is not a Live model that is merely disabled for this key, and it
 *     is not a naming alias — the service rejects it outright.
 *
 *  2. **A successful token mint proves nothing about the model.** `authTokens.create`
 *     accepted the non-existent id and returned a well-formed `auth_tokens/...` credential;
 *     the failure only appeared later, as a WebSocket close (1008) on connect:
 *     "models/gemini-3.8-flash-live is not found for API version v1main, or is not
 *     supported for bidiGenerateContent". The endpoint that reports this is the one that
 *     validates the model, so a "does the token mint?" check must never be used to decide
 *     whether an id is a valid Live model.
 *
 * `bidiGenerateContent` models are exposed on `v1alpha`/`v1beta` only — the stable `v1`
 * surface lists no Live model at all — which is also why the token is minted on `v1alpha`.
 * The SDK's own guidance for ephemeral tokens is `v1alpha` on the connect side too.
 *
 * A single pinned id (rather than a fallback ladder) keeps the model the token is
 * constrained to and the model the client connects with identical by construction; they
 * must match or the service rejects the session. `GEMINI_LIVE_MODEL` overrides it.
 */
export const DEFAULT_GEMINI_LIVE_MODEL = 'gemini-3.8-live';

/**
 * Resolves the Live model on the server, honouring an explicit `GEMINI_LIVE_MODEL` override.
 * Returning a single value keeps the model the token is constrained to and the model the
 * client connects with identical by construction — they must match or the service rejects
 * the session.
 */
export function resolveServerGeminiLiveModel(): string {
  const override =
    typeof process !== 'undefined' && process.env ? process.env.GEMINI_LIVE_MODEL : undefined;
  const trimmed = override?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_GEMINI_LIVE_MODEL;
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
