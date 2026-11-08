-- An order was cancelled 15 minutes after it was placed even when the customer had started a Mobile Money payment that was still
-- going through, so a paid order could be left showing "Cancelled". Orders with a payment attempt started in the last 45 minutes
-- that hasn't been answered yet now keep their reservation; the payment's answer (or the reconcile job) settles them.
create or replace function public.expire_unpaid_orders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_count integer := 0;
begin
  for v_order_id in
    select o.id from public.orders o
    where o.status = 'pending_payment' and o.reservation_expires_at < now()
      and not exists (
        select 1 from public.payments p
        where p.order_id = o.id and p.status = 'pending' and p.created_at > now() - interval '45 minutes'
      )
    for update skip locked
  loop
    perform public.release_order_reservation(v_order_id, 'payment_timeout');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
