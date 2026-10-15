/**
 * Store settings the business has not decided yet (BRD/PRD mark these "To be set").
 * The design shows them as bracketed placeholders, and so do the apps until a value
 * is filled in here.
 */
export const pending = {
  freeDeliveryThreshold: '[X]',
  saleMaxPercent: '[X]',
  shopperCount: '[X]',
  deliveryDays: '[X]',
  orderCutoffTime: '[cut-off time]',
  sameDayCutoffTime: '[time]',
  returnWindowDays: '[X]',
  fdaRegistration: '[Reg. number]',
  batchNumber: '[Batch no.]',
  expiryDate: '[Expiry date]',
  periodAfterOpening: '[12M]',
  ingredientList: '[Full INCI list as printed on the pack, in order of concentration]',
} as const;

/** Delivery fees in GHS. `null` means the fee has not been set and is shown as a placeholder. */
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

/** Order shown on the tracking screen until orders come from the API. Bracketed values are placeholders. */
export const sampleOrder = {
  number: '[order no.]',
  paidWith: 'MTN MoMo',
  eta: 'Arriving today, [time window]',
  rider: { name: '[Rider name]', vehicle: 'Motorbike' },
  steps: [
    { title: 'Order placed', detail: '[Date], [time]', state: 'done' },
    { title: 'Payment confirmed', detail: 'MTN MoMo · GH₵ [total]', state: 'done' },
    { title: 'Packed and batch-checked', detail: 'Batch [no.] · Expires [date]', state: 'done' },
    { title: 'Out for delivery', detail: 'Rider is on the way to East Legon', state: 'current' },
    { title: 'Delivered', detail: 'Show your order code to the rider', state: 'upcoming' },
  ] satisfies { title: string; detail: string; state: OrderStepState }[],
};

export interface BagLine {
  slug: string;
  sizeId?: string;
  qty: number;
}

/** Bag contents shown in the design's checkout. Both apps start from this until a real cart service exists. */
export const sampleBag: BagLine[] = [
  { slug: 'gentle-baby-wash-shampoo', sizeId: '400', qty: 1 },
  { slug: 'vitamin-c-brightening-serum', sizeId: '30', qty: 1 },
];
export const city = 'Accra';

export const paymentMethodsLine = 'MTN MoMo · Telecel Cash · AT Money · Visa · Mastercard';

export function formatPrice(amount: number): string {
  return `GH₵ ${amount.toLocaleString('en-US')}`;
}

/** Formats an optional amount, falling back to the design's bracketed placeholder. */
export function formatPriceOr(amount: number | null, placeholder: string): string {
  return amount === null ? `GH₵ ${placeholder}` : formatPrice(amount);
}
