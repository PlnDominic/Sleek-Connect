-- Orders that show Cancelled although Hubtel took the money (read-only; run in the Supabase SQL editor).
-- For each one: if the payment is under 3 days old the reconcile job puts it back by itself on its next run; otherwise
-- re-instate it by hand (or refund) after checking Hubtel's settlement report.
select o.order_number, o.status, o.cancel_reason, o.total_ghs, o.needs_review, p.status as payment_status,
       p.provider_reference, p.created_at as payment_started
from public.orders o
join public.payments p on p.order_id = o.id
where o.status = 'cancelled' and p.status = 'succeeded'
order by p.created_at desc;
