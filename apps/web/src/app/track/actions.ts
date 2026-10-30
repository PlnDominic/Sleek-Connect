'use server';

import { redirect } from 'next/navigation';
import { createSupabase } from '@/lib/supabase/server';
import { rateLimitAction } from '@/lib/rate-limit';

export type TrackState = { error: string } | null;

/** Opens the order page for an order number, when the phone number matches the one used at checkout. */
export async function trackOrder(_: TrackState, form: FormData): Promise<TrackState> {
  const orderNumber = String(form.get('order_number') ?? '').trim();
  const phone = String(form.get('phone') ?? '').trim();
  if (!orderNumber || !phone) return { error: 'Enter the order number and the phone number used at checkout.' };

  // The database pauses lookups for a phone or order number that keeps missing; this slows a caller who tries
  // many different combinations (P0 item 9).
  const limit = await rateLimitAction({ key: 'order-lookup', limit: 20, windowMs: 15 * 60_000 });
  if (!limit.allowed) {
    return { error: `Too many lookups just now. Try again in ${Math.ceil(limit.retryAfter / 60)} minute(s).` };
  }

  const { data: token, error } = await createSupabase().rpc('find_order', { p_order_number: orderNumber, p_phone: phone });
  if (error) {
    console.error(error);
    return { error: 'We couldn’t look that up just now. Please try again.' };
  }
  if (!token) {
    return {
      error:
        'We couldn’t find an order with that number and phone. Check both (the order number looks like SC-1234). ' +
        'After several tries, lookups pause for an hour; contact us if you’re stuck.',
    };
  }
  redirect(`/orders/${token}`);
}
