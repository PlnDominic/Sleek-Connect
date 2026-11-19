import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { supabaseConfig } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';

/** A Supabase client acting as the signed-in shopper whose access token the mobile app sent. Null without a valid one. */
export async function clientForBearer(request: NextRequest) {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return null;
  const { url, key } = supabaseConfig();
  const supabase = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await supabase.auth.getUser(token);
  return error || !data.user ? null : supabase;
}
