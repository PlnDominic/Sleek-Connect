import type { DeliveryOption } from './delivery';
import type { OrderStatus } from './orders';

/** The four steps a shopper cares about, shown as a progress bar on the order page and in the order list. */
export const trackingStages = ['Confirmed', 'Packed', 'On the way', 'Delivered'] as const;

export interface TrackingProgress {
  /** Steps completed, 0–4. */
  done: number;
  /** The step happening now (0-based), or null when the order has stopped. */
  current: number | null;
  /** Something needs attention: a failed delivery, a cancellation or a return to stock. */
  problem: string | null;
}

export function trackingProgress(status: OrderStatus): TrackingProgress {
  switch (status) {
    case 'pending_payment':
      return { done: 0, current: 0, problem: null };
    case 'paid':
    case 'packing':
      return { done: 1, current: 1, problem: null };
    case 'packed':
      return { done: 2, current: 2, problem: null };
    case 'out_for_delivery':
      return { done: 3, current: 3, problem: null };
    case 'delivered':
      return { done: 4, current: null, problem: null };
    case 'delivery_failed':
      return { done: 2, current: 2, problem: 'Delivery didn’t go through. We’ll call you to rearrange it.' };
    case 'cancelled':
      return { done: 0, current: null, problem: 'This order was cancelled.' };
    case 'returned':
      return { done: 2, current: null, problem: 'This order came back to us after delivery attempts.' };
  }
}

const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;

/** Adds working days (Monday to Friday). Accra keeps GMT all year, so UTC dates are local dates. */
function addWorkingDays(from: Date, days: number): Date {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  while (isWeekend(d)) d.setUTCDate(d.getUTCDate() + 1);
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (!isWeekend(d)) left--;
  }
  return d;
}

const day = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * When a paid order should arrive, from its delivery option: dispatch is the day it was paid (or the next working day
 * after the cut-off), then the option's working days. Null when the option has no times set.
 */
export function expectedDelivery(option: DeliveryOption | undefined, paidAt: string): string | null {
  if (!option || (option.daysMin === null && option.daysMax === null)) return null;
  const paid = new Date(paidAt);
  const late = option.cutoff !== null && paid.toISOString().slice(11, 16) >= option.cutoff;
  // A weekend order waits for Monday anyway; a late weekday order goes out the next working day.
  const dispatch = addWorkingDays(paid, late && !isWeekend(paid) ? 1 : 0);
  const min = option.daysMin ?? option.daysMax!;
  const max = Math.max(option.daysMax ?? min, min);
  const first = addWorkingDays(dispatch, min);
  const last = addWorkingDays(dispatch, max);
  return first.getTime() === last.getTime() ? day.format(first) : `${day.format(first)} – ${day.format(last)}`;
}
