import type { Database } from '@/lib/supabase/database.types';
import type { ImageKey, ProductKind } from '@sleek/shared';

export type OrderStatus = Database['public']['Enums']['order_status'];
export type DeliveryFailureReason = Database['public']['Enums']['delivery_failure_reason'];

/** The customer's view of an order, as returned by `get_order(token)`. */
export interface CustomerOrder {
  order_number: string;
  status: OrderStatus;
  created_at: string;
  paid_at: string | null;
  reserved_until: string | null;
  customer_name: string;
  phone: string;
  area: string;
  ghanapost_gps: string | null;
  directions: string | null;
  delivery_option: string;
  is_gift: boolean;
  payment_method: 'momo' | 'card';
  momo_network: 'mtn' | 'telecel' | 'at' | null;
  wallet_ending: string | null;
  subtotal_ghs: number;
  delivery_fee_ghs: number | null;
  total_ghs: number | null;
  delivery_code: string | null;
  rider: { name: string; vehicle: string } | null;
  courier_reference: string | null;
  delivered_at: string | null;
  delivered_to: string | null;
  refund_due: boolean;
  /** Last moment a return can be requested (delivered orders only). */
  return_until: string | null;
  /** True while a return can still be requested. */
  return_open: boolean;
  /** True until packing starts: the customer can cancel online (PRD FR-052). */
  can_cancel: boolean;
  returns: CustomerReturn[];
  items: {
    id: string;
    name: string;
    slug: string | null;
    size_label: string | null;
    quantity: number;
    unit_price_ghs: number;
    line_total_ghs: number;
    image_key: ImageKey | null;
    tint: string | null;
    kind: ProductKind | null;
    photo_path: string | null;
    size_code: string | null;
    warning_label: string | null;
    returnable: boolean;
    return_note: string | null;
    /** Units already in a return that wasn't rejected. */
    return_requested: number;
    batches: { code: string; expires_on: string | null; quantity: number }[];
  }[];
  events: { status: OrderStatus; at: string; reason: DeliveryFailureReason | null }[];
}

export type ReturnStatus = 'requested' | 'approved' | 'rejected' | 'received' | 'refunded';
export type ReturnReason = 'damaged' | 'wrong_item' | 'not_as_described' | 'expired_or_near_expiry' | 'changed_mind' | 'other';

export interface CustomerReturn {
  case_number: string;
  status: ReturnStatus;
  reason: ReturnReason;
  created_at: string;
  decision_note: string | null;
  refund_amount_ghs: number | null;
  items: { name: string; size_label: string | null; quantity: number }[];
}

export const returnReasons: Record<ReturnReason, string> = {
  damaged: 'Arrived damaged or leaking',
  wrong_item: 'Wrong item or size',
  not_as_described: 'Not as described',
  expired_or_near_expiry: 'Expired or close to expiry',
  changed_mind: 'Changed my mind (unopened)',
  other: 'Something else',
};

/** Reasons where we got it wrong, so items that can't normally be returned still can. */
export const faultReasons: ReturnReason[] = ['damaged', 'wrong_item', 'expired_or_near_expiry'];

export const returnStatusLabels: Record<ReturnStatus, string> = {
  requested: 'Waiting for review',
  approved: 'Approved: we’ll arrange collection',
  rejected: 'Not accepted',
  received: 'Item received: refund in progress',
  refunded: 'Refunded',
};

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
export function buildTimeline(order: Pick<CustomerOrder, 'status' | 'events'>): TimelineStep[] {
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

const dateTime = new Intl.DateTimeFormat('en-GH', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Africa/Accra',
});
const dateOnly = new Intl.DateTimeFormat('en-GH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Accra' });
const timeOnly = new Intl.DateTimeFormat('en-GH', { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Accra' });

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatDate = (iso: string) => dateOnly.format(new Date(iso));
export const formatTime = (iso: string) => timeOnly.format(new Date(iso));

export function paymentSummary(order: Pick<CustomerOrder, 'payment_method' | 'momo_network' | 'wallet_ending'>): string {
  if (order.payment_method === 'card') return 'Card';
  const network = order.momo_network ? networkNames[order.momo_network] : 'Mobile Money';
  return order.wallet_ending ? `${network}, wallet ending ${order.wallet_ending}` : network;
}

/** The headline and next steps shown at the top of the order page (PRD FR-028). */
export function orderHeadline(order: CustomerOrder): { title: string; body: string } {
  switch (order.status) {
    case 'pending_payment':
      return {
        title: 'Waiting for payment',
        body: order.reserved_until
          ? `Approve the payment prompt on your phone. Your items are held until ${formatTime(order.reserved_until)}.`
          : 'Approve the payment prompt on your phone to confirm your order.',
      };
    case 'paid':
    case 'packing':
      return { title: 'Order confirmed', body: 'We’re getting your order ready. We’ll text you when it’s on the way.' };
    case 'packed':
      return { title: 'Packed and ready', body: 'Your order is packed and batch-checked, and will go out with a rider soon.' };
    case 'out_for_delivery':
      return {
        title: 'On the way',
        body: order.rider
          ? `${order.rider.name} is bringing your order. Give them your delivery code when it arrives.`
          : 'Your order is with our courier. Give them your delivery code when it arrives.',
      };
    case 'delivered':
      return {
        title: 'Delivered',
        body: `Delivered${order.delivered_to ? ` to ${order.delivered_to}` : ''}${
          order.delivered_at ? ` on ${formatDate(order.delivered_at)}` : ''
        }. Thank you for shopping with Sleek Connect Store.`,
      };
    case 'delivery_failed': {
      const reason = [...order.events].reverse().find((e) => e.reason)?.reason;
      return {
        title: 'We couldn’t deliver your order',
        body: `${reason ? `${failureReasons[reason]}. ` : ''}We’ll call you on ${order.phone} to arrange another delivery.`,
      };
    }
    case 'cancelled':
      return {
        title: 'Order cancelled',
        body: order.paid_at
          ? 'Your payment will be refunded to the wallet you paid with. We’ll contact you when it’s done.'
          : 'This order was cancelled before payment, so you haven’t been charged.',
      };
    case 'returned':
      return {
        title: 'Returned to us',
        body: 'We couldn’t complete the delivery, so the order came back to us. We’ll refund your payment and contact you.',
      };
  }
}
