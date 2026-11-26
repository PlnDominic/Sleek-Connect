-- A shopper who paid on Hubtel after the 15-minute reservation timer ran out (or after a first attempt was reported failed and they
-- retried) found their paid order "Cancelled": the late "paid" notification only flagged it for review, or was ignored. When money
-- arrives for an order the timer or a failed answer cancelled, put the order back to paid if the stock is still there; otherwise leave it flagged for a refund.
create or replace function public.confirm_payment(
  p_provider text,
  p_reference text,
  p_status text,
  p_amount_ghs numeric,
  p_event jsonb default null
)
returns table (order_number text, order_status public.order_status, payment_status public.payment_status)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_reinstate boolean := false;
begin
  if p_status not in ('succeeded', 'failed') then
    raise exception 'Unknown payment status %.', p_status using errcode = '22023';
  end if;

  select * into v_payment from public.payments p
  where p.provider = p_provider and p.provider_reference = p_reference
  for update;
  if not found then
    raise exception 'Unknown payment %.', p_reference using errcode = '22023';
  end if;

  select * into v_order from public.orders o where o.id = v_payment.order_id for update;

  -- A "failed" answer is not final: a shopper can retry on Hubtel's page and pay. Only a repeat of the same answer changes nothing.
  if v_payment.status = 'succeeded' or (v_payment.status = 'failed' and p_status = 'failed') then
    return query select v_order.order_number, v_order.status, v_payment.status;
    return;
  end if;

  update public.payments p
  set status = p_status::public.payment_status, last_event = p_event
  where p.id = v_payment.id;

  if p_status = 'failed' then
    perform public.release_order_reservation(v_order.id, 'payment_failed');
  elsif p_amount_ghs is distinct from v_payment.amount_ghs then
    update public.orders o set needs_review = true where o.id = v_order.id;
  else
    if v_order.status = 'cancelled' and v_order.cancel_reason in ('payment_timeout', 'payment_failed') then
      -- Paid after the timer (or an earlier failed answer) cancelled the order: reinstate it only if every line is still in stock.
      v_reinstate := not exists (
        select 1
        from (
          select oi.product_id, coalesce(oi.size_code, '') as size_code, sum(oi.quantity)::integer as quantity
          from public.order_items oi
          where oi.order_id = v_order.id and oi.product_id is not null
          group by oi.product_id, coalesce(oi.size_code, '')
        ) held
        left join public.inventory_levels i on i.product_id = held.product_id and i.size_code = held.size_code
        where i.product_id is null or i.on_hand - i.reserved < held.quantity
      );
      if v_reinstate then
        -- The timer already released the reservation, so take the stock straight from on_hand.
        with held as (
          select oi.product_id, coalesce(oi.size_code, '') as size_code, sum(oi.quantity)::integer as quantity
          from public.order_items oi
          where oi.order_id = v_order.id and oi.product_id is not null
          group by oi.product_id, coalesce(oi.size_code, '')
        ),
        sold as (
          update public.inventory_levels i
          set on_hand = i.on_hand - held.quantity
          from held
          where i.product_id = held.product_id and i.size_code = held.size_code
          returning i.product_id, i.size_code, held.quantity
        )
        insert into public.stock_movements (product_id, size_code, reason, quantity, sellable_change, order_id)
        select sold.product_id, sold.size_code, 'sold', 0, -sold.quantity, v_order.id from sold;

        update public.orders o set status = 'paid', paid_at = now(), cancel_reason = null where o.id = v_order.id;
      else
        update public.orders o set needs_review = true where o.id = v_order.id;
      end if;
    elsif v_order.status = 'pending_payment' then
      with held as (
        select oi.product_id, coalesce(oi.size_code, '') as size_code, sum(oi.quantity)::integer as quantity
        from public.order_items oi
        where oi.order_id = v_order.id and oi.product_id is not null
        group by oi.product_id, coalesce(oi.size_code, '')
      ),
      sold as (
        update public.inventory_levels i
        set on_hand = i.on_hand - held.quantity, reserved = i.reserved - held.quantity
        from held
        where i.product_id = held.product_id and i.size_code = held.size_code
        returning i.product_id, i.size_code, held.quantity
      )
      insert into public.stock_movements (product_id, size_code, reason, quantity, sellable_change, order_id)
      select sold.product_id, sold.size_code, 'sold', 0, -sold.quantity, v_order.id from sold;

      update public.orders o set status = 'paid', paid_at = now() where o.id = v_order.id;
    else
      update public.orders o set needs_review = true where o.id = v_order.id;
    end if;
  end if;

  return query
  select o.order_number, o.status, p.status
  from public.orders o join public.payments p on p.order_id = o.id
  where p.id = v_payment.id;
end;
$$;
