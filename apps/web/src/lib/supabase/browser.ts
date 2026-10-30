'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';

/** The browser's Supabase client (a singleton). Holds the shopper's session in cookies. */
export function createBrowserSupabase() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
