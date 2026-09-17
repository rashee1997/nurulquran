import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { LanguageModel } from 'ai';
import { AIProviderConfig } from './types';
import { DEFAULT_GEMINI_TEXT_MODEL, PROVIDER_DEFAULT_MODELS } from './models';
import { assertSafeProviderBaseUrl } from '@/lib/api/url-guard';

/**
 * Resolves an AI LanguageModel dynamically based on user BYOK configuration
 * or server default environment settings.
 *
 * Every caller-supplied `baseUrl` is validated here so no route can be tricked into
 * POSTing to a cloud metadata endpoint. Model identifiers come from `lib/ai/models`.
 */

/** Reads the server-side Gemini key without ever echoing it. */
export function serverGeminiApiKey(): string | undefined {
  const key = typeof process !== 'undefined' && process.env ? process.env.GEMINI_API_KEY : undefined;
  const trimmed = key?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

/** True when the server can run Gemini calls without a BYOK key. */
export function hasServerGeminiKey(): boolean {
  return serverGeminiApiKey() !== undefined;
}

export function resolveAIModel(config?: Partial<AIProviderConfig>): LanguageModel {
  const providerType = config?.type || 'gemini';
  const customKey = config?.apiKey?.trim() || undefined;
  const customBaseUrl = assertSafeProviderBaseUrl(config?.baseUrl);
  const modelName = config?.selectedModel?.trim() || PROVIDER_DEFAULT_MODELS[providerType];

  // 1. Google Gemini (Server default or user-provided BYOK)
  if (providerType === 'gemini') {
    const apiKey = customKey || serverGeminiApiKey();
    const google = createGoogleGenerativeAI({
      apiKey: apiKey ?? 'missing-key',
    });
    return google(modelName || DEFAULT_GEMINI_TEXT_MODEL);
  }

  // 2. OpenAI or OpenAI-Compatible (Ollama, LM Studio, Groq, Mistral, OpenRouter, vLLM)
  if (providerType === 'openai') {
    const openai = createOpenAI({
      apiKey: customKey || process.env.OPENAI_API_KEY || '',
      baseURL: customBaseUrl,
    });
    return openai(modelName || PROVIDER_DEFAULT_MODELS.openai);
  }

  if (providerType === 'groq') {
    const groq = createOpenAI({
      apiKey: customKey || process.env.GROQ_API_KEY || '',
      baseURL: customBaseUrl || 'https://api.groq.com/openai/v1',
    });
    return groq(modelName || PROVIDER_DEFAULT_MODELS.groq);
  }

  if (providerType === 'mistral') {
    const mistral = createOpenAI({
      apiKey: customKey || process.env.MISTRAL_API_KEY || '',
      baseURL: customBaseUrl || 'https://api.mistral.ai/v1',
    });
    return mistral(modelName || PROVIDER_DEFAULT_MODELS.mistral);
  }

  if (providerType === 'openrouter') {
    const openrouter = createOpenAI({
      apiKey: customKey || process.env.OPENROUTER_API_KEY || '',
      baseURL: customBaseUrl || 'https://openrouter.ai/api/v1',
    });
    return openrouter(modelName || PROVIDER_DEFAULT_MODELS.openrouter);
  }

  if (providerType === 'anthropic') {
    // Anthropic exposes an OpenAI-compatible endpoint; without a dedicated SDK we
    // surface a Gemini fallback rather than silently issuing an invalid request.
    const google = createGoogleGenerativeAI({ apiKey: serverGeminiApiKey() ?? 'missing-key' });
    return google(DEFAULT_GEMINI_TEXT_MODEL);
  }

  if (providerType === 'custom') {
    const customEndpoint = createOpenAI({
      apiKey: customKey || 'local',
      baseURL: customBaseUrl || 'http://localhost:11434/v1',
    });
    return customEndpoint(modelName || PROVIDER_DEFAULT_MODELS.custom);
  }

  const google = createGoogleGenerativeAI({ apiKey: serverGeminiApiKey() ?? 'missing-key' });
  return google(DEFAULT_GEMINI_TEXT_MODEL);
}
