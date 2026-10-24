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

export const city = 'Accra';

export const paymentMethodsLine = 'MTN MoMo · Telecel Cash · AT Money · Visa · Mastercard';

export function formatPrice(amount: number): string {
  return `GH₵ ${amount.toLocaleString('en-US')}`;
}

/** Formats an optional amount, or returns `fallback` (for example "To be confirmed") when it isn't known yet. */
export function formatPriceOr(amount: number | null, fallback: string): string {
  return amount === null ? fallback : formatPrice(amount);
}
