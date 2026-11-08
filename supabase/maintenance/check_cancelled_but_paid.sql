-- Read-only check: which "Cancelled" orders actually had a payment, and what the payment provider told us.
-- Paste into Supabase → SQL Editor and run it as it is. It changes nothing. Queries 1-4 and 6 show no names, phone numbers or emails.
-- Run each numbered query on its own (the editor shows the result of the last statement).

-- 1. Is this the right database, and is it up to date? (Expect "ok": true and no missing items.)
select public.verify_launch_schema();

-- 2. Cancelled orders and their payment attempts, newest first.
--    payment_status = succeeded            -> money was confirmed, yet the order is cancelled (needs a refund or reinstating).
--    payment_status = pending              -> the provider never reported back (webhook not arriving, or not verified).
--    payment_status = failed / no payment  -> nothing was taken: the order simply expired or the payment was declined.
select o.order_number,
       o.status,
       o.cancel_reason,
       o.total_ghs,
       o.needs_review,
       o.refund_due,
       o.paid_at,
       o.created_at,
       o.reservation_expires_at,
       p.provider,
       p.status            as payment_status,
       p.amount_ghs        as payment_amount,
       p.created_at        as payment_started,
       p.updated_at        as payment_last_update,
       p.last_event ->> 'ResponseCode' as provider_response_code,
       coalesce(p.last_event -> 'Data' ->> 'Status', p.last_event ->> 'status') as provider_status
from public.orders o
left join public.payments p on p.order_id = o.id
where o.status = 'cancelled'
order by o.created_at desc, p.created_at desc;

-- 3. The same, summed up: how many cancelled orders fall into each case.
select o.cancel_reason,
       coalesce(p.status::text, 'no payment attempt') as payment_status,
       count(distinct o.id) as orders
from public.orders o
left join public.payments p on p.order_id = o.id
where o.status = 'cancelled'
group by 1, 2
order by orders desc;

-- 4. Payments still waiting for the provider's answer (anything older than a few minutes is suspicious).
select o.order_number, o.status as order_status, p.provider, p.provider_reference, p.amount_ghs, p.created_at,
       round(extract(epoch from (now() - p.created_at)) / 60) as minutes_waiting
from public.payments p
join public.orders o on o.id = p.order_id
where p.status = 'pending'
order by p.created_at desc;

-- 5. One order in detail (change the number). Shows the provider's full answer; it can include the payer's mobile number, so keep it private.
select o.order_number, o.status, o.cancel_reason, o.total_ghs, o.paid_at, o.needs_review,
       p.provider_reference, p.status as payment_status, p.amount_ghs, p.last_event
from public.orders o
left join public.payments p on p.order_id = o.id
where o.order_number = 'SC-1016';

-- 6. How long a shopper has to pay before the order is cancelled (minutes).
select reservation_minutes from public.store_settings;
