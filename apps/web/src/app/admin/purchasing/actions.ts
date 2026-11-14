'use server';

import { refresh, updateTag } from 'next/cache';
import { done, failed, text, type ActionState } from '@/lib/admin/action-state';
import { flash } from '@/lib/admin/flash';
import type { Json } from '@/lib/supabase/database.types';
import { createUserSupabase } from '@/lib/supabase/server';

/** Creates a draft purchase order, or saves changes to one. `lines_json` is [{ sku: "productId|sizeCode", quantity, unit_cost_ghs }]. */
export async function savePurchaseOrder(id: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  let raw: { sku: string; quantity: string; unit_cost_ghs: string }[] = [];
  try {
    raw = JSON.parse(text(form, 'lines_json') || '[]');
  } catch {
    raw = [];
  }
  const lines = raw.map((l) => {
    const [product_id, size_code = ''] = String(l.sku).split('|');
    return { product_id, size_code, quantity: String(l.quantity), unit_cost_ghs: String(l.unit_cost_ghs) };
  });
  const supabase = await createUserSupabase();
  const { data, error } = await supabase.rpc('admin_save_purchase_order', {
    p: { id: id ?? '', supplier_id: text(form, 'supplier_id'), expected_on: text(form, 'expected_on'), note: text(form, 'note'), lines } as unknown as Json,
  });
  if (error) return failed(error);
  flash(`/admin/purchasing/${data}`, id ? 'Order saved.' : 'Draft order created. Check it, then place it.');
}

export async function placePurchaseOrder(id: string): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_place_purchase_order', { p_id: id });
  if (error) return failed(error);
  refresh();
  return done('Order placed. When the goods arrive, receive them here.');
}

export async function cancelPurchaseOrder(id: string): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_cancel_purchase_order', { p_id: id });
  if (error) return failed(error);
  flash('/admin/purchasing', 'Order cancelled.');
}

export async function completePurchaseOrder(id: string): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_complete_purchase_order', { p_id: id });
  if (error) return failed(error);
  refresh();
  return done('Marked as complete.');
}

/** Receives what arrived. `lines_json` is [{ line_id, quantity, batch_code, expires_on }]. */
export async function receivePurchaseOrder(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  let lines: Json = [];
  try {
    lines = JSON.parse(text(form, 'lines_json') || '[]');
  } catch {
    lines = [];
  }
  const supabase = await createUserSupabase();
  const { data, error } = await supabase.rpc('admin_receive_purchase_order', { p_id: id, p_lines: lines });
  if (error) return failed(error);
  updateTag('catalog');
  const result = data as { units: number; status: string };
  flash(`/admin/purchasing/${id}`, `Received ${result.units} unit${result.units === 1 ? '' : 's'} into stock.`);
}

/** A draft order from the reorder suggestions for one supplier. */
export async function reorderToPurchaseOrder(_: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { data, error } = await supabase.rpc('admin_reorder_to_po', { p_supplier_id: text(form, 'supplier_id') });
  if (error) return failed(error);
  flash(`/admin/purchasing/${data}`, 'Draft created from the reorder suggestions. Check the quantities and costs, then place it.');
}
