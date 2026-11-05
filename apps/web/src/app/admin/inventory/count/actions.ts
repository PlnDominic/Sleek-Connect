'use server';

import { updateTag } from 'next/cache';
import { failed, text, type ActionState } from '@/lib/admin/action-state';
import { flash } from '@/lib/admin/flash';
import type { Json } from '@/lib/supabase/database.types';
import { createUserSupabase } from '@/lib/supabase/server';

/** Applies a stock count. `counts_json` is [{ batch_id, counted }] for the batches that were counted. */
export async function applyStockCount(_: ActionState, form: FormData): Promise<ActionState> {
  let counts: Json = [];
  try {
    counts = JSON.parse(text(form, 'counts_json') || '[]');
  } catch {
    counts = [];
  }
  const supabase = await createUserSupabase();
  const { data, error } = await supabase.rpc('admin_apply_stock_count', { p_counts: counts, p_note: text(form, 'note') });
  if (error) return failed(error);
  updateTag('catalog');
  flash('/admin/inventory/count', data === 0 ? 'Everything matched: no changes.' : `Stock count saved: ${data} batch${data === 1 ? '' : 'es'} corrected.`);
}
