'use server';

import type { MomoNetwork } from '@sleek/shared';
import { startOrderPayment, type PaymentStart } from '@/lib/payments/start';
import { createUserSupabase } from '@/lib/supabase/server';

export interface PlaceOrderInput {
  customer: { name: string; phone: string; area: string; ghanapostGps?: string; directions?: string };
  deliveryOption: string;
  payment: { method: 'momo'; network: MomoNetwork; wallet: string };
  items: { slug: string; size?: string; quantity: number }[];
  isGift: boolean;
}

export type PlaceOrderResult =
  | {
      ok: true;
      orderNumber: string;
      /** Lets the browser follow the order's payment status without signing in. */
      orderToken: string;
      /** When the reserved stock is released if the order isn't paid (ISO timestamp). */
      reservedUntil: string;
      subtotal: number;
      deliveryFee: number | null;
      total: number | null;
      payment: Exclude<PaymentStart, { kind: 'failed' }>;
    }
  | { ok: false; error: string };

/**
 * Creates an order, reserves its stock and starts payment. The database prices every line and the payment amount;
 * client prices are never sent. Signed-in shoppers' orders are linked to their account.
 */
export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const supabase = await createUserSupabase();
  const { data, error } = await supabase
    .rpc('place_order', {
      p_customer: {
        name: input.customer.name,
        phone: input.customer.phone,
        area: input.customer.area,
        ghanapost_gps: input.customer.ghanapostGps ?? null,
        directions: input.customer.directions ?? null,
      },
      p_delivery_option: input.deliveryOption,
      p_payment: { method: input.payment.method, network: input.payment.network, wallet: input.payment.wallet },
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

  // The generated types can't express that these are NULL until delivery fees are set.
  const deliveryFee = (data.delivery_fee_ghs as number | null) ?? null;
  const total = (data.total_ghs as number | null) ?? null;

  const payment = await startOrderPayment(
    { token: data.order_token, number: data.order_number, total },
    { network: input.payment.network, wallet: input.payment.wallet },
  );
  if (payment.kind === 'failed') return { ok: false, error: payment.reason };

  return {
    ok: true,
    orderNumber: data.order_number,
    orderToken: data.order_token,
    reservedUntil: data.reserved_until,
    subtotal: data.subtotal_ghs,
    deliveryFee,
    total,
    payment,
  };
}
