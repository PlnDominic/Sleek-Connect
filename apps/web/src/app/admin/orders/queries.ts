import 'server-only';

/** Order columns staff may read (the delivery code and order-page token are deliberately left out). */
export const orderColumns =
  'id, order_number, status, user_id, customer_name, phone, area, ghanapost_gps, rider_directions, delivery_option_id, is_gift, payment_method, momo_network, wallet_number, subtotal_ghs, delivery_fee_ghs, total_ghs, created_at, paid_at, cancel_reason, needs_review, rider_id, courier_reference, delivery_attempts, delivered_at, delivered_to, refund_due, reservation_expires_at';

export const orderViews = {
  to_pack: { label: 'To pack', statuses: ['paid', 'packing'], oldestFirst: true },
  ready: { label: 'Ready for dispatch', statuses: ['packed'], oldestFirst: true },
  out: { label: 'Out for delivery', statuses: ['out_for_delivery'], oldestFirst: true },
  failed: { label: 'Delivery failed', statuses: ['delivery_failed'], oldestFirst: true },
  review: { label: 'Needs review', flag: 'needs_review' },
  refund: { label: 'Refund due', flag: 'refund_due' },
  unpaid: { label: 'Awaiting payment', statuses: ['pending_payment'] },
  done: { label: 'Completed', statuses: ['delivered', 'cancelled', 'returned'] },
  all: { label: 'All' },
} as const;

export type OrderView = keyof typeof orderViews;
