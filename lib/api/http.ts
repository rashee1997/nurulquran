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

export const LENGTH_REQUIRED =
  'This endpoint needs a Content-Length so the payload size can be checked before it is read.';

/**
 * Hosts this request could legitimately have been addressed as.
 *
 * `Host` is what a direct client sends and what Next.js sees behind a standard reverse proxy;
 * `x-forwarded-host` is added by proxies that rewrite it. Both are accepted so a proxied
 * deployment is not mistaken for a cross-site caller.
 */
function expectedHosts(req: NextRequest): string[] {
  return [req.headers.get('host'), req.headers.get('x-forwarded-host')]
    .map((value) => value?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value));
}

/**
 * Rejects a browser request whose `Origin` is a different site.
 *
 * `sec-fetch-site` was the only cross-site signal this guard checked, and it is sent by modern
 * browsers only. Older browsers, some webviews and any hand-written client omit it, so the
 * check was skipped exactly when it was needed. A present `Origin` that does not match this
 * host is an unambiguous cross-site browser request and is refused. The check deliberately
 * only *adds* a rejection: a request with no `Origin` at all (server-to-server, curl, a
 * same-origin form post in an old browser) is still governed by the declared-size and
 * rate-limit guards rather than being refused outright.
 *
 * A reverse proxy that rewrites the inbound `Host` without setting `x-forwarded-host` would make
 * a legitimate same-origin request look cross-site here. If the AI routes begin answering 403
 * after a proxy change, that header is the first thing to check.
 */
function isCrossSiteOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;

  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    // `Origin: null` (sandboxed iframe, some redirect chains) and malformed values have no
    // host to compare; they are not evidence of a cross-site browser request.
    return false;
  }

  const hosts = expectedHosts(req);
  if (hosts.length === 0) return false;
  return !hosts.includes(originHost);
}

/** Applies transport-level guards: declared payload size and cross-site rejection. */
export function guardRequest(req: NextRequest, options: RequestGuardOptions = {}): RequestGuardResult {
  const { maxBytes = MAX_AUDIO_REQUEST_BYTES, sameOrigin = true } = options;

  if (sameOrigin) {
    const fetchSite = req.headers.get('sec-fetch-site');
    if (fetchSite === 'cross-site' || isCrossSiteOrigin(req)) {
      return { ok: false, response: apiError({ status: 403, code: 'forbidden', message: FORBIDDEN_ORIGIN }) };
    }
  }

  const rawLength = req.headers.get('content-length');
  const declaredLength = Number.parseInt(rawLength ?? '', 10);

  if (Number.isFinite(declaredLength)) {
    if (declaredLength > maxBytes) {
      return {
        ok: false,
        response: apiError({ status: 413, code: 'payload_too_large', message: PAYLOAD_TOO_LARGE }),
      };
    }
    return { ok: true };
  }

  /*
   * No usable `Content-Length`.
   *
   * The size ceiling above was previously the guard's only size defence, so a chunked request
   * that simply omitted the header bypassed it and the body was handed to `req.json()` — which
   * buffers the whole payload in memory. These endpoints take a small JSON document (and, for
   * the audio routes, one already-bounded base64 string); every browser `fetch` with a string
   * body sets `Content-Length` automatically, so a chunked upload is never a legitimate client
   * of these routes and is refused rather than streamed into memory unbounded.
   */
  if (req.headers.get('transfer-encoding')) {
    return {
      ok: false,
      response: apiError({ status: 411, code: 'invalid_request', message: LENGTH_REQUIRED }),
    };
  }

  return { ok: true };
}
