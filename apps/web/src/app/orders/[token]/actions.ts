'use server';

import { UUID_PATTERN } from '@/lib/orders';
import { createSupabase } from '@/lib/supabase/server';

/** Cancels the order behind an order-page link, if packing hasn't started (PRD FR-052). */
export async function cancelOrder(token: string, reason: string): Promise<{ ok: boolean; message: string }> {
  if (!UUID_PATTERN.test(token)) return { ok: false, message: 'We couldn’t find that order.' };
  const { error } = await createSupabase().rpc('cancel_my_order', { p_order_token: token, p_reason: reason });
  if (error) {
    if (error.code === '22023') return { ok: false, message: error.message };
    console.error(error);
    return { ok: false, message: 'That didn’t work. Please try again.' };
  }
  return { ok: true, message: 'Your order is cancelled.' };
}
