'use server';

import type { MomoNetwork } from '@sleek/shared';
import { startOrderPayment, type PaymentStart } from '@/lib/payments/start';
import { createUserSupabase } from '@/lib/supabase/server';

export interface PlaceOrderInput {
  customer: { name: string; phone: string; email?: string; area: string; ghanapostGps?: string; directions?: string };
  deliveryOption: string;
  payment: { method: 'momo'; network: MomoNetwork; wallet: string };
  items: { slug: string; size?: string; quantity: number }[];
  isGift: boolean;
  promoCode?: string;
  giftMessage?: string;
  /** Also save the delivery details to the signed-in shopper's addresses. */
  saveAddress?: boolean;
  /** Also save the Mobile Money number to the signed-in shopper's saved numbers. */
  saveWallet?: boolean;
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
      discount: number;
      promoCode: string | null;
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
        email: input.customer.email ?? null,
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

  if (input.saveAddress) {
    // Best effort: the order is placed either way.
    const { error: saveError } = await supabase.rpc('save_address', {
      p: {
        recipient_name: input.customer.name,
        phone: input.customer.phone,
        area: input.customer.area,
        ghanapost_gps: input.customer.ghanapostGps ?? '',
        directions: input.customer.directions ?? '',
      },
    });
    if (saveError && saveError.code !== '22023') console.error('save_address failed', saveError);
  }

  if (input.saveWallet) {
    // Best effort too. Only the network and number are kept, never a PIN.
    const { error: saveError } = await supabase.rpc('save_payment_method', {
      p: { network: input.payment.network, wallet_number: input.payment.wallet },
    });
    if (saveError && saveError.code !== '22023') console.error('save_payment_method failed', saveError);
  }

  // The generated types can't express that these are NULL until delivery fees are set.
  const deliveryFee = (data.delivery_fee_ghs as number | null) ?? null;
  let total = (data.total_ghs as number | null) ?? null;
  let discount = 0;
  let appliedPromoCode: string | null = null;
  if (input.promoCode?.trim()) {
    const { data: promotion, error: promotionError } = await supabase.rpc('apply_order_promotion' as never, {
      p_order_token: data.order_token,
      p_code: input.promoCode.trim(),
    } as never);
    const promotionRow = promotion?.[0] as unknown as { discount_ghs: number; total_ghs: number; promo_code: string } | undefined;
    if (promotionError || !promotionRow) return { ok: false, error: promotionError?.message ?? 'That promo code could not be applied.' };
    discount = Number(promotionRow.discount_ghs ?? 0);
    total = Number(promotionRow.total_ghs ?? total);
    appliedPromoCode = promotionRow.promo_code ?? input.promoCode.trim().toUpperCase();
  }
  if (input.isGift && input.giftMessage?.trim()) {
    const { error: giftError } = await supabase.rpc('set_order_gift_details' as never, {
      p_order_token: data.order_token,
      p_message: input.giftMessage.trim(),
    } as never);
    if (giftError) return { ok: false, error: giftError.message };
  }

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
    discount,
    promoCode: appliedPromoCode,
    payment,
  };
}
