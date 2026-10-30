import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { supabaseConfig } from './server';

/**
 * Service-level client for payment processing only (starting payments, applying provider results).
 * Uses SUPABASE_SECRET_KEY, a server-only variable that must never be exposed to the browser.
 */
export function createAdminSupabase() {
  const { url } = supabaseConfig();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error('SUPABASE_SECRET_KEY is not set; payments cannot be processed.');
  return createClient<Database>(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
