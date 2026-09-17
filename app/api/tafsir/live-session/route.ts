import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Modality } from '@google/genai';
import {
  apiError,
  guardRequest,
  NOT_CONFIGURED,
  RATE_LIMITED,
  UPSTREAM_UNAVAILABLE,
} from '@/lib/api/http';
import { callerKey, checkRateLimit } from '@/lib/api/rate-limit';
import { resolveServerGeminiLiveModels } from '@/lib/ai/models';
import { serverGeminiApiKey } from '@/lib/ai/resolver';

export const maxDuration = 30;

/**
 * Minting is cheap but it is still a credentialed upstream call, and a token is valid for
 * several sessions, so the ceiling is deliberately low.
 */
const RATE_LIMIT = { limit: 10, windowMs: 60_000 };

/** How long a minted token may keep opening new sessions. */
const NEW_SESSION_WINDOW_MS = 2 * 60_000;
/** How long an established session may keep running. */
const SESSION_WINDOW_MS = 30 * 60_000;

/**
 * Mints a short-lived ephemeral token for a Gemini Live storyteller session.
 *
 * The server's `GEMINI_API_KEY` must never reach the browser, so the browser never holds a
 * credential that can call the Gemini API on its own. It receives an ephemeral token
 * instead: single-use, expiring in minutes, and constrained to the Live API with audio
 * responses only. `uses: 1` means a leaked token cannot be replayed to open a second
 * session.
 *
 * The token deliberately does **not** lock `systemInstruction` (`lockAdditionalFields` is
 * left unset). Lesson context is assembled in the browser from the cached exegesis, and the
 * operator's key is still the only credential involved — locking the instruction would mean
 * shipping lesson text to the server on every ayah change for no security gain.
 *
 * Live audio support is model-specific, so candidates are tried in order and the model that
 * actually minted the token is reported back. The client must connect with that exact id
 * because the token is constrained to it.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = guardRequest(req, { maxBytes: 4_000 });
  if (!guard.ok) return guard.response;

  const rate = checkRateLimit({ key: callerKey(req, 'tafsir-live-session'), ...RATE_LIMIT });
  if (!rate.allowed) {
    return apiError({
      status: 429,
      code: 'rate_limited',
      message: RATE_LIMITED,
      headers: { 'Retry-After': `${rate.retryAfterSeconds}` },
    });
  }

  const apiKey = serverGeminiApiKey();
  if (!apiKey) {
    return apiError({ status: 503, code: 'not_configured', message: NOT_CONFIGURED });
  }

  // Ephemeral auth tokens are only issued by the v1alpha surface.
  const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha' } });

  const now = Date.now();
  const expireTime = new Date(now + SESSION_WINDOW_MS).toISOString();
  const newSessionExpireTime = new Date(now + NEW_SESSION_WINDOW_MS).toISOString();

  const failures: string[] = [];

  for (const model of resolveServerGeminiLiveModels()) {
    try {
      const token = await ai.authTokens.create({
        config: {
          uses: 1,
          expireTime,
          newSessionExpireTime,
          liveConnectConstraints: {
            model,
            config: {
              responseModalities: [Modality.AUDIO],
              // Transcriptions drive the on-screen lesson transcript. They are display-only
              // and are never fed back as scripture.
              inputAudioTranscription: {},
              outputAudioTranscription: {},
            },
          },
        },
      });

      if (!token.name) {
        failures.push(`${model}: the token service returned no token`);
        continue;
      }

      return NextResponse.json({
        token: token.name,
        model,
        newSessionExpireTime: token.newSessionExpireTime ?? newSessionExpireTime,
        expiresAt: token.expireTime ?? expireTime,
      });
    } catch (error: unknown) {
      // One model not supporting Live audio is an expected outcome of the ladder, so it is
      // recorded and the next candidate is tried rather than failing the request.
      const detail = error instanceof Error ? error.message : 'unknown error';
      console.warn(`Live token request failed for model "${model}":`, detail);
      failures.push(`${model}: ${detail}`);
    }
  }

  console.error('No Live model could mint a session token.', failures);
  return apiError({
    status: 503,
    code: 'upstream_unavailable',
    message: `${UPSTREAM_UNAVAILABLE} The voice storyteller needs a model that supports bidirectional audio; set GEMINI_LIVE_MODEL to one enabled for this key.`,
    unavailable: true,
  });
}
