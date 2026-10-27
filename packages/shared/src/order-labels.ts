export type OrderStatus =
  | 'pending_payment'
  | 'paid'
  | 'packing'
  | 'packed'
  | 'out_for_delivery'
  | 'delivery_failed'
  | 'delivered'
  | 'cancelled'
  | 'returned';

export type DeliveryFailureReason = 'customer_unreachable' | 'customer_absent' | 'wrong_address' | 'refused' | 'rider_issue' | 'other';

/** What each status is called in the order history. */
export const statusLabels: Record<OrderStatus, string> = {
  pending_payment: 'Order placed',
  paid: 'Payment confirmed',
  packing: 'Packing your order',
  packed: 'Packed and batch-checked',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  delivery_failed: 'Delivery attempt failed',
  cancelled: 'Cancelled',
  returned: 'Returned to us',
};

/** Short status names for lists and badges. */
export const statusShort: Record<OrderStatus, string> = {
  pending_payment: 'Awaiting payment',
  paid: 'Confirmed',
  packing: 'Packing',
  packed: 'Ready for dispatch',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  delivery_failed: 'Delivery failed',
  cancelled: 'Cancelled',
  returned: 'Returned',
};

export const failureReasons: Record<DeliveryFailureReason, string> = {
  customer_unreachable: 'We couldn’t reach you by phone',
  customer_absent: 'No one was available to receive it',
  wrong_address: 'We couldn’t find the address',
  refused: 'The delivery was refused',
  rider_issue: 'Our rider ran into a problem',
  other: 'Something went wrong with the delivery',
};

export const networkNames = { mtn: 'MTN MoMo', telecel: 'Telecel Cash', at: 'AT Money' } as const;

/** Orders that won't change any more. */
export const finalStatuses: OrderStatus[] = ['delivered', 'cancelled', 'returned'];

const happyPath: OrderStatus[] = ['pending_payment', 'paid', 'packed', 'out_for_delivery', 'delivered'];

export type StepState = 'done' | 'current' | 'upcoming';
export interface TimelineStep {
  key: string;
  title: string;
  at?: string;
  detail?: string;
  state: StepState;
}

/**
 * The order's history followed by the steps still to come. The latest entry is "current" unless the order is
 * finished.
 */
export function buildTimeline(order: {
  status: OrderStatus;
  events: { status: OrderStatus; at: string; reason: DeliveryFailureReason | null }[];
}): TimelineStep[] {
  const final = finalStatuses.includes(order.status);
  const steps: TimelineStep[] = order.events.map((event, i) => ({
    key: `${event.status}-${i}`,
    title: statusLabels[event.status],
    at: event.at,
    detail: event.reason ? failureReasons[event.reason] : undefined,
    state: i === order.events.length - 1 && !final ? 'current' : 'done',
  }));
  if (!final) {
    const from = order.status === 'delivery_failed' ? happyPath.indexOf('out_for_delivery') : happyPath.indexOf(
      order.status === 'packing' ? 'paid' : order.status,
    );
    for (const status of happyPath.slice(from + 1)) {
      steps.push({ key: `next-${status}`, title: statusLabels[status], state: 'upcoming' });
    }
  }
  return steps;
}
