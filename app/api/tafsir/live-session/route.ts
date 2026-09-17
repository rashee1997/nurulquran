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
import { resolveServerGeminiLiveModel } from '@/lib/ai/models';
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
 * left unset), so only the fields set here are frozen: the model, audio-only response
 * modality, and the two transcriptions. The persona, voice and per-ayah context stay
 * client-controlled, which is what lets the lesson context change without minting a new
 * single-use token for every ayah — the cost of locking the instruction would be a server
 * round trip per verse, for no security gain.
 *
 * The model is pinned to the Live variant (`DEFAULT_GEMINI_LIVE_MODEL`). It must be a Live
 * model: naming a plain text model here still mints a token successfully, and the mismatch
 * only surfaces later as a rejected WebSocket connection.
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

  const model = resolveServerGeminiLiveModel();

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

    /*
     * The browser passes this value as the SDK's API key, and the SDK detects an ephemeral
     * token by its `auth_tokens/` prefix to select the constrained WebSocket endpoint. A name
     * in any other shape would silently be sent to the unconstrained endpoint and rejected, so
     * it is checked here rather than discovered as an opaque connection failure in the client.
     */
    if (!token.name || !token.name.startsWith('auth_tokens/')) {
      console.error('Live token service returned an unexpected token shape.');
      return apiError({
        status: 503,
        code: 'upstream_unavailable',
        message: `${UPSTREAM_UNAVAILABLE} The voice session credential was not in the expected form.`,
        unavailable: true,
      });
    }

    return NextResponse.json({
      token: token.name,
      model,
      newSessionExpireTime: token.newSessionExpireTime ?? newSessionExpireTime,
      expiresAt: token.expireTime ?? expireTime,
    });
  } catch (error: unknown) {
    console.error(`Live token request failed for model "${model}":`, error);
    return apiError({
      status: 503,
      code: 'upstream_unavailable',
      message: `${UPSTREAM_UNAVAILABLE} The voice storyteller could not open a session with the model “${model}”. Set GEMINI_LIVE_MODEL to a Live model enabled for this key.`,
      unavailable: true,
    });
  }
}
