'use server';

import { refresh } from 'next/cache';
import { done, failed, type ActionState } from '@/lib/admin/action-state';
import { createUserSupabase } from '@/lib/supabase/server';

/** Takes a word off the report, for example once a matching product has been added. */
export async function clearSearchMiss(term: string): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_clear_search_miss', { p_term: term });
  if (error) return failed(error);
  refresh();
  return done('Removed from the list.');
}
