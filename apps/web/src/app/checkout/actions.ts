'use server';

import { after } from 'next/server';
import type { MomoNetwork } from '@sleek/shared';
import { alertStoreNewOrder, dispatchNotifications } from '@/lib/notifications/dispatch';
import { logger } from '@/lib/observability';
import { rateLimitAction } from '@/lib/rate-limit';
import { startOrderPayment, type PaymentStart } from '@/lib/payments/start';
import { createUserSupabase } from '@/lib/supabase/server';

export interface PlaceOrderInput {
  customer: { name: string; phone: string; email?: string; area: string; ghanapostGps?: string; directions?: string; adultConfirmed: boolean };
  deliveryOption: string;
  payment: { method: 'momo'; network: MomoNetwork; wallet: string } | { method: 'card' };
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
      /** When the reserved stock is released if the order isn't paid, or for pay on delivery isn't confirmed (ISO timestamp). */
      reservedUntil: string;
      subtotal: number;
      deliveryFee: number | null;
      total: number | null;
      discount: number;
      promoCode: string | null;
      payment: Exclude<PaymentStart, { kind: 'failed' }> | null;
    }
  | { ok: false; error: string };

/**
 * Creates an order, reserves its stock and starts payment. The database prices every line and the payment amount;
 * client prices are never sent. Signed-in shoppers' orders are linked to their account.
 */
export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  // A person places a few orders at most; a script places many. Counted across every server instance.
  const limit = await rateLimitAction({ key: 'place-order', limit: 10, windowMs: 10 * 60_000 });
  if (!limit.allowed) return { ok: false, error: 'Too many orders from this connection. Please wait a few minutes and try again.' };
  const supabase = await createUserSupabase();
  const args = {
    p_customer: {
      name: input.customer.name,
      phone: input.customer.phone,
      email: input.customer.email ?? null,
      area: input.customer.area,
      ghanapost_gps: input.customer.ghanapostGps ?? null,
      directions: input.customer.directions ?? null,
      adult_confirmed: input.customer.adultConfirmed,
    },
    p_delivery_option: input.deliveryOption,
    p_payment:
      input.payment.method === 'momo'
        ? { method: 'momo', network: input.payment.network, wallet: input.payment.wallet }
        : { method: input.payment.method },
    p_items: input.items.map((i) => ({ slug: i.slug, size: i.size ?? null, quantity: i.quantity })),
    p_is_gift: input.isGift,
  };
  const promoCode = input.promoCode?.trim();
  const { data, error } = promoCode
    ? await supabase.rpc('place_order', { ...args, p_promo_code: promoCode }).single()
    : await supabase.rpc('place_order', args).single();

  if (error || !data) {
    // place_order raises 22023 with a message written for shoppers; anything else is unexpected.
    if (error?.code === '22023') return { ok: false, error: error.message };
    if (promoCode && error?.code === 'PGRST202') return { ok: false, error: 'Promo codes are temporarily unavailable. Remove the code to continue.' };
    console.error('place_order failed', error);
    return { ok: false, error: 'We couldn’t place your order. Please try again.' };
  }

  if (input.saveAddress) {
    // Best effort: the order is placed either way.
    const address = {
      recipient_name: input.customer.name,
      phone: input.customer.phone,
      area: input.customer.area,
      ghanapost_gps: input.customer.ghanapostGps ?? '',
      directions: input.customer.directions ?? '',
    };
    let { error: saveError } = await supabase.rpc('save_address', { p: address });
    // An address book only keeps areas we list; a typed-in area is saved without one (the shopper types it again next time).
    if (saveError?.code === '22023') ({ error: saveError } = await supabase.rpc('save_address', { p: { ...address, area: '' } }));
    if (saveError && saveError.code !== '22023') console.error('save_address failed', saveError);
  }

  if (input.saveWallet && input.payment.method === 'momo') {
    // Best effort too. Only the network and number are kept, never a PIN.
    const { error: saveError } = await supabase.rpc('save_payment_method', {
      p: { network: input.payment.network, wallet_number: input.payment.wallet },
    });
    if (saveError && saveError.code !== '22023') console.error('save_payment_method failed', saveError);
  }

  // The generated types can't express that these are NULL until delivery fees are set.
  const deliveryFee = (data.delivery_fee_ghs as number | null) ?? null;
  const total = (data.total_ghs as number | null) ?? null;
  const discount = 'discount_ghs' in data ? Number(data.discount_ghs) : 0;
  const appliedPromoCode = 'promo_code' in data && typeof data.promo_code === 'string' ? data.promo_code : null;
  if (input.isGift && input.giftMessage?.trim()) {
    const { error: giftError } = await supabase.rpc('set_order_gift_details' as never, {
      p_order_token: data.order_token,
      p_message: input.giftMessage.trim(),
    } as never);
    if (giftError) return { ok: false, error: giftError.message };
  }

  // The "order received" email is queued by place_order; send it now instead of waiting for the next scheduled run.
  logger.info('order_placed', { orderNumber: data.order_number, source: 'web', emailGiven: Boolean(input.customer.email) });
  after(() => dispatchNotifications());

  // A shopper using a code reviews the discounted total before we start payment.
  const payment: PaymentStart | null = appliedPromoCode ? null : await startOrderPayment(
    { token: data.order_token, number: data.order_number, total },
    input.payment.method === 'card' ? { method: 'card' } : { method: 'momo', network: input.payment.network, wallet: input.payment.wallet },
  );
  if (payment?.kind === 'failed') return { ok: false, error: payment.reason };

  // Tell the store about every order, whether or not the shopper gave an email.
  if (payment) after(() =>
    alertStoreNewOrder({
      orderNumber: data.order_number,
      total,
      customerName: input.customer.name,
      phone: input.customer.phone,
      area: input.customer.area,
      itemCount: input.items.reduce((n, i) => n + i.quantity, 0),
      source: 'web',
      payment: payment.kind,
    }),
  );

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
