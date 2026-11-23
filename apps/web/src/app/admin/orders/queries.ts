import 'server-only';

/** Order columns staff may read (the delivery code and order-page token are deliberately left out). */
export const orderColumns =
  'id, order_number, status, user_id, customer_name, phone, area, ghanapost_gps, rider_directions, delivery_option_id, is_gift, payment_method, momo_network, wallet_number, subtotal_ghs, delivery_fee_ghs, total_ghs, created_at, paid_at, cancel_reason, needs_review, rider_id, courier_reference, delivery_attempts, delivered_at, delivered_to, refund_due, reservation_expires_at, cod_confirmed_at, cash_collected_ghs';

/** `hint` is the plain-English line shown under the queue tabs: what the queue holds and what to do next. */
export const orderViews = {
  to_pack: { label: 'To pack', hint: 'Paid orders. Pack them, then mark them packed. Oldest first.', statuses: ['paid', 'packing'], oldestFirst: true },
  ready: { label: 'Ready for dispatch', hint: 'Packed orders. Open one to hand it to a rider.', statuses: ['packed'], oldestFirst: true },
  out: { label: 'Out for delivery', hint: 'With a rider now. Open one to record delivery with the customer’s code.', statuses: ['out_for_delivery'], oldestFirst: true },
  failed: { label: 'Delivery failed', hint: 'The rider could not deliver. Open one to try again or cancel it.', statuses: ['delivery_failed'], oldestFirst: true },
  review: { label: 'Needs review', hint: 'Something went wrong with these (for example a payment problem). Open one to see why.', flag: 'needs_review' },
  refund: { label: 'Refund due', hint: 'Money to give back to the customer. Pay it outside the system, then record it under Finance.', flag: 'refund_due' },
  unpaid: { label: 'Awaiting payment', hint: 'The customer has not paid yet. Nothing to do; the stock is held for a short time.', statuses: ['pending_payment'] },
  done: { label: 'Completed', hint: 'Delivered, cancelled or returned orders.', statuses: ['delivered', 'cancelled', 'returned'] },
  // Checkouts that never turned into a sale: the customer didn't pay in time, or the payment was declined. Nothing was taken.
  abandoned: { label: 'Abandoned', hint: 'Checkouts that never became a sale: the customer did not pay in time, or the payment was declined. No money was taken.', cancelReasons: ['payment_timeout', 'payment_failed'] },
  all: { label: 'All', hint: 'Every order, newest first.' },
} as const;

export type OrderView = keyof typeof orderViews;
