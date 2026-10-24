'use server';

import { refresh, updateTag } from 'next/cache';
import { done, failed, text, type ActionState } from '@/lib/admin/action-state';
import { flash } from '@/lib/admin/flash';
import type { Database } from '@/lib/supabase/database.types';
import { createUserSupabase } from '@/lib/supabase/server';

type MovementReason = Database['public']['Enums']['stock_movement_reason'];
type BatchStatus = Database['public']['Enums']['batch_status'];

/** Stock changes can flip "in stock" on the store, so the catalogue cache is refreshed too. */
function changed() {
  updateTag('catalog');
  refresh();
}

export async function receiveStock(_: ActionState, form: FormData): Promise<ActionState> {
  const [productId, size = ''] = text(form, 'sku').split('|');
  const quantity = Number(text(form, 'quantity'));
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_receive_stock', {
    p_product_id: productId ?? '',
    p_size_code: size,
    p_batch_code: text(form, 'batch'),
    p_expires_on: text(form, 'expires_on') || (null as unknown as string),
    p_quantity: Number.isInteger(quantity) ? quantity : 0,
    p_note: text(form, 'note') || undefined,
  });
  if (error) return failed(error);
  changed();
  return done(`Received ${quantity} into batch ${text(form, 'batch').toUpperCase()}.`);
}

export async function adjustBatch(batchId: string, productId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const change = Number(text(form, 'change'));
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_adjust_batch', {
    p_batch_id: batchId,
    p_change: Number.isInteger(change) ? change : 0,
    p_reason: text(form, 'reason') as MovementReason,
    p_note: text(form, 'note'),
  });
  if (error) return failed(error);
  updateTag('catalog');
  flash(`/admin/inventory/${productId}`, 'Count updated.');
}

export async function setBatchStatus(batchId: string, productId: string, status: BatchStatus, _: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_set_batch_status', { p_batch_id: batchId, p_status: status, p_note: text(form, 'note') });
  if (error) return failed(error);
  updateTag('catalog');
  flash(`/admin/inventory/${productId}`, status === 'available' ? 'Batch back on sale.' : status === 'quarantined' ? 'Batch quarantined.' : 'Batch recalled.');
}

export async function writeOffBatch(batchId: string, productId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_write_off_batch', { p_batch_id: batchId, p_note: text(form, 'note') });
  if (error) return failed(error);
  updateTag('catalog');
  flash(`/admin/inventory/${productId}`, 'Batch written off.');
}
