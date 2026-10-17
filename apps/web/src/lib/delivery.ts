import { pending } from '@sleek/shared';

/** A delivery window as staff set it in Admin → Delivery. */
export interface DeliveryOption {
  id: string;
  label: string;
  /** Standard fee; null until the business sets it. */
  fee: number | null;
  /** Free once the bag reaches the free-delivery threshold. */
  freeEligible: boolean;
  /** Working days from dispatch to delivery. */
  daysMin: number | null;
  daysMax: number | null;
  /** "HH:MM" (Accra time): orders paid before this are dispatched the same day. */
  cutoff: string | null;
}

export interface DeliveryConfig {
  areas: { name: string; zoneId: string | null }[];
  zones: { id: string; name: string }[];
  rates: { zoneId: string; optionId: string; fee: number | null; available: boolean }[];
  options: DeliveryOption[];
  freeThreshold: number | null;
}

export interface DeliveryQuote {
  available: boolean;
  fee: number | null;
  free: boolean;
}

/** What an option costs for an area and bag subtotal. Mirrors `place_order`, which has the final say. */
export function quote(config: DeliveryConfig, areaName: string, optionId: string, subtotal: number): DeliveryQuote {
  const option = config.options.find((o) => o.id === optionId);
  if (!option) return { available: false, fee: null, free: false };
  const zoneId = config.areas.find((a) => a.name === areaName)?.zoneId ?? null;
  const rate = zoneId ? config.rates.find((r) => r.zoneId === zoneId && r.optionId === optionId) : undefined;
  if (rate && !rate.available) return { available: false, fee: null, free: false };
  const free = option.freeEligible && config.freeThreshold !== null && subtotal >= config.freeThreshold;
  return { available: true, fee: free ? 0 : (rate?.fee ?? option.fee), free };
}

/** "14:00" → "2:00 pm". */
export function formatCutoff(cutoff: string): string {
  const [h, m] = cutoff.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/**
 * How long an option takes, e.g. "Today if you order by 2:00 pm" or "1–2 working days". Pass `now` (client only) to
 * account for the cut-off having passed; without it the text doesn't depend on the time of day.
 */
export function estimate(option: DeliveryOption, now?: Date): string {
  if (option.daysMin === null && option.daysMax === null) return `${pending.deliveryDays} working days`;
  const min = option.daysMin ?? option.daysMax!;
  const max = Math.max(option.daysMax ?? min, min);
  // Accra keeps GMT, so the UTC clock is local time.
  const late = option.cutoff !== null && now !== undefined && now.toISOString().slice(11, 16) >= option.cutoff;
  const lo = min + (late ? 1 : 0);
  const hi = max + (late ? 1 : 0);
  const days = hi === 0 ? 'Today' : lo === hi ? (hi === 1 ? 'Next working day' : `${hi} working days`) : `${lo}–${hi} working days`;
  if (option.cutoff === null) return days;
  if (late) return `${days} (ordered after ${formatCutoff(option.cutoff)})`;
  return `${days} if you order by ${formatCutoff(option.cutoff)}`;
}
