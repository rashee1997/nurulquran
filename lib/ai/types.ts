export type AIProviderVendor = 
  | 'gemini'
  | 'openai'
  | 'anthropic'
  | 'groq'
  | 'mistral'
  | 'openrouter'
  | 'custom';

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
