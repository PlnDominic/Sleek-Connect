-- Fulfilment (PRD FR-104, FR-043 to FR-045): packing with earliest-expiry-first picking, dispatch to a rider or
-- courier, proof of delivery, failed deliveries, returns to stock and cancellations. Operations staff only.

create type public.delivery_failure_reason as enum (
  'customer_unreachable', 'customer_absent', 'wrong_address', 'refused', 'rider_issue', 'other'
);

-- ---------------------------------------------------------------------------
-- Riders
-- ---------------------------------------------------------------------------

create function public.admin_save_rider(
  p_id uuid,
  p_name text,
  p_phone text,
  p_vehicle text,
  p_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := p_id;
begin
  perform public.require_staff(array['operations']::public.staff_role[]);
  if coalesce(btrim(p_name), '') = '' or coalesce(btrim(p_phone), '') = '' then
    raise exception 'Enter the rider''s name and phone number.' using errcode = '22023';
  end if;
  if v_id is null then
    insert into public.riders (name, phone, vehicle, is_active)
    values (btrim(p_name), btrim(p_phone), coalesce(nullif(btrim(p_vehicle), ''), 'Motorbike'), coalesce(p_active, true))
    returning id into v_id;
  else
    update public.riders r
    set name = btrim(p_name), phone = btrim(p_phone), vehicle = coalesce(nullif(btrim(p_vehicle), ''), r.vehicle),
        is_active = coalesce(p_active, r.is_active)
    where r.id = v_id;
    if not found then
      raise exception 'That rider no longer exists.' using errcode = '22023';
    end if;
  end if;
  perform public.audit('rider.saved', 'rider', v_id::text, jsonb_build_object('name', btrim(p_name), 'active', p_active));
  return v_id;
end;
$$;

revoke all on function public.admin_save_rider(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.admin_save_rider(uuid, text, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Picking (FEFO: earliest expiry first, then oldest delivery)
-- ---------------------------------------------------------------------------

-- The pick list for an order: the batches it was packed from, or, before packing, the batches to take.
-- A row with no batch means there isn't enough usable stock for that line.
create function public.admin_pick_list(p_order_id uuid)
returns table (
  order_item_id uuid,
  product_name text,
  size_label text,
  ordered integer,
  batch_id uuid,
  batch_code text,
  expires_on date,
  quantity integer,
  packed boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_batch record;
  v_left integer;
  v_take integer;
  v_used jsonb := '{}'::jsonb;
  v_free integer;
begin
  perform public.require_staff();

  if exists (select 1 from public.order_item_batches ab join public.order_items oi on oi.id = ab.order_item_id
             where oi.order_id = p_order_id) then
    return query
    select oi.id, oi.product_name, oi.size_label, oi.quantity, b.id, b.batch_code, b.expires_on, ab.quantity, true
    from public.order_items oi
    join public.order_item_batches ab on ab.order_item_id = oi.id
    join public.stock_batches b on b.id = ab.batch_id
    where oi.order_id = p_order_id
    order by oi.product_name, b.expires_on nulls last;
    return;
  end if;

  for v_item in
    select oi.id, oi.product_id, coalesce(oi.size_code, '') as size_code, oi.product_name, oi.size_label, oi.quantity
    from public.order_items oi where oi.order_id = p_order_id order by oi.product_name
  loop
    v_left := v_item.quantity;
    for v_batch in
      select b.id, b.batch_code, b.expires_on, b.quantity from public.stock_batches b
      where b.product_id = v_item.product_id and b.size_code = v_item.size_code and b.status = 'available'
        and b.quantity > 0 and (b.expires_on is null or b.expires_on >= current_date)
      order by b.expires_on nulls last, b.received_at
    loop
      exit when v_left = 0;
      -- Lines of the same order can draw on the same batch.
      v_free := v_batch.quantity - coalesce((v_used ->> v_batch.id::text)::integer, 0);
      continue when v_free <= 0;
      v_take := least(v_left, v_free);
      v_used := v_used || jsonb_build_object(v_batch.id::text, coalesce((v_used ->> v_batch.id::text)::integer, 0) + v_take);
      order_item_id := v_item.id; product_name := v_item.product_name; size_label := v_item.size_label;
      ordered := v_item.quantity; batch_id := v_batch.id; batch_code := v_batch.batch_code;
      expires_on := v_batch.expires_on; quantity := v_take; packed := false;
      return next;
      v_left := v_left - v_take;
    end loop;
    if v_left > 0 then
      order_item_id := v_item.id; product_name := v_item.product_name; size_label := v_item.size_label;
      ordered := v_item.quantity; batch_id := null; batch_code := null; expires_on := null; quantity := v_left;
      packed := false;
      return next;
    end if;
  end loop;
end;
$$;

revoke all on function public.admin_pick_list(uuid) from public, anon;
grant execute on function public.admin_pick_list(uuid) to authenticated;

-- Takes an order's units out of their batches, earliest expiry first. Raises if usable stock runs short.
create function public.allocate_order_batches(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_batch record;
  v_left integer;
  v_take integer;
begin
  for v_item in
    select oi.id, oi.product_id, coalesce(oi.size_code, '') as size_code, oi.product_name, oi.size_label, oi.quantity
    from public.order_items oi where oi.order_id = p_order_id and oi.product_id is not null
    order by oi.product_name
  loop
    v_left := v_item.quantity;
    for v_batch in
      select b.id, b.quantity from public.stock_batches b
      where b.product_id = v_item.product_id and b.size_code = v_item.size_code and b.status = 'available'
        and b.quantity > 0 and (b.expires_on is null or b.expires_on >= current_date)
      order by b.expires_on nulls last, b.received_at
      for update
    loop
      exit when v_left = 0;
      v_take := least(v_left, v_batch.quantity);
      update public.stock_batches b set quantity = b.quantity - v_take where b.id = v_batch.id;
      insert into public.order_item_batches (order_item_id, batch_id, quantity) values (v_item.id, v_batch.id, v_take)
      on conflict (order_item_id, batch_id) do update set quantity = public.order_item_batches.quantity + excluded.quantity;
      perform public.log_stock_movement(v_item.product_id, v_item.size_code, v_batch.id, 'picked', -v_take, 0, p_order_id, null);
      v_left := v_left - v_take;
    end loop;
    if v_left > 0 then
      raise exception 'Not enough usable stock of % (short by %). Receive stock or check the batches.',
        concat_ws(', ', v_item.product_name, v_item.size_label), v_left using errcode = '22023';
    end if;
  end loop;
end;
$$;

revoke all on function public.allocate_order_batches(uuid) from public, anon, authenticated;

-- Puts an order's packed units back into their batches (a return to the warehouse, or a cancelled packed order).
create function public.return_order_batches(p_order_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_sellable integer;
begin
  for v_row in
    select ab.batch_id, ab.quantity, b.product_id, b.size_code, b.status
    from public.order_item_batches ab
    join public.order_items oi on oi.id = ab.order_item_id
    join public.stock_batches b on b.id = ab.batch_id
    where oi.order_id = p_order_id
    for update of b
  loop
    v_sellable := case when v_row.status = 'available' then v_row.quantity else 0 end;
    update public.stock_batches b set quantity = b.quantity + v_row.quantity where b.id = v_row.batch_id;
    update public.inventory_levels i set on_hand = i.on_hand + v_sellable
    where i.product_id = v_row.product_id and i.size_code = v_row.size_code;
    perform public.log_stock_movement(v_row.product_id, v_row.size_code, v_row.batch_id, 'returned',
      v_row.quantity, v_sellable, p_order_id, p_note);
  end loop;
  delete from public.order_item_batches ab
  using public.order_items oi
  where oi.id = ab.order_item_id and oi.order_id = p_order_id;
end;
$$;

revoke all on function public.return_order_batches(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Order workflow
-- ---------------------------------------------------------------------------

-- Locks an order for a status change and checks it is in one of the allowed statuses.
create function public.lock_order_for(p_order_id uuid, p_allowed public.order_status[], p_action text)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'That order no longer exists.' using errcode = '22023';
  end if;
  if not (v_order.status = any (p_allowed)) then
    raise exception 'Order % is %, so it can''t be %.', v_order.order_number, replace(v_order.status::text, '_', ' '), p_action
      using errcode = '22023';
  end if;
  return v_order;
end;
$$;

revoke all on function public.lock_order_for(uuid, public.order_status[], text) from public, anon, authenticated;

-- Moves confirmed orders to "packing" (the pick list has been printed). Returns how many moved.
create function public.admin_start_packing(p_order_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform public.require_staff(array['operations']::public.staff_role[]);
  update public.orders o set status = 'packing' where o.id = any (p_order_ids) and o.status = 'paid';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.admin_start_packing(uuid[]) from public, anon;
grant execute on function public.admin_start_packing(uuid[]) to authenticated;

-- Packs orders: takes the units from their batches (earliest expiry first) and marks them ready for dispatch.
-- Each order succeeds or fails on its own.
create function public.admin_pack_orders(p_order_ids uuid[])
returns table (order_id uuid, order_number text, ok boolean, message text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.require_staff(array['operations']::public.staff_role[]);
  foreach v_id in array p_order_ids loop
    order_id := v_id;
    order_number := (select o.order_number from public.orders o where o.id = v_id);
    begin
      perform public.lock_order_for(v_id, array['paid', 'packing']::public.order_status[], 'packed');
      perform public.allocate_order_batches(v_id);
      update public.orders o set status = 'packed' where o.id = v_id;
      ok := true;
      message := null;
    exception when sqlstate '22023' then
      ok := false;
      message := sqlerrm;
    end;
    return next;
  end loop;
end;
$$;

revoke all on function public.admin_pack_orders(uuid[]) from public, anon;
grant execute on function public.admin_pack_orders(uuid[]) to authenticated;

-- Hands a packed order (or a failed delivery being re-attempted) to a rider or courier.
create function public.admin_dispatch_order(
  p_order_id uuid,
  p_rider_id uuid default null,
  p_courier_reference text default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_rider public.riders%rowtype;
  v_max integer;
begin
  perform public.require_staff(array['operations']::public.staff_role[]);
  v_order := public.lock_order_for(p_order_id, array['packed', 'delivery_failed']::public.order_status[], 'dispatched');
  select s.max_delivery_attempts into v_max from public.store_settings s;
  if v_order.delivery_attempts >= v_max then
    raise exception 'Order % has had % delivery attempts, the limit. Return it to stock instead.',
      v_order.order_number, v_order.delivery_attempts using errcode = '22023';
  end if;
  if p_rider_id is not null then
    select * into v_rider from public.riders r where r.id = p_rider_id and r.is_active;
    if not found then
      raise exception 'Choose an active rider.' using errcode = '22023';
    end if;
  elsif coalesce(btrim(p_courier_reference), '') = '' then
    raise exception 'Choose a rider, or enter the courier''s tracking reference.' using errcode = '22023';
  end if;

  perform public.set_order_event_context(p_note, jsonb_build_object(
    'rider', v_rider.name, 'courier_reference', nullif(btrim(p_courier_reference), ''),
    'attempt', v_order.delivery_attempts + 1));
  update public.orders o
  set status = 'out_for_delivery', rider_id = p_rider_id, courier_reference = nullif(btrim(p_courier_reference), ''),
      delivery_attempts = o.delivery_attempts + 1
  where o.id = p_order_id;
end;
$$;

revoke all on function public.admin_dispatch_order(uuid, uuid, text, text) from public, anon;
grant execute on function public.admin_dispatch_order(uuid, uuid, text, text) to authenticated;

-- Wrong delivery codes are counted so the 4-digit code can't be guessed: after five, the order locks and is flagged.
alter table public.orders add column delivery_code_failures integer not null default 0;
grant select (delivery_code_failures) on public.orders to authenticated;

-- Completes a delivery. Requires who received it and, when the store requires it, the customer's delivery code.
-- Returns 'delivered', 'wrong_code' or 'locked'. A wrong code is not an error, so the failed attempt is kept.
-- An admin may confirm without the code (customer lost it) by leaving it empty and adding a note; that is audited.
create function public.admin_mark_delivered(p_order_id uuid, p_recipient text, p_code text, p_note text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.staff_role;
  v_order public.orders%rowtype;
  v_require_code boolean;
  v_code text := coalesce(btrim(p_code), '');
  v_checked boolean := false;
begin
  v_role := public.require_staff(array['operations']::public.staff_role[]);
  v_order := public.lock_order_for(p_order_id, array['out_for_delivery']::public.order_status[], 'marked delivered');
  if coalesce(btrim(p_recipient), '') = '' then
    raise exception 'Enter the name of the person who received the order.' using errcode = '22023';
  end if;
  select s.require_delivery_code into v_require_code from public.store_settings s;

  if v_require_code then
    if v_code = '' and v_role = 'admin' then
      if coalesce(btrim(p_note), '') = '' then
        raise exception 'Add a note explaining why the delivery code wasn''t used.' using errcode = '22023';
      end if;
      perform public.audit('order.delivered_without_code', 'order', p_order_id::text,
        jsonb_build_object('note', btrim(p_note), 'recipient', btrim(p_recipient)));
    elsif v_order.delivery_code_failures >= 5 then
      return 'locked';
    elsif v_code <> v_order.delivery_code then
      update public.orders o
      set delivery_code_failures = o.delivery_code_failures + 1,
          needs_review = o.needs_review or o.delivery_code_failures + 1 >= 5
      where o.id = p_order_id;
      perform public.audit('order.wrong_delivery_code', 'order', p_order_id::text,
        jsonb_build_object('attempt', v_order.delivery_code_failures + 1));
      return 'wrong_code';
    else
      v_checked := true;
    end if;
  end if;

  perform public.set_order_event_context(p_note, jsonb_build_object('recipient', btrim(p_recipient),
    'code_checked', v_checked));
  update public.orders o set status = 'delivered', delivered_at = now(), delivered_to = btrim(p_recipient)
  where o.id = p_order_id;
  return 'delivered';
end;
$$;

revoke all on function public.admin_mark_delivered(uuid, text, text, text) from public, anon;
grant execute on function public.admin_mark_delivered(uuid, text, text, text) to authenticated;

-- Records a failed delivery attempt. The customer is told, and staff then re-attempt or return it to stock.
create function public.admin_mark_delivery_failed(
  p_order_id uuid,
  p_reason public.delivery_failure_reason,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['operations']::public.staff_role[]);
  perform public.lock_order_for(p_order_id, array['out_for_delivery']::public.order_status[], 'marked as failed');
  if p_reason is null then
    raise exception 'Choose why the delivery failed.' using errcode = '22023';
  end if;
  if p_reason = 'other' and coalesce(btrim(p_note), '') = '' then
    raise exception 'Add a note describing what happened.' using errcode = '22023';
  end if;
  perform public.set_order_event_context(p_note, jsonb_build_object('reason', p_reason));
  update public.orders o set status = 'delivery_failed' where o.id = p_order_id;
end;
$$;

revoke all on function public.admin_mark_delivery_failed(uuid, public.delivery_failure_reason, text) from public, anon;
grant execute on function public.admin_mark_delivery_failed(uuid, public.delivery_failure_reason, text) to authenticated;

-- Brings a failed delivery back to the warehouse: units go back into their batches and the order needs a refund.
create function public.admin_return_to_stock(p_order_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['operations']::public.staff_role[]);
  perform public.lock_order_for(p_order_id, array['delivery_failed']::public.order_status[], 'returned to stock');
  perform public.return_order_batches(p_order_id, coalesce(nullif(btrim(p_note), ''), 'Delivery failed'));
  update public.orders o set refund_due = o.paid_at is not null where o.id = p_order_id;
  perform public.set_order_event_context(p_note, null);
  update public.orders o set status = 'returned' where o.id = p_order_id;
end;
$$;

revoke all on function public.admin_return_to_stock(uuid, text) from public, anon;
grant execute on function public.admin_return_to_stock(uuid, text) to authenticated;

-- Cancels an order before it leaves the warehouse. Paid orders are flagged for a refund.
create function public.admin_cancel_order(p_order_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  perform public.require_staff(array['operations', 'support']::public.staff_role[]);
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Give a reason for cancelling.' using errcode = '22023';
  end if;
  v_order := public.lock_order_for(p_order_id,
    array['pending_payment', 'paid', 'packing', 'packed']::public.order_status[], 'cancelled');

  if v_order.status = 'pending_payment' then
    perform public.set_order_event_context(p_reason, null);
    perform public.release_order_reservation(p_order_id, 'cancelled_by_staff');
    return;
  end if;

  if v_order.status = 'packed' then
    perform public.return_order_batches(p_order_id, 'Order cancelled');
  else
    -- Sold but not packed: the units go straight back on sale.
    with sold as (
      select oi.product_id, coalesce(oi.size_code, '') as size_code, sum(oi.quantity)::integer as quantity
      from public.order_items oi where oi.order_id = p_order_id and oi.product_id is not null
      group by oi.product_id, coalesce(oi.size_code, '')
    ),
    restocked as (
      update public.inventory_levels i set on_hand = i.on_hand + sold.quantity
      from sold where i.product_id = sold.product_id and i.size_code = sold.size_code
      returning i.product_id, i.size_code, sold.quantity
    )
    insert into public.stock_movements (product_id, size_code, reason, quantity, sellable_change, order_id, actor_id, actor_email, note)
    select r.product_id, r.size_code, 'restocked', 0, r.quantity, p_order_id, auth.uid(), auth.jwt() ->> 'email', 'Order cancelled'
    from restocked r;
  end if;

  perform public.set_order_event_context(p_reason, null);
  update public.orders o
  set status = 'cancelled', cancel_reason = btrim(p_reason), refund_due = o.paid_at is not null
  where o.id = p_order_id;
end;
$$;

revoke all on function public.admin_cancel_order(uuid, text) from public, anon;
grant execute on function public.admin_cancel_order(uuid, text) to authenticated;

-- Clears the "needs review" or "refund due" flag once staff have dealt with it. Logged in the audit log.
create function public.admin_resolve_order_flag(p_order_id uuid, p_flag text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_flag = 'refund_due' then
    perform public.require_staff(array['finance', 'operations']::public.staff_role[]);
  elsif p_flag = 'needs_review' then
    perform public.require_staff(array['operations', 'support']::public.staff_role[]);
  else
    raise exception 'Unknown flag %.', p_flag using errcode = '22023';
  end if;
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'Add a note saying how it was resolved.' using errcode = '22023';
  end if;
  update public.orders o
  set needs_review = case when p_flag = 'needs_review' then false else o.needs_review end,
      refund_due = case when p_flag = 'refund_due' then false else o.refund_due end
  where o.id = p_order_id;
  perform public.audit('order.' || p_flag || '_resolved', 'order', p_order_id::text, jsonb_build_object('note', btrim(p_note)));
end;
$$;

revoke all on function public.admin_resolve_order_flag(uuid, text, text) from public, anon;
grant execute on function public.admin_resolve_order_flag(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The customer's order page (by the unguessable token in their link)
-- ---------------------------------------------------------------------------

create function public.get_order(p_order_token uuid)
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
    'reserved_until', case when o.status = 'pending_payment' then o.reservation_expires_at end,
    'customer_name', o.customer_name,
    'phone', o.phone,
    'area', o.area,
    'ghanapost_gps', o.ghanapost_gps,
    'directions', o.rider_directions,
    'delivery_option', d.label,
    'is_gift', o.is_gift,
    'payment_method', o.payment_method,
    'momo_network', o.momo_network,
    'wallet_ending', right(regexp_replace(coalesce(o.wallet_number, ''), '\D', '', 'g'), 3),
    'subtotal_ghs', o.subtotal_ghs,
    'delivery_fee_ghs', o.delivery_fee_ghs,
    'total_ghs', o.total_ghs,
    'delivery_code', case when o.paid_at is not null and o.status not in ('delivered', 'cancelled', 'returned')
                          then o.delivery_code end,
    'rider', case when o.status = 'out_for_delivery' and r.id is not null
                  then jsonb_build_object('name', r.name, 'vehicle', r.vehicle) end,
    'courier_reference', case when o.status = 'out_for_delivery' then o.courier_reference end,
    'delivered_at', o.delivered_at,
    'delivered_to', o.delivered_to,
    'refund_due', o.refund_due,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', i.product_name,
        'slug', p.slug,
        'size_label', i.size_label,
        'quantity', i.quantity,
        'unit_price_ghs', i.unit_price_ghs,
        'line_total_ghs', i.line_total_ghs,
        'image_key', p.image_key,
        'tint', p.tint,
        'kind', p.kind,
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
  where o.public_token = p_order_token;
$$;

revoke all on function public.get_order(uuid) from public;
grant execute on function public.get_order(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Product page: the batch a shopper would get next (earliest expiry first), per size
-- ---------------------------------------------------------------------------

create function public.product_current_batches(p_slug text)
returns table (size_code text, batch_code text, expires_on date)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (b.size_code) b.size_code, b.batch_code, b.expires_on
  from public.stock_batches b
  join public.products p on p.id = b.product_id
  where p.slug = p_slug and p.is_published
    and b.status = 'available' and b.quantity > 0 and (b.expires_on is null or b.expires_on >= current_date)
  order by b.size_code, b.expires_on nulls last, b.received_at;
$$;

revoke all on function public.product_current_batches(text) from public;
grant execute on function public.product_current_batches(text) to anon, authenticated;
