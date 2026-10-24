import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { Database } from './database.types';

export function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see apps/web/.env.example).',
    );
  }
  return { url, key };
}

/**
 * Anonymous client for cached catalogue reads (Server Components, build-time rendering).
 * Runs as the `anon` role under row level security and never touches cookies.
 */
export function createSupabase() {
  const { url, key } = supabaseConfig();
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Callers cache with `'use cache'` and the `catalog` tag. Without no-store, fetches inside that scope also land in
    // Next's fetch cache with its own lifetime, which outlives builds and would show stale stock.
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  });
}

/**
 * Client that acts as the signed-in shopper, using the session cookies.
 * For Server Actions and Route Handlers; never call it inside a `'use cache'` scope.
 */
export async function createUserSupabase() {
  const { url, key } = supabaseConfig();
  const cookieStore = await cookies();
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only; the browser client refreshes the session.
        }
      },
    },
  });
}
