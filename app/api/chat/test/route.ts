import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { resolveAIModel } from '@/lib/ai/resolver';
import { AIProviderConfig } from '@/lib/ai/types';

export async function POST(req: NextRequest) {
  const start = Date.now();
  try {
    const body = await req.json();
    const config: Partial<AIProviderConfig> = body.providerConfig || body;
    const model = resolveAIModel(config);

    const { text } = await generateText({
      model,
      prompt: 'Respond with the single word "Connected" to test connectivity.',
    });

    return NextResponse.json({
      success: true,
      message: 'Provider test succeeded!',
      response: text.trim(),
      latencyMs: Date.now() - start,
    });
  } catch (error: unknown) {
    console.error('Test connection error:', error);
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message || 'Failed to connect to provider.',
        latencyMs: Date.now() - start,
      },
      { status: 400 }
    );
  }
}
