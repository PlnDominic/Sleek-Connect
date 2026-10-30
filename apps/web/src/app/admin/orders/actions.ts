'use server';

import { refresh, updateTag } from 'next/cache';
import { after } from 'next/server';
import { done, failed, text, type ActionState } from '@/lib/admin/action-state';
import { flash } from '@/lib/admin/flash';
import { dispatchNotifications } from '@/lib/notifications/dispatch';
import type { DeliveryFailureReason } from '@/lib/orders';
import { createUserSupabase } from '@/lib/supabase/server';

/** After a status change: send the customer's message, and refresh stock shown on the store. */
function afterStatusChange() {
  after(() => dispatchNotifications());
  updateTag('catalog');
}

const orderPage = (orderNumber: string) => `/admin/orders/${orderNumber}`;

export async function bulkOrders(_: ActionState, form: FormData): Promise<ActionState> {
  const ids = form.getAll('ids').map(String);
  if (ids.length === 0) return { ok: false, message: 'Select at least one order.' };
  const supabase = await createUserSupabase();

  if (form.get('op') === 'start') {
    const { data, error } = await supabase.rpc('admin_start_packing', { p_order_ids: ids });
    if (error) return failed(error);
    refresh();
    return done(`${data} ${data === 1 ? 'order' : 'orders'} moved to packing.`);
  }

  const { data, error } = await supabase.rpc('admin_pack_orders', { p_order_ids: ids });
  if (error) return failed(error);
  afterStatusChange();
  refresh();
  const problems = data.filter((r) => !r.ok);
  const packed = data.length - problems.length;
  if (problems.length === 0) return done(`${packed} ${packed === 1 ? 'order' : 'orders'} packed.`);
  return {
    ok: false,
    message: `${packed} packed. Not packed: ${problems.map((p) => `${p.order_number}: ${p.message}`).join(' ')}`,
  };
}

export async function packOrder(orderId: string, orderNumber: string, _: ActionState, form: FormData): Promise<ActionState> {
  void form;
  const supabase = await createUserSupabase();
  const { data, error } = await supabase.rpc('admin_pack_orders', { p_order_ids: [orderId] });
  if (error) return failed(error);
  if (!data[0]?.ok) return { ok: false, message: data[0]?.message ?? 'Couldn’t pack this order.' };
  afterStatusChange();
  flash(orderPage(orderNumber), 'Packed. The batches were taken off the shelf, earliest expiry first.');
}

export async function startPacking(orderId: string, orderNumber: string, _: ActionState, form: FormData): Promise<ActionState> {
  void form;
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_start_packing', { p_order_ids: [orderId] });
  if (error) return failed(error);
  flash(orderPage(orderNumber), 'Moved to packing.');
}

export async function dispatchOrder(orderId: string, orderNumber: string, _: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_dispatch_order', {
    p_order_id: orderId,
    p_rider_id: text(form, 'rider') || undefined,
    p_courier_reference: text(form, 'courier') || undefined,
    p_note: text(form, 'note') || undefined,
  });
  if (error) return failed(error);
  afterStatusChange();
  flash(orderPage(orderNumber), 'Out for delivery. The customer has been sent their delivery code.');
}

/** Pay on delivery: staff confirm the order (usually after a call), so it can be packed. */
export async function confirmCodOrder(orderId: string, orderNumber: string, _: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_confirm_cod_order', { p_order_id: orderId, p_note: text(form, 'note') || undefined });
  if (error) return failed(error);
  afterStatusChange();
  flash(orderPage(orderNumber), 'Order confirmed. It is in the to-pack queue, and the customer has been told.');
}

export async function markDelivered(orderId: string, orderNumber: string, _: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { data, error } = await supabase.rpc('admin_mark_delivered', {
    p_order_id: orderId,
    p_recipient: text(form, 'recipient'),
    p_code: text(form, 'code'),
    p_note: text(form, 'note') || undefined,
    p_cash_collected: form.get('cash_collected') === 'on',
  });
  if (error) return failed(error);
  if (data === 'wrong_code') {
    return { ok: false, message: 'That delivery code doesn’t match. Ask the customer for the code on their order page or SMS.' };
  }
  if (data === 'locked') {
    return {
      ok: false,
      message: 'Too many wrong codes for this order, so it’s locked and flagged for review. An admin can confirm the delivery.',
    };
  }
  afterStatusChange();
  flash(orderPage(orderNumber), 'Marked as delivered.');
}

export async function markFailed(orderId: string, orderNumber: string, _: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_mark_delivery_failed', {
    p_order_id: orderId,
    p_reason: text(form, 'reason') as DeliveryFailureReason,
    p_note: text(form, 'note') || undefined,
  });
  if (error) return failed(error);
  afterStatusChange();
  flash(orderPage(orderNumber), 'Recorded the failed delivery. The customer has been told.');
}

export async function returnToStock(orderId: string, orderNumber: string, _: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_return_to_stock', { p_order_id: orderId, p_note: text(form, 'note') || undefined });
  if (error) return failed(error);
  afterStatusChange();
  flash(orderPage(orderNumber), 'Returned to stock. The order is flagged for a refund.');
}

export async function cancelOrder(orderId: string, orderNumber: string, _: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_cancel_order', { p_order_id: orderId, p_reason: text(form, 'reason') });
  if (error) return failed(error);
  afterStatusChange();
  flash(orderPage(orderNumber), 'Order cancelled and its stock put back.');
}

export async function resolveFlag(orderId: string, orderNumber: string, flag: 'needs_review' | 'refund_due', _: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_resolve_order_flag', { p_order_id: orderId, p_flag: flag, p_note: text(form, 'note') });
  if (error) return failed(error);
  flash(orderPage(orderNumber), flag === 'refund_due' ? 'Marked as refunded.' : 'Marked as resolved.');
}
