import type { DeliveryConfig, MomoNetwork } from '@sleek/shared';
import { siteAddress, siteConfigured } from './site';
import { supabase } from './supabase';

export async function getDeliveryConfig(): Promise<DeliveryConfig> {
  const [areas, zones, rates, options, settings, cod] = await Promise.all([
    supabase.from('delivery_areas').select('name, zone_id').eq('is_active', true).order('sort_order'),
    supabase.from('delivery_zones').select('id, name').order('sort_order'),
    supabase.from('delivery_rates').select('zone_id, option_id, fee_ghs, is_available'),
    supabase.from('delivery_options').select('id, label, fee_ghs, free_eligible, days_min, days_max, cutoff_time').order('sort_order'),
    supabase.from('store_settings').select('free_delivery_threshold_ghs').single(),
    // Read apart from the rest, so the app still checks out (without the option) on a database that doesn't have it yet.
    supabase.from('store_settings').select('pay_on_delivery_enabled, pay_on_delivery_max_ghs').single(),
  ]);
  for (const r of [areas, zones, rates, options, settings]) if (r.error) throw new Error(r.error.message);
  type Row = Record<string, unknown>;
  return {
    areas: (areas.data as Row[]).map((a) => ({ name: a.name as string, zoneId: (a.zone_id as string | null) ?? null })),
    zones: zones.data as { id: string; name: string }[],
    rates: (rates.data as Row[]).map((r) => ({
      zoneId: r.zone_id as string,
      optionId: r.option_id as string,
      fee: (r.fee_ghs as number | null) ?? null,
      available: r.is_available as boolean,
    })),
    options: (options.data as Row[]).map((o) => ({
      id: o.id as string,
      label: o.label as string,
      fee: (o.fee_ghs as number | null) ?? null,
      freeEligible: o.free_eligible as boolean,
      daysMin: (o.days_min as number | null) ?? null,
      daysMax: (o.days_max as number | null) ?? null,
      cutoff: (o.cutoff_time as string | null)?.slice(0, 5) ?? null,
    })),
    freeThreshold: (settings.data as Row | null)?.free_delivery_threshold_ghs as number | null ?? null,
    payOnDelivery: {
      enabled: ((cod.data as Row | null)?.pay_on_delivery_enabled as boolean | undefined) ?? false,
      maxGhs: ((cod.data as Row | null)?.pay_on_delivery_max_ghs as number | null | undefined) ?? null,
    },
  };
}

export interface PlaceOrderInput {
  customer: { name: string; phone: string; email?: string; area: string; ghanapostGps?: string; directions?: string };
  deliveryOption: string;
  payment: { network: MomoNetwork; wallet: string } | { cod: true };
  items: { slug: string; size?: string; quantity: number }[];
  promoCode?: string;
  signedIn: boolean;
}

export interface PlacedOrder {
  orderNumber: string;
  orderToken: string;
  reservedUntil: string;
  total: number | null;
  discount: number;
}

/**
 * Creates the order and reserves its stock. The database prices every line and the total; only slugs, sizes and
 * quantities are sent. Signed-in shoppers' orders are linked to their account.
 */
export async function placeOrder(input: PlaceOrderInput): Promise<PlacedOrder> {
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
      p_payment: 'cod' in input.payment ? { method: 'cod' } : { method: 'momo', network: input.payment.network, wallet: input.payment.wallet },
      p_items: input.items.map((i) => ({ slug: i.slug, size: i.size ?? null, quantity: i.quantity })),
      p_is_gift: false,
    })
    .single();
  const order = data as { order_number: string; order_token: string; reserved_until: string; total_ghs: number | null } | null;
  if (error || !order) {
    // place_order raises 22023 with a message written for shoppers; anything else is unexpected.
    throw new Error(error?.code === '22023' ? error.message : 'We couldn’t place your order. Please try again.');
  }

  let total = order.total_ghs ?? null;
  let discount = 0;
  if (input.promoCode?.trim()) {
    const { data: promotion, error: promotionError } = await supabase.rpc('apply_order_promotion', {
      p_order_token: order.order_token,
      p_code: input.promoCode.trim(),
    });
    const row = (promotion as { discount_ghs: number; total_ghs: number }[] | null)?.[0];
    if (promotionError || !row) throw new Error(promotionError?.message ?? 'That promo code could not be applied.');
    discount = Number(row.discount_ghs ?? 0);
    total = Number(row.total_ghs ?? total);
  }

  if (input.signedIn) {
    // Best effort: the order is placed either way.
    await supabase.rpc('save_address', {
      p: {
        recipient_name: input.customer.name,
        phone: input.customer.phone,
        area: input.customer.area,
        ghanapost_gps: input.customer.ghanapostGps ?? '',
        directions: input.customer.directions ?? '',
      },
    });
  }
  return { orderNumber: order.order_number, orderToken: order.order_token, reservedUntil: order.reserved_until, total, discount };
}

/** Tells the website a pay on delivery order was placed, so the shopper's email and the store's alert go out now. */
export async function notifyCodOrder(orderToken: string): Promise<void> {
  if (!siteConfigured) return;
  try {
    await fetch(siteAddress('/api/payments/cod'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderToken }),
    });
  } catch {
    // Best effort: the order is placed, and the scheduled sender picks its emails up anyway.
  }
}

export type PaymentRequest = { kind: 'requested'; testMode: boolean } | { kind: 'unavailable' | 'failed'; reason: string };

/** Asks the website to send the Mobile Money prompt for an order that has been placed. */
export async function requestPayment(orderToken: string, payment: { network: MomoNetwork; wallet: string }): Promise<PaymentRequest> {
  if (!siteConfigured) return { kind: 'unavailable', reason: 'Payment isn’t set up in this version of the app yet.' };
  try {
    const response = await fetch(siteAddress('/api/payments/start'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderToken, network: payment.network, wallet: payment.wallet }),
    });
    const body = (await response.json()) as PaymentRequest;
    if (body && typeof body === 'object' && 'kind' in body) return body;
  } catch {
    // Offline or the site is unreachable.
  }
  return { kind: 'failed', reason: 'We couldn’t reach the store to send the payment prompt. Check your connection and try again.' };
}
