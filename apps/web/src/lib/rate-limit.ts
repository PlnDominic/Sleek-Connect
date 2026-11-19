import { createHmac } from 'node:crypto';
import { headers } from 'next/headers';
import { logger } from '@/lib/observability';
import { createAdminSupabase } from '@/lib/supabase/admin';

type Bucket = { count: number; resetAt: number };
type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
  /**
   * Count in the database, so every server instance shares one count (the default). `false` counts in this instance's memory only:
   * cheaper, but each instance has its own allowance. Use it for frequent, low-risk calls such as search-as-you-type.
   */
  shared?: boolean;
};
export type RateLimitResult = { allowed: boolean; remaining: number; retryAfter: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;
/** The database is asked quickly or not at all: a slow limiter must not slow down (or break) a checkout. */
const SHARED_TIMEOUT_MS = 800;

function prune(now: number) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  if (buckets.size >= MAX_BUCKETS) buckets.clear();
}

/**
 * The caller's address. On Vercel the platform sets these headers itself (a caller cannot choose them), so `x-vercel-forwarded-for` is
 * preferred; the others are for other hosts and local runs.
 */
export function addressFrom(read: (name: string) => string | null | undefined) {
  const vercel = read('x-vercel-forwarded-for')?.split(',')[0]?.trim();
  const forwarded = read('x-forwarded-for')?.split(',')[0]?.trim();
  return vercel || forwarded || read('x-real-ip') || 'unknown';
}

export function clientAddress(request: Request) {
  return addressFrom((name) => request.headers.get(name));
}

function rateLimitLocal({ key, limit, windowMs }: RateLimitOptions): RateLimitResult {
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

let lastWarning = 0;

/**
 * Counts one request against `key` and says whether it is within `limit` per `windowMs`. The count is kept in the database
 * (`public.rate_limit_hit`), keyed by a keyed hash so no address is stored there. If the database can't answer in time the
 * count falls back to this instance's memory, so the limit is never off, only less strict.
 */
export async function rateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (options.shared === false || !secret) return rateLimitLocal(options);
  try {
    const { data, error } = await createAdminSupabase()
      .rpc('rate_limit_hit', {
        p_key: createHmac('sha256', secret).update(options.key).digest('hex'),
        p_limit: options.limit,
        p_window_seconds: Math.max(1, Math.ceil(options.windowMs / 1000)),
      })
      .abortSignal(AbortSignal.timeout(SHARED_TIMEOUT_MS))
      .single();
    if (error || !data) throw error ?? new Error('no answer');
    return { allowed: data.allowed, remaining: data.remaining, retryAfter: data.retry_after };
  } catch (cause) {
    // One line a minute at most, so an outage doesn't flood the logs.
    if (Date.now() - lastWarning > 60_000) {
      lastWarning = Date.now();
      logger.warn('rate_limit_shared_unavailable', { reason: cause instanceof Error ? cause.message : 'unknown' });
    }
    return rateLimitLocal(options);
  }
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
export async function rateLimitAction({ key, limit, windowMs, shared }: RateLimitOptions): Promise<RateLimitResult> {
  const requestHeaders = await headers();
  const address = addressFrom((name) => requestHeaders.get(name));
  return rateLimit({ key: `${key}:${address}`, limit, windowMs, shared });
}
