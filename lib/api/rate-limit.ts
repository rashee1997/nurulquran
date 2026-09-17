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

/** Best-effort caller identity for rate limiting. */
export function callerKey(req: Request, scope: string): string {
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  return `${scope}:${ip}`;
}
