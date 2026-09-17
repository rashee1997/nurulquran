import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { LanguageModel } from 'ai';
import { AIProviderConfig } from './types';

/**
 * Resolves an AI LanguageModel dynamically based on user BYOK configuration
 * or server default environment settings.
 */
export function resolveAIModel(config?: Partial<AIProviderConfig>): LanguageModel {
  const providerType = config?.type || 'gemini';
  const customKey = config?.apiKey;
  const customBaseUrl = config?.baseUrl;
  const modelName = config?.selectedModel || 'gemini-3.8-flash';

  // 1. Google Gemini (Server default or user-provided BYOK)
  if (providerType === 'gemini') {
    const apiKey = customKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('GEMINI_API_KEY is not defined. Using mock fallback or client key required.');
    }
    const google = createGoogleGenerativeAI({
      apiKey: apiKey || 'dummy-key',
    });
    return google(modelName);
  }

  // 2. OpenAI or OpenAI-Compatible (Ollama, LM Studio, Groq, Mistral, OpenRouter, vLLM)
  if (providerType === 'openai') {
    const openai = createOpenAI({
      apiKey: customKey || process.env.OPENAI_API_KEY || '',
      baseURL: customBaseUrl,
    });
    return openai(modelName || 'gpt-4o-mini');
  }

  if (providerType === 'groq') {
    const groq = createOpenAI({
      apiKey: customKey || process.env.GROQ_API_KEY || '',
      baseURL: 'https://api.groq.com/openai/v1',
    });
    return groq(modelName || 'llama-3.3-70b-versatile');
  }

  if (providerType === 'mistral') {
    const mistral = createOpenAI({
      apiKey: customKey || process.env.MISTRAL_API_KEY || '',
      baseURL: 'https://api.mistral.ai/v1',
    });
    return mistral(modelName || 'mistral-large-latest');
  }

  if (providerType === 'openrouter') {
    const openrouter = createOpenAI({
      apiKey: customKey || process.env.OPENROUTER_API_KEY || '',
      baseURL: 'https://openrouter.ai/api/v1',
    });
    return openrouter(modelName || 'meta-llama/llama-3.3-70b-instruct');
  }

  if (providerType === 'custom') {
    const customEndpoint = createOpenAI({
      apiKey: customKey || 'sk-custom',
      baseURL: customBaseUrl || 'http://localhost:11434/v1',
    });
    return customEndpoint(modelName || 'llama3');
  }

  // Fallback to Gemini
  const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY || 'dummy-key',
  });
  return google('gemini-2.5-flash');
}
