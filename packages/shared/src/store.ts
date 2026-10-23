/**
 * Starting delivery fees in GHS, written to supabase/seed.sql. The live fees are in the `delivery_options` table.
 * `null` means the fee has not been set yet.
 */
export const deliveryFees: { standard: number | null; sameDay: number | null } = {
  standard: null,
  sameDay: null,
};

export const defaultDeliveryArea = 'East Legon';

/** Sample signed-in customer used to prefill checkout until accounts exist. */
export const sampleCustomer = {
  name: 'Akosua Mensah',
  phone: '024 000 0000',
  area: 'East Legon',
  ghanaPostGps: 'GA-000-0000',
};

export type OrderStepState = 'done' | 'current' | 'upcoming';

/** Order shown on the tracking screen until orders come from the API. */
export const sampleOrder = {
  paidWith: 'MTN MoMo',
  eta: 'Arriving today',
  rider: { name: 'Your rider', vehicle: 'Motorbike' },
  steps: [
    { title: 'Order placed', detail: 'Your order is confirmed', state: 'done' },
    { title: 'Payment confirmed', detail: 'Paid with MTN MoMo', state: 'done' },
    { title: 'Packed and batch-checked', detail: 'Batch and expiry are printed on your receipt', state: 'done' },
    { title: 'Out for delivery', detail: 'Rider is on the way to East Legon', state: 'current' },
    { title: 'Delivered', detail: 'Show your order code to the rider', state: 'upcoming' },
  ] satisfies { title: string; detail: string; state: OrderStepState }[],
};

/** Bag contents shown in the design's mobile checkout; the mobile app starts with these. */
export const sampleBag: { slug: string; sizeId?: string; qty: number }[] = [
  { slug: 'gentle-baby-wash-shampoo', sizeId: '400', qty: 1 },
  { slug: 'vitamin-c-brightening-serum', sizeId: '30', qty: 1 },
];

export const city = 'Accra';

export const paymentMethodsLine = 'MTN MoMo · Telecel Cash · AT Money · Visa · Mastercard';

export function formatPrice(amount: number): string {
  return `GH₵ ${amount.toLocaleString('en-US')}`;
}

/** Formats an optional amount, or returns `fallback` (for example "To be confirmed") when it isn't known yet. */
export function formatPriceOr(amount: number | null, fallback: string): string {
  return amount === null ? fallback : formatPrice(amount);
}
