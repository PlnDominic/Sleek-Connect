'use server';

import { redirect } from 'next/navigation';
import { createSupabase } from '@/lib/supabase/server';

export type TrackState = { error: string } | null;

/** Opens the order page for an order number, when the phone number matches the one used at checkout. */
export async function trackOrder(_: TrackState, form: FormData): Promise<TrackState> {
  const orderNumber = String(form.get('order_number') ?? '').trim();
  const phone = String(form.get('phone') ?? '').trim();
  if (!orderNumber || !phone) return { error: 'Enter the order number and the phone number used at checkout.' };

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
