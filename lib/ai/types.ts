export const AI_PROVIDER_VENDORS = [
  'gemini',
  'openai',
  'anthropic',
  'groq',
  'mistral',
  'openrouter',
  'custom',
] as const;

export type AIProviderVendor = (typeof AI_PROVIDER_VENDORS)[number];

export interface AIProviderConfig {
  id: string;
  name: string;
  type: AIProviderVendor;
  apiKey?: string;
  baseUrl?: string;
  selectedModel: string;
  models?: string[];
}

export interface AIModelInfo {
  id: string;
  name: string;
  supportsTools: boolean;
  supportsVision: boolean;
}
