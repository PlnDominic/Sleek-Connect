-- An optional email address at checkout, so shoppers who are not signed in (or signed in by phone) can get order updates by
-- email as well as SMS. It is kept on the order, is not readable by any browser role (staff included: it has no select
-- grant), and is removed when an account is deleted.

alter table public.orders
  add column contact_email text
  check (contact_email is null or (length(contact_email) <= 254 and contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'));

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
begin
  if v_name is null or length(v_name) > 120 then
    raise exception 'Enter your full name.' using errcode = '22023';
  end if;

  if v_phone is null or regexp_replace(v_phone, '\D', '', 'g') !~ '^\d{9,15}$' then
    raise exception 'Enter a valid phone number.' using errcode = '22023';
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

  if v_method is null or v_method not in ('momo', 'card') then
    raise exception 'Choose a payment method.' using errcode = '22023';
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

  select now() + make_interval(mins => s.reservation_minutes) into v_reserved_until from public.store_settings s;

  insert into public.orders (
    user_id, customer_name, phone, contact_email, area, ghanapost_gps, rider_directions, delivery_option_id,
    is_gift, payment_method, momo_network, wallet_number, subtotal_ghs, reservation_expires_at
  )
  values (
    auth.uid(), v_name, v_phone, v_email, v_area,
    left(nullif(btrim(p_customer ->> 'ghanapost_gps'), ''), 20),
    left(nullif(btrim(p_customer ->> 'directions'), ''), 300),
    p_delivery_option, coalesce(p_is_gift, false), v_method::public.payment_method,
    v_network::public.momo_network, v_wallet, 0, v_reserved_until
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

  update public.orders o
  set subtotal_ghs = v_subtotal,
      delivery_fee_ghs = v_fee,
      total_ghs = case when v_fee is null then null else v_subtotal + v_fee end
  where o.id = v_order_id;

  return query
  select v_order_number, v_order_token, v_subtotal, v_fee,
         case when v_fee is null then null else v_subtotal + v_fee end, v_reserved_until;
end;
$function$;

CREATE OR REPLACE FUNCTION public.queue_order_notifications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order public.orders%rowtype;
  v_template text;
  v_email text;
  v_payload jsonb;
begin
  select * into v_order from public.orders o where o.id = new.order_id;

  v_template := case new.status
    when 'paid' then 'order_confirmed'
    when 'packed' then 'order_packed'
    when 'out_for_delivery' then 'out_for_delivery'
    when 'delivered' then 'order_delivered'
    when 'delivery_failed' then 'delivery_failed'
    when 'returned' then 'order_returned'
    -- Unpaid orders that lapse are not worth a message; cancelled paid orders are.
    when 'cancelled' then case when v_order.paid_at is not null then 'order_cancelled' end
  end;
  if v_template is null then
    return null;
  end if;

  v_payload := jsonb_build_object(
    'order_number', v_order.order_number,
    'customer_name', v_order.customer_name,
    'total_ghs', v_order.total_ghs,
    'order_token', v_order.public_token,
    'delivery_code', v_order.delivery_code,
    'rider_name', (select r.name from public.riders r where r.id = v_order.rider_id),
    'courier_reference', v_order.courier_reference,
    'reason', new.details ->> 'reason',
    'refund_due', v_order.refund_due
  );

  insert into public.notifications (order_id, template, channel, recipient, payload)
  values (v_order.id, v_template, 'sms', v_order.phone, v_payload);

  -- The address typed at checkout wins; otherwise the signed-in account's email.
  select coalesce(v_order.contact_email, u.email) into v_email from (select 1) x left join auth.users u on u.id = v_order.user_id;
  if v_email is not null then
    insert into public.notifications (order_id, template, channel, recipient, payload)
    values (v_order.id, v_template, 'email', v_email, v_payload);
  end if;

  -- The app's push notification for the same change: the shopper's signed-in devices, and any device that has
  -- followed this order.
  insert into public.notifications (order_id, template, channel, recipient, payload)
  select v_order.id, v_template, 'push', t.token, v_payload
  from (
    select d.token from public.push_devices d where v_order.user_id is not null and d.user_id = v_order.user_id
    union
    select l.token from public.push_device_orders l where l.order_id = v_order.id
  ) t;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.queue_return_message(p_return_id uuid, p_template text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.queue_customer_message(o.id, p_template, o.phone,
    coalesce(o.contact_email, (select u.email from auth.users u where u.id = o.user_id)),
    jsonb_build_object('case_number', r.case_number, 'order_number', o.order_number, 'customer_name', o.customer_name,
      'order_token', o.public_token, 'note', r.decision_note, 'refund_amount_ghs', r.refund_amount_ghs))
  from public.return_requests r join public.orders o on o.id = r.order_id
  where r.id = p_return_id;
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
        'directions', o.rider_directions, 'is_gift', o.is_gift, 'payment_method', o.payment_method,
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
      from public.push_devices d where d.user_id = v_user), '[]'),
    'vendor_store', (
      select jsonb_build_object('name', v.name, 'web_address', v.slug, 'tagline', v.tagline, 'description', v.description,
        'status', v.status, 'applied_at', v.created_at, 'phone', pr.phone, 'email', pr.email,
        'owner_name', pr.owner_name, 'id_type', pr.id_type, 'id_number', pr.id_number,
        'subscriptions', coalesce((select jsonb_agg(jsonb_build_object('starts_on', s.starts_on, 'ends_on', s.ends_on,
            'amount_ghs', s.amount_ghs, 'method', s.method, 'reference', s.reference) order by s.starts_on)
          from public.vendor_subscriptions s where s.vendor_id = v.id), '[]'),
        'products', coalesce((select jsonb_agg(jsonb_build_object('name', p.name, 'your_price_ghs', p.vendor_price_ghs,
            'review_status', p.review_status) order by p.created_at)
          from public.products p where p.vendor_id = v.id), '[]'))
      from public.vendors v left join public.vendor_private pr on pr.vendor_id = v.id
      where v.owner_id = v_user and not v.is_house)
  ) into v_result;
  return v_result;
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

  -- A vendor's store is closed and its contact details removed. The store name and products stay for past orders.
  delete from public.vendor_private pr using public.vendors v where pr.vendor_id = v.id and v.owner_id = v_user;
  update public.vendors v set status = 'suspended', owner_id = null where v.owner_id = v_user and not v.is_house;

  -- Logged without who it was: the point of deleting is that nothing identifying is kept.
  insert into public.audit_log (action, entity, details)
  values ('account.deleted', 'account', jsonb_build_object('orders_anonymised', cardinality(v_orders)));

  -- Cascades to the profile, addresses, saved numbers, bag, wishlist and reviews.
  delete from auth.users u where u.id = v_user;
  return jsonb_build_object('orders_anonymised', cardinality(v_orders));
end;
$function$;
