-- Order statuses from PRD FR-042, mapped onto the existing ones:
--   pending_payment = Pending payment, paid = Confirmed, packing = Packing, packed = Ready for dispatch,
--   out_for_delivery, delivered, delivery_failed = Delivery failed, cancelled, returned = Returned to the warehouse.
-- Kept in their own migration because Postgres can't use a new enum value in the transaction that adds it.

alter type public.order_status add value if not exists 'packing' after 'paid';
alter type public.order_status add value if not exists 'delivery_failed' after 'out_for_delivery';
alter type public.order_status add value if not exists 'returned' after 'cancelled';
