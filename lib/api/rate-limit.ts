/**
 * Minimal in-memory sliding-window rate limiter for the AI/audio routes.
 *
 * The app has no accounts, so this is deliberately process-local: it bounds abuse
 * from a single client without pretending to be distributed rate limiting. If the
 * app is ever deployed across multiple instances, move this to a shared store.
 */

interface RateLimitRecord {
  timestamps: number[];
}

const buckets = new Map<string, RateLimitRecord>();

export interface RateLimitOptions {
  /** Stable identifier for the caller (IP, or a fallback key). */
  key: string;
  /** Maximum number of requests inside the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function checkRateLimit({ key, limit, windowMs }: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const record = buckets.get(key) ?? { timestamps: [] };

  // Drop entries that fell out of the window.
  const fresh = record.timestamps.filter((timestamp) => now - timestamp < windowMs);

  if (fresh.length >= limit) {
    const oldest = fresh[0] ?? now;
    const retryAfterMs = Math.max(0, windowMs - (now - oldest));
    buckets.set(key, { timestamps: fresh });
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  }

  fresh.push(now);
  record.timestamps = fresh;
  buckets.set(key, record);

  // Opportunistic cleanup so the map cannot grow without bound.
  if (buckets.size > 5000) {
    for (const [bucketKey, bucket] of buckets) {
      const live = bucket.timestamps.filter((timestamp) => now - timestamp < windowMs);
      if (live.length === 0) {
        buckets.delete(bucketKey);
      } else {
        bucket.timestamps = live;
      }
    }
  }

  return { allowed: true, remaining: limit - fresh.length, retryAfterSeconds: 0 };
}

/**
 * Best-effort caller identity for rate limiting.
 *
 * The address is taken from the **last** `x-forwarded-for` entry, not the first.
 *
 * Each proxy in the chain *appends* the peer it saw, so the final entry is the one written by
 * the proxy closest to us — the only entry a client cannot forge. Reading the first entry (as
 * this did) meant a caller could put any value there and get a fresh bucket per request, which
 * defeated the limit on every expensive route at once: the evaluation, live-coach, chat, TTS
 * and token-mint endpoints all key on this. A deployment whose proxy overwrites the header
 * instead of appending is unaffected, since then first and last are the same value.
 *
 * When no address header is present at all there is genuinely nothing to identify a caller
 * with. Those requests share one bucket deliberately: a shared bucket may throttle honest
 * users behind a misconfigured proxy, whereas removing the limit would leave the paid AI
 * endpoints unbounded. The condition is logged once so the misconfiguration is visible.
 */
let warnedAboutMissingCallerAddress = false;

export function callerKey(req: Request, scope: string): string {
  const forwarded = req.headers.get('x-forwarded-for');
  const chain = forwarded?.split(',') ?? [];
  const fromChain = chain[chain.length - 1]?.trim();

  const ip =
    (fromChain && fromChain.length > 0 ? fromChain : undefined) ??
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-real-ip') ??
    undefined;

  if (!ip) {
    if (!warnedAboutMissingCallerAddress) {
      warnedAboutMissingCallerAddress = true;
      console.warn(
        'No caller address header is present, so rate limiting cannot distinguish clients. Ensure the proxy sets x-forwarded-for, or the limits will be shared across all callers.'
      );
    }
    return `${scope}:unidentified`;
  }

  return `${scope}:${ip}`;
}
