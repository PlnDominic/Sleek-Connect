import { headers } from 'next/headers';

type Bucket = { count: number; resetAt: number };
type RateLimitOptions = { key: string; limit: number; windowMs: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

function prune(now: number) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  if (buckets.size >= MAX_BUCKETS) buckets.clear();
}

export function clientAddress(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip') || 'unknown';
}

export function rateLimit({ key, limit, windowMs }: RateLimitOptions) {
  const now = Date.now();
  prune(now);
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: Math.max(0, limit - 1), retryAfter: 0 };
  }
  current.count += 1;
  const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  return { allowed: current.count <= limit, remaining: Math.max(0, limit - current.count), retryAfter };
}

export function rateLimitResponse(retryAfter: number, requestId?: string) {
  const response = Response.json({ error: 'Too many requests. Please try again later.', requestId }, { status: 429 });
  response.headers.set('Retry-After', String(retryAfter));
  response.headers.set('Cache-Control', 'no-store');
  if (requestId) response.headers.set('x-request-id', requestId);
  return response;
}

/**
 * The same limiter for server actions, which never see a `Request`: the caller's address comes from the headers
 * Next.js provides to the action instead.
 */
export async function rateLimitAction({ key, limit, windowMs }: RateLimitOptions) {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim();
  const address = forwarded || requestHeaders.get('x-real-ip') || 'unknown';
  return rateLimit({ key: `${key}:${address}`, limit, windowMs });
}
