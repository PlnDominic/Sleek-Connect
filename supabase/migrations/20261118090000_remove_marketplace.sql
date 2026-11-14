-- REMOVES THE OLD SELLER (VENDOR) SIDE OF THE DATABASE FOR GOOD. Run it only after a Supabase backup (Database → Backups).
--
-- Sleek Connect is one store with an internal supplier register (migration 20261113090000), so nothing here is used any more: seller
-- stores and their applications and ID details, subscriptions, payouts, disputes, messages, followed stores, product-view counts,
-- seller pickups, the marketplace price and review columns, and the seller settings. The core order, stock and account functions that
-- mentioned sellers are rewritten without them first.
--
-- It stops with a message, changing nothing, if an order already contains an item from a seller store or a product still belongs to one.
--
-- NOT done here: the files in the Storage buckets vendor-ids and vendor-assets. Storage files can only be removed through Supabase's
-- Storage screen or API, never by SQL. After this migration, open Supabase → Storage, empty both buckets and delete them.

do $$
begin
  if exists (select 1 from public.order_items oi join public.vendors v on v.id = oi.vendor_id where not v.is_house) then
    raise exception 'An order contains an item from a seller store, so the seller tables are kept. Nothing was changed.' using errcode = '22023';
  end if;
  if exists (select 1 from public.products p join public.vendors v on v.id = p.vendor_id where not v.is_house) then
    raise exception 'A product still belongs to a seller store. Delete or move it first (Admin → Products). Nothing was changed.' using errcode = '22023';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Core functions, rewritten without sellers (same behaviour for the store's own products).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.place_order(p_customer jsonb, p_delivery_option text, p_payment jsonb, p_items jsonb, p_is_gift boolean DEFAULT false)
 RETURNS TABLE(order_number text, order_token uuid, subtotal_ghs numeric, delivery_fee_ghs numeric, total_ghs numeric, reserved_until timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_name text := nullif(btrim(p_customer ->> 'name'), '');
  v_phone text := nullif(btrim(p_customer ->> 'phone'), '');
  v_area text := nullif(btrim(p_customer ->> 'area'), '');
  v_email text := nullif(lower(btrim(p_customer ->> 'email')), '');
  v_method text := p_payment ->> 'method';
  v_network text := nullif(p_payment ->> 'network', '');
  v_wallet text := nullif(btrim(p_payment ->> 'wallet'), '');
  v_fee numeric(10, 2);
  v_free_eligible boolean;
  v_zone text;
  v_rate public.delivery_rates%rowtype;
  v_threshold numeric(10, 2);
  v_order_id uuid;
  v_order_number text;
  v_order_token uuid;
  v_reserved_until timestamptz;
  v_subtotal numeric(10, 2) := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_size public.product_sizes%rowtype;
  v_has_sizes boolean;
  v_qty integer;
  v_unit numeric(10, 2);
  v_available integer;
  v_notify text;
  v_cod_max numeric(10, 2);
  v_adult boolean;
begin
  if v_name is null or length(v_name) > 120 then
    raise exception 'Enter your full name.' using errcode = '22023';
  end if;

  if v_phone is null or regexp_replace(v_phone, '\D', '', 'g') !~ '^\d{9,15}$' then
    raise exception 'Enter a valid phone number.' using errcode = '22023';
  end if;

  -- The terms say you must be 18 or older to order. A guest confirms it at checkout; a signed-in shopper has already confirmed
  -- it (and accepted the terms) when creating their account. The moment is kept on the order.
  v_adult := coalesce(p_customer ->> 'adult_confirmed', '') = 'true'
    or exists (
      select 1 from public.profiles pr
      where pr.id = auth.uid() and pr.confirmed_adult_at is not null and pr.accepted_terms_at is not null
    );
  if not v_adult then
    raise exception 'Please confirm that you are 18 or older and accept the terms.' using errcode = '22023';
  end if;

  -- An email address is optional. When given, order updates are emailed to it as well as texted.
  if v_email is not null and (length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'Check the email address.' using errcode = '22023';
  end if;

  select a.zone_id into v_zone from public.delivery_areas a where a.name = v_area and a.is_active;
  if not found then
    raise exception 'We don''t deliver to that area yet.' using errcode = '22023';
  end if;

  select o.fee_ghs, o.free_eligible into v_fee, v_free_eligible
  from public.delivery_options o where o.id = p_delivery_option;
  if not found then
    raise exception 'Choose a delivery window.' using errcode = '22023';
  end if;

  -- The area's zone can charge its own fee, or not offer this option at all (PRD FR-040).
  select * into v_rate from public.delivery_rates r where r.zone_id = v_zone and r.option_id = p_delivery_option;
  if found then
    if not v_rate.is_available then
      raise exception 'That delivery option isn''t available in %. Choose another.', v_area using errcode = '22023';
    end if;
    v_fee := coalesce(v_rate.fee_ghs, v_fee);
  end if;

  if v_method is null or v_method not in ('momo', 'card', 'cod') then
    raise exception 'Choose a payment method.' using errcode = '22023';
  end if;

  if v_method = 'cod' then
    -- Pay on delivery: cash to the rider. Staff confirm the order by phone before it is packed.
    if not coalesce((select s.pay_on_delivery_enabled from public.store_settings s), false) then
      raise exception 'Pay on delivery isn''t available right now. Choose Mobile Money.' using errcode = '22023';
    end if;
    -- A few unconfirmed orders per phone number at a time, so the option can't be used to lock up stock.
    if (select count(*) from public.orders x
        where x.payment_method = 'cod' and x.status = 'pending_payment'
          and regexp_replace(x.phone, '\D', '', 'g') = regexp_replace(v_phone, '\D', '', 'g')) >= 3 then
      raise exception 'You already have orders waiting for our confirmation call. We''ll be in touch soon.' using errcode = '22023';
    end if;
  end if;

  if v_method = 'momo' then
    if v_network is null or v_network not in ('mtn', 'telecel', 'at') then
      raise exception 'Choose your Mobile Money network.' using errcode = '22023';
    end if;
    if v_wallet is null or regexp_replace(v_wallet, '\D', '', 'g') !~ '^\d{9,15}$' then
      raise exception 'Enter a valid wallet number.' using errcode = '22023';
    end if;
  else
    v_network := null;
    v_wallet := null;
  end if;

  if jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) = 0
     or jsonb_array_length(p_items) > 50 then
    raise exception 'Your bag is empty.' using errcode = '22023';
  end if;

  -- Online payments hold the stock for a few minutes. Pay on delivery holds it until staff confirm (or the hold runs out).
  select case when v_method = 'cod' then now() + make_interval(hours => s.pay_on_delivery_hold_hours)
              else now() + make_interval(mins => s.reservation_minutes) end
  into v_reserved_until from public.store_settings s;

  insert into public.orders (
    user_id, customer_name, phone, contact_email, area, ghanapost_gps, rider_directions, delivery_option_id,
    is_gift, payment_method, momo_network, wallet_number, subtotal_ghs, reservation_expires_at, adult_confirmed_at
  )
  values (
    auth.uid(), v_name, v_phone, v_email, v_area,
    left(nullif(btrim(p_customer ->> 'ghanapost_gps'), ''), 20),
    left(nullif(btrim(p_customer ->> 'directions'), ''), 300),
    p_delivery_option, coalesce(p_is_gift, false), v_method::public.payment_method,
    v_network::public.momo_network, v_wallet, 0, v_reserved_until, now()
  )
  returning id, orders.order_number, orders.public_token into v_order_id, v_order_number, v_order_token;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_product
    from public.products p
    where p.slug = v_item ->> 'slug' and p.is_published;
    if not found then
      raise exception 'A product in your bag is no longer available.' using errcode = '22023';
    end if;

    if jsonb_typeof(v_item -> 'quantity') is distinct from 'number'
       or (v_item ->> 'quantity')::numeric <> trunc((v_item ->> 'quantity')::numeric)
       or (v_item ->> 'quantity')::numeric not between 1 and 20 then
      raise exception 'Quantities must be between 1 and 20.' using errcode = '22023';
    end if;
    v_qty := (v_item ->> 'quantity')::integer;

    v_size := null;
    select exists (select 1 from public.product_sizes s where s.product_id = v_product.id) into v_has_sizes;
    if v_has_sizes then
      select * into v_size
      from public.product_sizes s
      where s.product_id = v_product.id
        and (s.code = v_item ->> 'size' or (v_item ->> 'size' is null and s.is_default));
      if not found then
        raise exception 'Choose a size for %.', v_product.name using errcode = '22023';
      end if;
    end if;

    -- Reserve stock. The row lock makes concurrent checkouts queue here, so stock can't be oversold.
    update public.inventory_levels i
    set reserved = i.reserved + v_qty
    where i.product_id = v_product.id
      and i.size_code = coalesce(v_size.code, '')
      and i.on_hand - i.reserved >= v_qty;
    if not found then
      select i.on_hand - i.reserved into v_available
      from public.inventory_levels i
      where i.product_id = v_product.id and i.size_code = coalesce(v_size.code, '');
      if coalesce(v_available, 0) <= 0 then
        raise exception '% is sold out.', concat_ws(', ', v_product.name, v_size.label) using errcode = '22023';
      end if;
      raise exception 'Only % left of %.', v_available, concat_ws(', ', v_product.name, v_size.label)
        using errcode = '22023';
    end if;

    v_unit := coalesce(v_size.price_ghs, v_product.price_ghs);
    v_subtotal := v_subtotal + v_unit * v_qty;

    insert into public.order_items (
      order_id, product_id, product_name, size_code, size_label, unit_price_ghs, quantity, line_total_ghs
    )
    values (
      v_order_id, v_product.id, v_product.name, v_size.code, v_size.label, v_unit, v_qty, v_unit * v_qty
    );
  end loop;

  -- Free delivery once the bag reaches the threshold, for the options that offer it.
  select s.free_delivery_threshold_ghs into v_threshold from public.store_settings s;
  if v_free_eligible and v_threshold is not null and v_subtotal >= v_threshold then
    v_fee := 0;
  end if;

  if v_method = 'cod' then
    if v_fee is null then
      raise exception 'Pay on delivery needs the delivery fee, and it isn''t set for % yet.', v_area using errcode = '22023';
    end if;
    select s.pay_on_delivery_max_ghs into v_cod_max from public.store_settings s;
    if v_cod_max is not null and v_subtotal + v_fee > v_cod_max then
      raise exception 'Pay on delivery is for orders up to GH₵ %. Choose Mobile Money for this one.', trim(to_char(v_cod_max, 'FM999999990.00'))
        using errcode = '22023';
    end if;
  end if;

  update public.orders o
  set subtotal_ghs = v_subtotal,
      delivery_fee_ghs = v_fee,
      total_ghs = case when v_fee is null then null else v_subtotal + v_fee end
  where o.id = v_order_id;

  -- "Order received" email, queued now: to the address typed at checkout, or else the signed-in account's. An address gets
  -- at most three of these an hour, so the form can't be used to flood someone's inbox.
  select coalesce(v_email, (select u.email from auth.users u where u.id = auth.uid())) into v_notify;
  if v_notify is not null
     and (select count(*) from public.notifications n
          where n.template = 'order_received' and n.recipient = v_notify and n.created_at > now() - interval '1 hour') < 3 then
    perform public.queue_customer_message(v_order_id, 'order_received', null, v_notify, jsonb_build_object(
      'order_number', v_order_number,
      'customer_name', v_name,
      'total_ghs', case when v_fee is null then null else v_subtotal + v_fee end,
      'order_token', v_order_token,
      'delivery_code', '',
      'reserved_until', v_reserved_until,
      'pay_on_delivery', v_method = 'cod',
      'rider_name', null, 'courier_reference', null, 'reason', null, 'refund_due', false));
  end if;

  return query
  select v_order_number, v_order_token, v_subtotal, v_fee,
         case when v_fee is null then null else v_subtotal + v_fee end, v_reserved_until;
end;
$function$;

CREATE OR REPLACE FUNCTION public.allocate_order_batches(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.return_order_batches(p_order_id uuid, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_dispatch_order(p_order_id uuid, p_rider_id uuid DEFAULT NULL::uuid, p_courier_reference text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_pack_orders(p_order_ids uuid[])
 RETURNS TABLE(order_id uuid, order_number text, ok boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_pick_list(p_order_id uuid)
 RETURNS TABLE(order_item_id uuid, product_name text, size_label text, ordered integer, batch_id uuid, batch_code text, expires_on date, quantity integer, packed boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.account_deletion_blocker()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  v_open integer;
begin
  if v_user is null then
    return 'Sign in first.';
  end if;
  if public.current_staff_role() is not null then
    return 'This account is on the staff list. Ask an admin to remove you from it first.';
  end if;
  select count(*) into v_open from public.orders o
  where o.user_id = v_user and o.status not in ('delivered', 'cancelled', 'returned');
  if v_open > 0 then
    return format('You have %s order%s still in progress. You can delete your account once %s delivered or cancelled.',
                  v_open, case when v_open = 1 then '' else 's' end, case when v_open = 1 then 'it is' else 'they are' end);
  end if;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_my_account()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  v_blocker text := public.account_deletion_blocker();
  v_orders uuid[];
begin
  if v_blocker is not null then
    raise exception '%', v_blocker using errcode = '22023';
  end if;

  select coalesce(array_agg(o.id), '{}') into v_orders from public.orders o where o.user_id = v_user;

  update public.orders o
  set user_id = null, customer_name = 'Deleted customer', phone = '', contact_email = null, ghanapost_gps = null, rider_directions = null,
      wallet_number = case when o.wallet_number is null then null else '' end
  where o.id = any (v_orders);

  update public.support_cases s
  set name = 'Deleted customer', phone = '', email = null, message = '[Removed at the customer’s request]',
      staff_reply = null
  where s.order_id = any (v_orders);

  update public.return_requests r set details = null, photo_paths = '{}' where r.order_id = any (v_orders);
  delete from public.notifications n where n.order_id = any (v_orders);
  delete from public.push_device_orders l where l.order_id = any (v_orders);

  -- Logged without who it was: the point of deleting is that nothing identifying is kept.
  insert into public.audit_log (action, entity, details)
  values ('account.deleted', 'account', jsonb_build_object('orders_anonymised', cardinality(v_orders)));

  -- Cascades to the profile, addresses, saved numbers, bag, wishlist and reviews.
  delete from auth.users u where u.id = v_user;
  return jsonb_build_object('orders_anonymised', cardinality(v_orders));
end;
$function$;

CREATE OR REPLACE FUNCTION public.export_my_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'exported_at', now(),
    'account', (
      select jsonb_build_object('email', u.email, 'created_at', u.created_at, 'confirmed_adult_at', pr.confirmed_adult_at,
                                'accepted_terms_at', pr.accepted_terms_at)
      from auth.users u left join public.profiles pr on pr.id = u.id where u.id = v_user
    ),
    'addresses', coalesce((
      select jsonb_agg(jsonb_build_object('label', a.label, 'recipient_name', a.recipient_name, 'phone', a.phone,
        'area', a.area, 'ghanapost_gps', a.ghanapost_gps, 'directions', a.directions, 'is_default', a.is_default,
        'saved_at', a.created_at) order by a.created_at)
      from public.customer_addresses a where a.user_id = v_user), '[]'),
    'payment_methods', coalesce((
      select jsonb_agg(jsonb_build_object('network', m.network, 'wallet_number', m.wallet_number, 'label', m.label,
        'is_default', m.is_default, 'saved_at', m.created_at) order by m.created_at)
      from public.saved_payment_methods m where m.user_id = v_user), '[]'),
    'saved_products', coalesce((
      select jsonb_agg(jsonb_build_object('product', p.name, 'slug', p.slug, 'saved_at', w.created_at) order by w.created_at)
      from public.wishlist_items w join public.products p on p.id = w.product_id where w.user_id = v_user), '[]'),
    'bag', coalesce((
      select jsonb_agg(jsonb_build_object('product', p.name, 'slug', p.slug, 'size', nullif(b.size_code, ''),
        'quantity', b.quantity, 'updated_at', b.updated_at))
      from public.bag_items b join public.products p on p.id = b.product_id where b.user_id = v_user), '[]'),
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'order_number', o.order_number, 'status', o.status, 'placed_at', o.created_at, 'delivered_at', o.delivered_at,
        'customer_name', o.customer_name, 'phone', o.phone, 'email', o.contact_email, 'area', o.area, 'ghanapost_gps', o.ghanapost_gps,
        'directions', o.rider_directions, 'is_gift', o.is_gift, 'adult_and_terms_confirmed_at', o.adult_confirmed_at, 'payment_method', o.payment_method,
        'momo_network', o.momo_network, 'wallet_number', o.wallet_number, 'subtotal_ghs', o.subtotal_ghs,
        'delivery_fee_ghs', o.delivery_fee_ghs, 'total_ghs', o.total_ghs,
        'items', coalesce((select jsonb_agg(jsonb_build_object('product', i.product_name, 'size', i.size_label,
            'unit_price_ghs', i.unit_price_ghs, 'quantity', i.quantity, 'line_total_ghs', i.line_total_ghs))
          from public.order_items i where i.order_id = o.id), '[]'),
        'history', coalesce((select jsonb_agg(jsonb_build_object('status', e.status, 'at', e.at) order by e.at)
          from public.order_events e where e.order_id = o.id), '[]')
      ) order by o.created_at desc)
      from public.orders o where o.user_id = v_user), '[]'),
    'returns', coalesce((
      select jsonb_agg(jsonb_build_object('case_number', r.case_number, 'order_number', o.order_number, 'status', r.status,
        'reason', r.reason, 'details', r.details, 'requested_at', r.created_at) order by r.created_at)
      from public.return_requests r join public.orders o on o.id = r.order_id where o.user_id = v_user), '[]'),
    'support_cases', coalesce((
      select jsonb_agg(jsonb_build_object('case_number', s.case_number, 'order_number', o.order_number, 'topic', s.topic,
        'name', s.name, 'phone', s.phone, 'email', s.email, 'message', s.message, 'status', s.status,
        'reply', s.staff_reply, 'opened_at', s.created_at) order by s.created_at)
      from public.support_cases s join public.orders o on o.id = s.order_id where o.user_id = v_user), '[]'),
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object('product', p.name, 'rating', r.rating, 'title', r.title, 'review', r.body,
        'status', r.status, 'written_at', r.created_at) order by r.created_at)
      from public.product_reviews r join public.products p on p.id = r.product_id where r.user_id = v_user), '[]'),
    'devices', coalesce((
      select jsonb_agg(jsonb_build_object('platform', d.platform, 'registered_at', d.created_at) order by d.created_at)
      from public.push_devices d where d.user_id = v_user), '[]')
  ) into v_result;
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_bulk_update_products(p_ids uuid[], p_changes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_p public.products%rowtype;
  v_updated integer := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_price jsonb := p_changes -> 'price';
  v_mode text := v_price ->> 'mode';
  v_value numeric;
  v_skin jsonb := p_changes -> 'skin_types';
  v_skin_mode text := v_skin ->> 'mode';
  v_skin_values text[];
  v_sizes integer;
  v_base numeric;
  v_factor numeric;
  v_new_price numeric;
  v_new_was numeric;
  v_default_price numeric;
  v_problems text[];
  v_skin_next text[];
begin
  perform public.require_staff(array['catalogue']::public.staff_role[]);
  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'Select at least one product.' using errcode = '22023';
  end if;
  if cardinality(p_ids) > 200 then
    raise exception 'Change up to 200 products at a time.' using errcode = '22023';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' or p_changes = '{}'::jsonb then
    raise exception 'Choose what to change.' using errcode = '22023';
  end if;

  if p_changes ? 'category_id' and not exists (select 1 from public.categories c where c.id = p_changes ->> 'category_id') then
    raise exception 'That category doesn''t exist.' using errcode = '22023';
  end if;
  if p_changes ? 'size_guide_id' and p_changes ->> 'size_guide_id' is not null
     and not exists (select 1 from public.size_guides g where g.id = p_changes ->> 'size_guide_id') then
    raise exception 'That size guide doesn''t exist.' using errcode = '22023';
  end if;
  if v_price is not null then
    if v_mode is null or v_mode not in ('percent', 'amount', 'set', 'sale_percent', 'end_sale') then
      raise exception 'Choose how to change the prices.' using errcode = '22023';
    end if;
    if v_mode <> 'end_sale' then
      begin
        v_value := (v_price ->> 'value')::numeric;
      exception when others then
        raise exception 'Enter the price change as a number.' using errcode = '22023';
      end;
      if v_value is null then
        raise exception 'Enter the price change as a number.' using errcode = '22023';
      end if;
      if v_mode = 'sale_percent' and (v_value < 1 or v_value > 90) then
        raise exception 'A sale takes between 1%% and 90%% off.' using errcode = '22023';
      end if;
      if v_mode = 'set' and v_value < 0 then
        raise exception 'A price can''t be below zero.' using errcode = '22023';
      end if;
      if v_mode = 'percent' and v_value <= -100 then
        raise exception 'A price can''t drop by 100%% or more.' using errcode = '22023';
      end if;
    end if;
  end if;
  if v_skin is not null then
    if v_skin_mode is null or v_skin_mode not in ('add', 'replace', 'clear') then
      raise exception 'Choose how to change the skin types.' using errcode = '22023';
    end if;
    v_skin_values := array(select btrim(x) from jsonb_array_elements_text(
      case when jsonb_typeof(v_skin -> 'values') = 'array' then v_skin -> 'values' else '[]'::jsonb end) x where btrim(x) <> '');
    if v_skin_mode <> 'clear' and cardinality(v_skin_values) = 0 then
      raise exception 'Enter at least one skin type.' using errcode = '22023';
    end if;
  end if;

  foreach v_id in array (select array_agg(distinct x) from unnest(p_ids) x) loop
    select * into v_p from public.products x where x.id = v_id for update;
    if not found then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('id', v_id, 'name', null, 'reason', 'It no longer exists.'));
      continue;
    end if;
    -- One product at a time: if any change to it fails, none of its changes are kept and the reason is reported.
    begin
      if v_price is not null then
        select count(*) into v_sizes from public.product_sizes s where s.product_id = v_id;
        v_new_price := v_p.price_ghs;
        v_new_was := v_p.was_price_ghs;

        if v_mode = 'percent' then
          v_factor := 1 + v_value / 100;
          v_new_price := round(v_p.price_ghs * v_factor, 2);
          v_new_was := case when v_p.was_price_ghs is null then null else round(v_p.was_price_ghs * v_factor, 2) end;
          update public.product_sizes s set price_ghs = round(s.price_ghs * v_factor, 2) where s.product_id = v_id;
        elsif v_mode = 'amount' then
          v_new_price := round(v_p.price_ghs + v_value, 2);
          v_new_was := case when v_p.was_price_ghs is null then null else round(v_p.was_price_ghs + v_value, 2) end;
          if v_new_price < 0 or (v_sizes > 0 and exists (select 1 from public.product_sizes s where s.product_id = v_id and s.price_ghs + v_value < 0)) then
            raise exception 'The price would go below zero.' using errcode = '22023';
          end if;
          update public.product_sizes s set price_ghs = round(s.price_ghs + v_value, 2) where s.product_id = v_id;
        elsif v_mode = 'set' then
          if v_sizes > 1 then
            raise exception 'It has several sizes, each with its own price: set them on the product.' using errcode = '22023';
          end if;
          v_new_price := round(v_value, 2);
          v_new_was := case when v_p.was_price_ghs is null or v_p.was_price_ghs <= v_new_price then null else v_p.was_price_ghs end;
          update public.product_sizes s set price_ghs = v_new_price where s.product_id = v_id;
        elsif v_mode = 'sale_percent' then
          if v_p.was_price_ghs is not null then
            raise exception 'It is already on sale: end the sale first.' using errcode = '22023';
          end if;
          v_factor := 1 - v_value / 100;
          v_new_was := v_p.price_ghs;
          v_new_price := round(v_p.price_ghs * v_factor, 2);
          update public.product_sizes s set price_ghs = round(s.price_ghs * v_factor, 2) where s.product_id = v_id;
        else -- end_sale
          if v_p.was_price_ghs is null or v_p.price_ghs <= 0 then
            raise exception 'It is not on sale.' using errcode = '22023';
          end if;
          v_factor := v_p.was_price_ghs / v_p.price_ghs;
          v_new_price := v_p.was_price_ghs;
          v_new_was := null;
          update public.product_sizes s set price_ghs = round(s.price_ghs * v_factor, 2) where s.product_id = v_id;
        end if;

        if v_new_price < 0 then
          raise exception 'The price would go below zero.' using errcode = '22023';
        end if;
        -- With sizes, the product's price is its default size's price.
        select s.price_ghs into v_default_price from public.product_sizes s where s.product_id = v_id and s.is_default;
        if v_default_price is not null then
          v_new_price := v_default_price;
        end if;
        if v_new_was is not null and v_new_was <= v_new_price then
          v_new_was := null;
        end if;

        update public.products x set price_ghs = v_new_price, was_price_ghs = v_new_was where x.id = v_id;
        perform public.audit('product.price_changed', 'product', v_id::text, jsonb_build_object(
          'bulk', true,
          'before', jsonb_build_object('price_ghs', v_p.price_ghs, 'was_price_ghs', v_p.was_price_ghs),
          'after', jsonb_build_object('price_ghs', v_new_price, 'was_price_ghs', v_new_was)));
      end if;

      if p_changes ? 'category_id' then
        update public.products x set category_id = p_changes ->> 'category_id' where x.id = v_id;
      end if;

      if p_changes ? 'size_guide_id' then
        update public.products x set size_guide_id = p_changes ->> 'size_guide_id' where x.id = v_id;
      end if;

      if v_skin is not null then
        v_skin_next := case v_skin_mode
          when 'clear' then '{}'::text[]
          when 'replace' then v_skin_values
          else array(select distinct t from unnest(v_p.skin_types || v_skin_values) t order by t)
        end;
        update public.products x set skin_types = v_skin_next where x.id = v_id;
      end if;

      if p_changes ? 'published' then
        if (p_changes ->> 'published')::boolean then
          if not v_p.is_published then
            v_problems := public.product_publish_problems(v_id);
            if cardinality(v_problems) > 0 then
              raise exception 'Not ready for the store. Missing: %.', array_to_string(v_problems, ', ') using errcode = '22023';
            end if;
            update public.products x set is_published = true where x.id = v_id;
            perform public.audit('product.published', 'product', v_id::text, jsonb_build_object('bulk', true));
          end if;
        elsif v_p.is_published then
          update public.products x set is_published = false where x.id = v_id;
          perform public.audit('product.unpublished', 'product', v_id::text, jsonb_build_object('bulk', true));
        end if;
      end if;

      perform public.audit('product.bulk_updated', 'product', v_id::text, p_changes);
      v_updated := v_updated + 1;
    exception when others then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('id', v_id, 'name', v_p.name, 'reason', sqlerrm));
    end;
  end loop;

  return jsonb_build_object('updated', v_updated, 'skipped', v_skipped);
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_reorder_suggestions()
 RETURNS TABLE(product_id uuid, slug text, product_name text, size_code text, size_label text, category_name text, is_published boolean, available integer, sold_in_window integer, window_days integer, daily_rate numeric, days_left numeric, suggested_qty integer, urgency text, next_expiry date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
begin
  perform public.require_staff();
  return query
  with cfg as (
    select st.reorder_lead_days as lead, st.reorder_cover_days as cover, st.low_stock_threshold as low from public.store_settings st
  ),
  sold as (
    select m.product_id as pid, m.size_code as sc, sum(-m.sellable_change)::integer as units
    from public.stock_movements m
    where m.reason = 'sold' and m.at >= now() - interval '30 days'
    group by m.product_id, m.size_code
  ),
  base as (
    select p.id as pid, p.slug as pslug, p.name as pname, i.size_code as sc, s.label as slabel, c.name as cname,
           p.is_published as published, (i.on_hand - i.reserved) as avail,
           coalesce(sold.units, 0) as units,
           least(30, greatest(7, (current_date - p.created_at::date)))::integer as win,
           coalesce(c.low_stock_threshold, cfg.low) as low_level,
           cfg.lead, cfg.cover, s.sort_order as so,
           nx.expires_on
    from public.inventory_levels i
    join public.products p on p.id = i.product_id
    left join public.product_sizes s on s.product_id = i.product_id and s.code = i.size_code
    left join public.categories c on c.id = p.category_id
    left join sold on sold.pid = i.product_id and sold.sc = i.size_code
    left join lateral (
      select min(b.expires_on) as expires_on from public.stock_batches b
      where b.product_id = i.product_id and b.size_code = i.size_code and b.status = 'available' and b.quantity > 0
    ) nx on true
    cross join cfg
    where p.recalled_at is null
  ),
  calc as (
    select b.*, round(b.units::numeric / b.win, 2) as rate from base b
  ),
  scored as (
    select k.*,
           case when k.rate > 0 then round(greatest(k.avail, 0) / k.rate, 1) end as left_days,
           greatest(0, ceil(k.rate * (k.lead + k.cover))::integer - greatest(k.avail, 0)) as suggest
    from calc k
  )
  select z.pid, z.pslug, z.pname, z.sc, z.slabel, z.cname, z.published, z.avail, z.units, z.win, z.rate, z.left_days, z.suggest,
         case
           when z.rate > 0 and z.avail <= 0 then 'out'
           when z.left_days is not null and z.left_days < z.lead then 'now'
           when z.left_days is not null and z.left_days < z.lead + z.cover then 'soon'
           when z.avail <= z.low_level then 'low'
           else 'ok'
         end,
         z.expires_on
  from scored z
  where z.suggest > 0 or z.avail <= z.low_level
  order by case
             when z.rate > 0 and z.avail <= 0 then 0
             when z.left_days is not null and z.left_days < z.lead then 1
             when z.left_days is not null and z.left_days < z.lead + z.cover then 2
             else 3
           end,
           z.left_days nulls last, z.pname, z.so nulls first;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Triggers of the marketplace.
-- ---------------------------------------------------------------------------

drop trigger if exists products_marketplace_rules on public.products;
drop trigger if exists products_markup_resize on public.products;
drop trigger if exists product_sizes_marketplace_price on public.product_sizes;
drop trigger if exists order_items_marketplace on public.order_items;
drop trigger if exists order_items_shipment on public.order_items;
drop trigger if exists vendors_refresh_products on public.vendors;
drop trigger if exists order_events_vendor_notifications on public.order_events;

-- Messages to sellers still waiting to be sent have nowhere to go.
delete from public.notifications where template like 'vendor\_%';

-- ---------------------------------------------------------------------------
-- 3. Tables.
-- ---------------------------------------------------------------------------

alter table public.suppliers drop column if exists legacy_vendor_id;

drop table if exists public.order_shipments cascade;
drop table if exists public.store_follows cascade;
drop table if exists public.product_views cascade;
drop table if exists public.vendor_decisions cascade;
drop table if exists public.vendor_disputes cascade;
drop table if exists public.vendor_messages cascade;
drop table if exists public.vendor_payouts cascade;
drop table if exists public.vendor_private cascade;
drop table if exists public.vendor_sections cascade;
drop table if exists public.vendor_subscription_payments cascade;
drop table if exists public.vendor_subscriptions cascade;

-- ---------------------------------------------------------------------------
-- 4. Columns that only existed for sellers.
-- ---------------------------------------------------------------------------

alter table public.notifications drop column if exists vendor_id;
alter table public.order_items drop column if exists vendor_id, drop column if exists vendor_unit_price_ghs, drop column if exists markup_unit_ghs;
alter table public.product_sizes drop column if exists vendor_price_ghs;
alter table public.products
  drop column if exists vendor_id, drop column if exists section_id, drop column if exists review_status, drop column if exists publish_requested,
  drop column if exists vendor_price_ghs, drop column if exists vendor_was_price_ghs, drop column if exists markup_percent,
  drop column if exists review_note, drop column if exists review_previous, drop column if exists review_checks;
alter table public.store_settings
  drop column if exists vendor_accounts_open, drop column if exists vendor_annual_fee_ghs, drop column if exists vendor_grace_days,
  drop column if exists vendor_payout_hold_days, drop column if exists vendor_min_payout_ghs, drop column if exists vendor_tin_required,
  drop column if exists vendor_support_reply_hours, drop column if exists vendor_payment_instructions, drop column if exists default_markup_percent,
  drop column if exists marketplace_orders_open;

drop table if exists public.vendors cascade;

-- Now nothing depends on the seller functions, so they can go.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prokind = 'f'
      and (p.proname ~ '(vendor|dispute)'
           or p.proname in ('follow_store', 'unfollow_store', 'is_following_store', 'my_followed_stores', 'store_directory', 'store_rating',
                            'store_reviews', 'store_facts', 'record_product_view', 'my_product_folder_ok', 'confirm_subscription_payment',
                            'admin_record_subscription', 'admin_record_payout', 'admin_set_marketplace_settings', 'admin_review_product',
                            'admin_review_replies', 'admin_remove_review_reply', 'products_marketplace_rules', 'products_markup_resize',
                            'product_sizes_marketplace_price', 'order_items_marketplace', 'order_items_shipment'))
  loop
    execute 'drop function ' || f.sig;
  end loop;
end;
$$;

drop type if exists public.product_review_status;
drop type if exists public.vendor_status;
drop type if exists public.vendor_dispute_kind;
drop type if exists public.vendor_dispute_outcome;
drop type if exists public.vendor_dispute_status;
drop type if exists public.shipment_status;

-- ---------------------------------------------------------------------------
-- 5. Storage rules for the seller buckets (the files themselves are removed in the Storage screen).
-- ---------------------------------------------------------------------------

drop policy if exists "Applicants upload their ID" on storage.objects;
drop policy if exists "Applicants see their own ID" on storage.objects;
drop policy if exists "Applicants remove their own ID" on storage.objects;
drop policy if exists "Admins can open vendor IDs" on storage.objects;
