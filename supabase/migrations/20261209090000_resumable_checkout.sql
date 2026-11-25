-- A hosted checkout link is a private payment credential. Ordinary staff
-- payment reads must never include it.
create table public.payment_checkout_sessions (
  payment_id uuid primary key references public.payments(id) on delete cascade,
  checkout_url text not null check (checkout_url like 'https://%')
);
alter table public.payment_checkout_sessions enable row level security;
revoke all on public.payment_checkout_sessions from public, anon, authenticated;
grant select, insert, update on public.payment_checkout_sessions to service_role;

create function public.save_payment_checkout(p_provider text, p_reference text, p_url text)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.payment_checkout_sessions (payment_id, checkout_url)
  select p.id, p_url from public.payments p
  where p.provider = p_provider and p.provider_reference = p_reference and p.status = 'pending'
  for update
  on conflict (payment_id) do nothing;
$$;

create function public.get_payment_checkout(p_order_token uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select s.checkout_url
  from public.orders o
  join public.payments p on p.order_id = o.id
  join public.payment_checkout_sessions s on s.payment_id = p.id
  where o.public_token = p_order_token and o.status = 'pending_payment'
    and p.status = 'pending' and p.created_at > now() - interval '45 minutes'
    and not exists (select 1 from public.payments paid where paid.order_id = o.id and paid.status = 'succeeded')
  order by p.created_at desc
  limit 1;
$$;

revoke all on function public.save_payment_checkout(text, text, text), public.get_payment_checkout(uuid) from public, anon, authenticated;
grant execute on function public.save_payment_checkout(text, text, text), public.get_payment_checkout(uuid) to service_role;

create function public.clear_finished_payment_checkout()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.payment_checkout_sessions where payment_id = new.id;
  return new;
end;
$$;
revoke all on function public.clear_finished_payment_checkout() from public, anon, authenticated;
create trigger clear_finished_payment_checkout
after update of status on public.payments
for each row when (old.status = 'pending' and new.status <> 'pending')
execute function public.clear_finished_payment_checkout();

create or replace function public.start_payment(p_order_token uuid, p_provider text, p_reference text)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders o where o.public_token = p_order_token for update;
  if not found then
    raise exception 'Order not found.' using errcode = '22023';
  end if;
  if v_order.payment_method = 'cod' then
    raise exception 'This order is paid on delivery.' using errcode = '22023';
  end if;
  if v_order.status <> 'pending_payment' or v_order.reservation_expires_at < now() then
    raise exception 'This order can no longer be paid.' using errcode = '22023';
  end if;
  if v_order.total_ghs is null then
    raise exception 'Delivery fees are not set, so the order total is unknown.' using errcode = '22023';
  end if;

  if p_provider = 'hubtel' and exists (
    select 1 from public.payments p where p.order_id = v_order.id and p.status in ('pending', 'succeeded')
  ) then
    raise exception 'A payment is already being checked for this order.' using errcode = '22023';
  end if;

  insert into public.payments (order_id, provider, provider_reference, amount_ghs)
  values (v_order.id, p_provider, p_reference, v_order.total_ghs);
  return v_order.total_ghs;
end;
$$;

create or replace function public.get_order(p_order_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'order_number', o.order_number,
    'status', o.status,
    'created_at', o.created_at,
    'paid_at', o.paid_at,
    'cod_confirmed_at', o.cod_confirmed_at,
    'reserved_until', case when o.status = 'pending_payment' then o.reservation_expires_at end,
    'customer_name', o.customer_name,
    'phone', o.phone,
    'area', o.area,
    'ghanapost_gps', o.ghanapost_gps,
    'directions', o.rider_directions,
    'delivery_option', d.label,
    'delivery_option_id', o.delivery_option_id,
    'is_gift', o.is_gift,
    'payment_method', o.payment_method,
    'momo_network', o.momo_network,
    'wallet_ending', right(regexp_replace(coalesce(o.wallet_number, ''), '\D', '', 'g'), 3),
    'subtotal_ghs', o.subtotal_ghs,
    'discount_ghs', o.discount_ghs,
    'promo_code', o.promo_code,
    'delivery_fee_ghs', o.delivery_fee_ghs,
    'total_ghs', o.total_ghs,
    'delivery_code', case when (o.paid_at is not null or o.cod_confirmed_at is not null) and o.status not in ('delivered', 'cancelled', 'returned')
                          then o.delivery_code end,
    'rider', case when o.status = 'out_for_delivery' and r.id is not null
                  then jsonb_build_object('name', r.name, 'vehicle', r.vehicle) end,
    'courier_reference', case when o.status = 'out_for_delivery' then o.courier_reference end,
    'delivered_at', o.delivered_at,
    'delivered_to', o.delivered_to,
    'refund_due', o.refund_due,
    'refund_recorded_at', case when not o.refund_due then (
      select max(a.at) from public.audit_log a
      where a.entity = 'order' and a.entity_id = o.id::text and a.action = 'order.refund_due_resolved'
    ) end,
    'return_until', case when o.status = 'delivered' and o.delivered_at is not null
                         then o.delivered_at + make_interval(days => st.return_window_days) end,
    -- Customers can cancel online until packing starts (PRD FR-052).
    'can_cancel', o.status in ('pending_payment', 'paid'),
    'return_open', coalesce(o.status = 'delivered'
                            and o.delivered_at + make_interval(days => st.return_window_days) > now(), false),
    'returns', coalesce((
      select jsonb_agg(jsonb_build_object(
        'case_number', r.case_number,
        'status', r.status,
        'reason', r.reason,
        'created_at', r.created_at,
        'decision_note', r.decision_note,
        'refund_amount_ghs', r.refund_amount_ghs,
        'items', (select jsonb_agg(jsonb_build_object('name', oi.product_name, 'size_label', oi.size_label, 'quantity', ri.quantity))
                  from public.return_items ri join public.order_items oi on oi.id = ri.order_item_id where ri.return_id = r.id)
      ) order by r.created_at)
      from public.return_requests r where r.order_id = o.id
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'name', i.product_name,
        'slug', p.slug,
        'size_code', i.size_code,
        'size_label', i.size_label,
        'quantity', i.quantity,
        'unit_price_ghs', i.unit_price_ghs,
        'line_total_ghs', i.line_total_ghs,
        'image_key', p.image_key,
        'photo_path', (select pi.path from public.product_images pi where pi.product_id = p.id order by pi.sort_order, pi.created_at limit 1),
        'tint', p.tint,
        'kind', p.kind,
        'warning_label', p.warning_label,
        -- Returns (PRD FR-053): whether this line can be returned, and how many units already are.
        'returnable', coalesce(p.returnable, true),
        'return_note', p.return_note,
        'return_requested', coalesce((
          select sum(ri.quantity)::integer from public.return_items ri
          join public.return_requests r on r.id = ri.return_id
          where ri.order_item_id = i.id and r.status <> 'rejected'
        ), 0),
        -- The batches this line was packed from, so the customer can check batch and expiry on the pack.
        'batches', coalesce((
          select jsonb_agg(jsonb_build_object('code', b.batch_code, 'expires_on', b.expires_on, 'quantity', ab.quantity)
                           order by b.expires_on nulls last)
          from public.order_item_batches ab join public.stock_batches b on b.id = ab.batch_id
          where ab.order_item_id = i.id
        ), '[]'::jsonb)
      ) order by i.product_name)
      from public.order_items i
      left join public.products p on p.id = i.product_id
      where i.order_id = o.id
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'status', e.status,
        'at', e.at,
        'reason', e.details ->> 'reason'
      ) order by e.at, e.id)
      from public.order_events e
      where e.order_id = o.id
    ), '[]'::jsonb)
  )
  from public.orders o
  join public.delivery_options d on d.id = o.delivery_option_id
  left join public.riders r on r.id = o.rider_id
  cross join public.store_settings st
  where o.public_token = p_order_token;
$$;
