import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { resolveAIModel, serverGeminiApiKey } from '@/lib/ai/resolver';
import { AIProviderConfig } from '@/lib/ai/types';
import { PROVIDER_DEFAULT_MODELS } from '@/lib/ai/models';
import { parseWithSchema, providerTestRequestSchema } from '@/lib/api/schemas';
import { apiError, guardRequest, RATE_LIMITED } from '@/lib/api/http';
import { callerKey, checkRateLimit } from '@/lib/api/rate-limit';
import { UnsafeProviderUrlError } from '@/lib/api/url-guard';

const RATE_LIMIT = { limit: 10, windowMs: 60_000 };

export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = guardRequest(req, { maxBytes: 8_000 });
  if (!guard.ok) return guard.response;

  const rate = checkRateLimit({ key: callerKey(req, 'provider-test'), ...RATE_LIMIT });
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

  // Only an explicit providerConfig is accepted; the request body is never used as
  // the configuration, otherwise any caller could point the server at any host.
  const parsed = parseWithSchema(providerTestRequestSchema, body);
  if (!parsed.ok) {
    return apiError({ status: 400, code: 'invalid_request', message: parsed.message });
  }

  const source = parsed.data.providerConfig ?? parsed.data;
  const vendor = source.type ?? 'gemini';

  if (vendor === 'gemini' && !source.apiKey && !serverGeminiApiKey()) {
    return apiError({
      status: 503,
      code: 'not_configured',
      message: 'No Gemini key is configured on this server and no BYOK key was supplied.',
    });
  }

  const config: Partial<AIProviderConfig> = {
    type: vendor,
    apiKey: source.apiKey,
    baseUrl: source.baseUrl,
    selectedModel: source.selectedModel ?? PROVIDER_DEFAULT_MODELS[vendor],
  };

  const startedAt = Date.now();

  try {
    const model = resolveAIModel(config);
    const { text } = await generateText({
      model,
      prompt: 'Respond with the single word "Connected" to test connectivity.',
    });

    return NextResponse.json({
      success: true,
      message: 'Provider responded successfully.',
      response: text.trim().slice(0, 200),
      latencyMs: Date.now() - startedAt,
    });
  } catch (error: unknown) {
    if (error instanceof UnsafeProviderUrlError) {
      return apiError({ status: 400, code: 'invalid_request', message: error.message });
    }

    // Provider error text can embed request details (including credentials), so it is
    // logged server-side only and never echoed to the client.
    console.error('Provider connectivity test failed.');

    return NextResponse.json(
      {
        success: false,
        error:
          'The provider could not be reached with these settings. Check the API key, model name and base URL.',
        latencyMs: Date.now() - startedAt,
      },
      { status: 400 }
    );
  }
}
