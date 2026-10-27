-- Vendor orders: vendors pack their own items, we collect them, and the order goes out as one parcel.
--
--  * Shoppers pay us for the whole order, and pay ONE delivery fee: every vendor hands their items to Sleek Connect and a
--    single rider delivers the lot, so a cart with several vendors costs no more to deliver than any other cart.
--  * Each vendor sees only their own lines of paid orders: no customer name, phone, address or delivery code.
--  * The vendor marks their items packed; our operations team marks them collected. An order can be packed once every
--    vendor has packed, and dispatched once every vendor's items have been collected.

create type public.shipment_status as enum ('pending', 'packed', 'collected');

create table public.order_shipments (
  order_id uuid not null references public.orders (id) on delete cascade,
  vendor_id uuid not null references public.vendors (id),
  status public.shipment_status not null default 'pending',
  packed_at timestamptz,
  collected_at timestamptz,
  collected_by text,
  primary key (order_id, vendor_id)
);

create index order_shipments_vendor_idx on public.order_shipments (vendor_id, status);

alter table public.order_shipments enable row level security;
create policy "Staff can read shipments" on public.order_shipments
  for select to authenticated using ((select public.current_staff_role()) is not null);
grant select on public.order_shipments to authenticated;

-- One shipment per vendor on an order, created with the first vendor line.
create function public.order_items_shipment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.vendor_id is not null and not exists (select 1 from public.vendors v where v.id = new.vendor_id and v.is_house) then
    insert into public.order_shipments (order_id, vendor_id) values (new.order_id, new.vendor_id) on conflict do nothing;
  end if;
  return null;
end;
$$;

create trigger order_items_shipment after insert on public.order_items
  for each row execute function public.order_items_shipment();

-- The vendor's own orders: paid orders that include their items. Customer details are never included.
create function public.vendor_orders()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.vendors := public.vendor_require_own();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'order_id', o.id,
      'order_number', o.order_number,
      'paid_at', o.paid_at,
      'order_status', o.status,
      'shipment_status', sh.status,
      'packed_at', sh.packed_at,
      'collected_at', sh.collected_at,
      'amount_ghs', (select coalesce(sum(oi.vendor_unit_price_ghs * oi.quantity), 0)
                     from public.order_items oi where oi.order_id = o.id and oi.vendor_id = v.id),
      'lines', (select jsonb_agg(jsonb_build_object(
                  'product_name', oi.product_name, 'size_label', oi.size_label, 'quantity', oi.quantity,
                  'unit_ghs', oi.vendor_unit_price_ghs, 'amount_ghs', oi.vendor_unit_price_ghs * oi.quantity)
                  order by oi.product_name)
                from public.order_items oi where oi.order_id = o.id and oi.vendor_id = v.id)
    ) order by o.paid_at desc)
    from public.orders o
    join public.order_shipments sh on sh.order_id = o.id and sh.vendor_id = v.id
    where o.paid_at is not null
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.vendor_orders() from public, anon;
grant execute on function public.vendor_orders() to authenticated;

-- The vendor has packed their items for this order and they are ready for us to collect.
create function public.vendor_mark_packed(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vendors := public.vendor_require_own();
  v_status public.order_status;
begin
  if v.status <> 'active' then
    raise exception 'Your store is not active, so it can''t pack orders.' using errcode = '42501';
  end if;
  select o.status into v_status from public.orders o
  join public.order_shipments sh on sh.order_id = o.id and sh.vendor_id = v.id
  where o.id = p_order_id for update of sh;
  if not found then
    raise exception 'That order isn''t yours.' using errcode = '42501';
  end if;
  if v_status not in ('paid', 'packing', 'packed') then
    raise exception 'This order is %, so there is nothing to pack.', replace(v_status::text, '_', ' ') using errcode = '22023';
  end if;
  update public.order_shipments sh set status = 'packed', packed_at = now()
  where sh.order_id = p_order_id and sh.vendor_id = v.id and sh.status = 'pending';
  perform public.audit('vendor.order_packed', 'order', p_order_id::text, jsonb_build_object('vendor', v.slug));
end;
$$;

revoke all on function public.vendor_mark_packed(uuid) from public, anon;
grant execute on function public.vendor_mark_packed(uuid) to authenticated;

-- Our operations team collected a vendor's packed items.
create function public.admin_collect_vendor_items(p_order_id uuid, p_vendor_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['operations']::public.staff_role[]);
  update public.order_shipments sh
  set status = 'collected', collected_at = now(), collected_by = auth.jwt() ->> 'email'
  where sh.order_id = p_order_id and sh.vendor_id = p_vendor_id and sh.status = 'packed';
  if not found then
    raise exception 'Those items aren''t packed and waiting for collection.' using errcode = '22023';
  end if;
  perform public.audit('order.vendor_items_collected', 'order', p_order_id::text, jsonb_build_object('vendor_id', p_vendor_id));
end;
$$;

revoke all on function public.admin_collect_vendor_items(uuid, uuid) from public, anon;
grant execute on function public.admin_collect_vendor_items(uuid, uuid) to authenticated;

-- Vendor shipments for operations: what to collect from whom, with the vendor's phone.
create function public.admin_vendor_shipments(p_order_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['operations']::public.staff_role[]);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'order_id', o.id, 'order_number', o.order_number, 'order_status', o.status,
      'vendor_id', v.id, 'vendor_name', v.name, 'vendor_phone', pr.phone,
      'status', sh.status, 'packed_at', sh.packed_at, 'collected_at', sh.collected_at,
      'items', (select jsonb_agg(jsonb_build_object('name', oi.product_name, 'size', oi.size_label, 'quantity', oi.quantity)
                  order by oi.product_name)
                from public.order_items oi where oi.order_id = o.id and oi.vendor_id = v.id)
    ) order by sh.status, o.paid_at)
    from public.order_shipments sh
    join public.orders o on o.id = sh.order_id
    join public.vendors v on v.id = sh.vendor_id
    left join public.vendor_private pr on pr.vendor_id = v.id
    where (p_order_id is null and sh.status <> 'collected' and o.status in ('paid', 'packing', 'packed'))
       or sh.order_id = p_order_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_vendor_shipments(uuid) from public, anon;
grant execute on function public.admin_vendor_shipments(uuid) to authenticated;

-- Packing, picking, dispatching and returning now understand vendor lines.
create or replace function public.allocate_order_batches(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v_item record;
  v_batch record;
  v_left integer;
  v_take integer;
begin
  for v_item in
    select oi.id, oi.product_id, coalesce(oi.size_code, '') as size_code, oi.product_name, oi.size_label, oi.quantity
    from public.order_items oi where oi.order_id = p_order_id and oi.product_id is not null
      -- Vendors keep and pack their own stock, so only our own lines come from batches.
      and (oi.vendor_id is null or oi.vendor_id = public.house_vendor_id())
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

create or replace function public.admin_pick_list(p_order_id uuid)
 RETURNS TABLE(order_item_id uuid, product_name text, size_label text, ordered integer, batch_id uuid, batch_code text, expires_on date, quantity integer, packed boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
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
    from public.order_items oi where oi.order_id = p_order_id and (oi.vendor_id is null or oi.vendor_id = public.house_vendor_id()) order by oi.product_name
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

create or replace function public.return_order_batches(p_order_id uuid, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
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
  -- A vendor's units go back into the vendor's own stock.
  for v_row in
    select oi.product_id, coalesce(oi.size_code, '') as size_code, sum(oi.quantity)::integer as quantity
    from public.order_items oi
    join public.vendors v on v.id = oi.vendor_id and not v.is_house
    where oi.order_id = p_order_id and oi.product_id is not null
    group by oi.product_id, coalesce(oi.size_code, '')
  loop
    update public.inventory_levels i set on_hand = i.on_hand + v_row.quantity
    where i.product_id = v_row.product_id and i.size_code = v_row.size_code;
    perform public.log_stock_movement(v_row.product_id, v_row.size_code, null, 'returned',
      v_row.quantity, v_row.quantity, p_order_id, p_note);
  end loop;
  delete from public.order_item_batches ab
  using public.order_items oi
  where oi.id = ab.order_item_id and oi.order_id = p_order_id;
end;
$$;

create or replace function public.admin_pack_orders(p_order_ids uuid[])
 RETURNS TABLE(order_id uuid, order_number text, ok boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v_id uuid;
begin
  perform public.require_staff(array['operations']::public.staff_role[]);
  foreach v_id in array p_order_ids loop
    order_id := v_id;
    order_number := (select o.order_number from public.orders o where o.id = v_id);
    begin
      perform public.lock_order_for(v_id, array['paid', 'packing']::public.order_status[], 'packed');
      if exists (select 1 from public.order_shipments sh where sh.order_id = v_id and sh.status = 'pending') then
        raise exception 'Waiting for % to pack their items.',
          (select string_agg(v.name, ', ') from public.order_shipments sh join public.vendors v on v.id = sh.vendor_id
           where sh.order_id = v_id and sh.status = 'pending') using errcode = '22023';
      end if;
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

create or replace function public.admin_dispatch_order(p_order_id uuid, p_rider_id uuid DEFAULT NULL::uuid, p_courier_reference text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v_order public.orders%rowtype;
  v_rider public.riders%rowtype;
  v_max integer;
begin
  perform public.require_staff(array['operations']::public.staff_role[]);
  v_order := public.lock_order_for(p_order_id, array['packed', 'delivery_failed']::public.order_status[], 'dispatched');
  -- Everything from vendors has to be with us before the order goes out.
  if exists (select 1 from public.order_shipments sh where sh.order_id = p_order_id and sh.status <> 'collected') then
    raise exception 'Collect the items from % before dispatching order %.',
      (select string_agg(v.name, ', ') from public.order_shipments sh join public.vendors v on v.id = sh.vendor_id
       where sh.order_id = p_order_id and sh.status <> 'collected'), v_order.order_number using errcode = '22023';
  end if;
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
