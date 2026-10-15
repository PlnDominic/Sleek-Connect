'use server';

import { createSupabase } from '@/lib/supabase/server';

export interface PlaceOrderInput {
  customer: { name: string; phone: string; area: string; ghanapostGps?: string; directions?: string };
  deliveryOption: string;
  payment: { method: 'momo' | 'card'; network?: string; wallet?: string };
  items: { slug: string; size?: string; quantity: number }[];
  isGift: boolean;
}

export type PlaceOrderResult =
  | { ok: true; orderNumber: string; subtotal: number; deliveryFee: number | null; total: number | null }
  | { ok: false; error: string };

/** Creates a pending-payment order. The database prices every line; client prices are never sent. */
export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const { data, error } = await createSupabase()
    .rpc('place_order', {
      p_customer: {
        name: input.customer.name,
        phone: input.customer.phone,
        area: input.customer.area,
        ghanapost_gps: input.customer.ghanapostGps ?? null,
        directions: input.customer.directions ?? null,
      },
      p_delivery_option: input.deliveryOption,
      p_payment: { method: input.payment.method, network: input.payment.network ?? null, wallet: input.payment.wallet ?? null },
      p_items: input.items.map((i) => ({ slug: i.slug, size: i.size ?? null, quantity: i.quantity })),
      p_is_gift: input.isGift,
    })
    .single();

  if (error || !data) {
    // place_order raises 22023 with a message written for shoppers; anything else is unexpected.
    if (error?.code === '22023') return { ok: false, error: error.message };
    console.error('place_order failed', error);
    return { ok: false, error: 'We couldn’t place your order. Please try again.' };
  }

  return {
    ok: true,
    orderNumber: data.order_number,
    subtotal: data.subtotal_ghs,
    // The generated types can't express that these are NULL until fees are set.
    deliveryFee: (data.delivery_fee_ghs as number | null) ?? null,
    total: (data.total_ghs as number | null) ?? null,
  };
}
