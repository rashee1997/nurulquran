/**
 * Shared HTTP helpers for route handlers: request guards, typed error bodies,
 * and response shapes that can never be mistaken for a successful evaluation.
 */

import { NextRequest, NextResponse } from 'next/server';

export type ApiErrorCode =
  | 'invalid_request'
  | 'payload_too_large'
  | 'rate_limited'
  | 'forbidden'
  | 'not_configured'
  | 'upstream_unavailable';

export interface ApiErrorBody {
  error: string;
  code: ApiErrorCode;
  /** True when the request was well formed but the upstream service could not be reached. */
  unavailable?: boolean;
}

export interface ApiErrorOptions {
  status: number;
  code: ApiErrorCode;
  message: string;
  unavailable?: boolean;
  headers?: HeadersInit;
}

export function apiError({ status, code, message, unavailable, headers }: ApiErrorOptions): NextResponse<ApiErrorBody> {
  return NextResponse.json<ApiErrorBody>(
    { error: message, code, ...(unavailable ? { unavailable: true } : {}) },
    { status, headers }
  );
}

export const FORBIDDEN_ORIGIN = 'This endpoint only accepts same-origin requests.';
export const RATE_LIMITED = 'Too many requests. Please wait a moment and try again.';
export const PAYLOAD_TOO_LARGE = 'The submitted payload is larger than this endpoint accepts.';
export const NOT_CONFIGURED =
  'The AI evaluation service is not configured on this server. Add the required API key in Settings → Environment.';
export const UPSTREAM_UNAVAILABLE =
  'The evaluation service could not be reached or did not return a usable result. Nothing was graded — please retry.';

/** Maximum accepted JSON body size for endpoints that carry audio payloads. */
export const MAX_AUDIO_REQUEST_BYTES = 6_000_000;

export interface RequestGuardOptions {
  /** Maximum accepted `Content-Length` in bytes. */
  maxBytes?: number;
  /**
   * When true (default), requests whose `Sec-Fetch-Site` header explicitly marks
   * them as cross-site are rejected. Browser fetches to our own routes always send
   * `same-origin`; the check is skipped when the header is absent (older clients,
   * curl, server-to-server).
   */
  sameOrigin?: boolean;
}

export type RequestGuardResult = { ok: true } | { ok: false; response: NextResponse<ApiErrorBody> };

/** Applies transport-level guards: declared payload size and cross-site rejection. */
export function guardRequest(req: NextRequest, options: RequestGuardOptions = {}): RequestGuardResult {
  const { maxBytes = MAX_AUDIO_REQUEST_BYTES, sameOrigin = true } = options;

  if (sameOrigin) {
    const fetchSite = req.headers.get('sec-fetch-site');
    if (fetchSite === 'cross-site') {
      return { ok: false, response: apiError({ status: 403, code: 'forbidden', message: FORBIDDEN_ORIGIN }) };
    }
  }

  const declaredLength = Number.parseInt(req.headers.get('content-length') ?? '', 10);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return {
      ok: false,
      response: apiError({ status: 413, code: 'payload_too_large', message: PAYLOAD_TOO_LARGE }),
    };
  }

  return { ok: true };
}
