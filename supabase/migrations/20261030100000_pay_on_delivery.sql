-- Pay on delivery (cash to the rider). No bank transfer.
-- ---------------------------------------------------------------------------
--  * A shopper can choose "Pay on delivery" at checkout. The order reserves stock like any other, but the hold lasts
--    store_settings.pay_on_delivery_hold_hours (default 24) instead of a few minutes, because a person has to confirm it.
--  * Staff confirm it (admin_confirm_cod_order, usually after a phone call): the reservation becomes a sale and the order
--    moves to "paid" (the to-pack queue). orders.paid_at stays empty: nothing has been paid yet.
--  * The rider collects the cash. admin_mark_delivered then needs "cash collected", records a payments row (provider
--    'cash', reference COD-<order number>), sets paid_at and cash_collected_ghs, so revenue is counted when the money is
--    in hand and a cancelled or failed pay-on-delivery order never shows a refund due.
--  * Limits: a switch and a maximum order total (admin settings), at most 3 unconfirmed orders per phone number, and no
--    items from independent stores (those are paid for online).

alter type public.payment_method add value if not exists 'cod';

alter table public.store_settings
  add column pay_on_delivery_enabled boolean not null default true,
  add column pay_on_delivery_hold_hours integer not null default 24 check (pay_on_delivery_hold_hours between 1 and 168),
  add column pay_on_delivery_max_ghs numeric(10, 2) check (pay_on_delivery_max_ghs is null or pay_on_delivery_max_ghs > 0);

alter table public.orders
  add column cod_confirmed_at timestamptz,
  add column cash_collected_ghs numeric(10, 2) check (cash_collected_ghs is null or cash_collected_ghs >= 0);

-- Staff read these (never delivery_code or public_token: they stay without a select grant).
grant select (cod_confirmed_at, cash_collected_ghs) on public.orders to authenticated;

-- Placing the order (pay on delivery accepted; stock held for the confirmation window).
create or replace function public.place_order(p_customer jsonb, p_delivery_option text, p_payment jsonb, p_items jsonb, p_is_gift boolean DEFAULT false)
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
    if v_method = 'cod' and exists (
      select 1 from public.vendors vd where vd.id = v_product.vendor_id and not vd.is_house
    ) then
      raise exception '% is sold by an independent store, which is paid for online. Choose Mobile Money.', v_product.name
        using errcode = '22023';
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

-- Customer messages: pay on delivery orders say so (see apps/web/src/lib/notifications/templates.ts).
create or replace function public.queue_order_notifications()
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
    when 'cancelled' then case when v_order.paid_at is not null or v_order.cod_confirmed_at is not null then 'order_cancelled' end
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
    'refund_due', v_order.refund_due,
    'pay_on_delivery', v_order.payment_method = 'cod'
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

-- A customer cancelling a confirmed pay-on-delivery order has paid nothing, so no refund is flagged.
create or replace function public.cancel_my_order(p_order_token uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_reason text := coalesce(nullif(btrim(left(p_reason, 300)), ''), 'Cancelled by the customer');
begin
  select * into v_order from public.orders o where o.public_token = p_order_token for update;
  if not found then
    raise exception 'We couldn''t find that order.' using errcode = '22023';
  end if;
  if v_order.status not in ('pending_payment', 'paid') then
    raise exception 'This order is already %, so it can''t be cancelled online. Contact us and we''ll help.',
      case v_order.status when 'cancelled' then 'cancelled' else 'being prepared or on its way' end
      using errcode = '22023';
  end if;

  perform public.set_order_event_context(v_reason, jsonb_build_object('by', 'customer'));
  if v_order.status = 'pending_payment' then
    perform public.release_order_reservation(v_order.id, 'cancelled_by_customer');
    return;
  end if;

  -- Paid but not packed: the units go straight back on sale and the payment is flagged for a refund.
  with sold as (
    select oi.product_id, coalesce(oi.size_code, '') as size_code, sum(oi.quantity)::integer as quantity
    from public.order_items oi where oi.order_id = v_order.id and oi.product_id is not null
    group by oi.product_id, coalesce(oi.size_code, '')
  ),
  restocked as (
    update public.inventory_levels i set on_hand = i.on_hand + sold.quantity
    from sold where i.product_id = sold.product_id and i.size_code = sold.size_code
    returning i.product_id, i.size_code, sold.quantity
  )
  insert into public.stock_movements (product_id, size_code, reason, quantity, sellable_change, order_id, note)
  select r.product_id, r.size_code, 'restocked', 0, r.quantity, v_order.id, 'Order cancelled by the customer'
  from restocked r;

  update public.orders o
  set status = 'cancelled', cancel_reason = v_reason, refund_due = o.paid_at is not null
  where o.id = v_order.id;
end;
$$;

-- Online payments can't be started for a pay-on-delivery order.
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

  insert into public.payments (order_id, provider, provider_reference, amount_ghs)
  values (v_order.id, p_provider, p_reference, v_order.total_ghs);
  return v_order.total_ghs;
end;
$$;

-- The order page: when staff confirmed it, and the delivery code from then on.
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
    'is_gift', o.is_gift,
    'payment_method', o.payment_method,
    'momo_network', o.momo_network,
    'wallet_ending', right(regexp_replace(coalesce(o.wallet_number, ''), '\D', '', 'g'), 3),
    'subtotal_ghs', o.subtotal_ghs,
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

-- Settings: the switch, the hold, and the largest order.
create or replace function public.admin_update_settings(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after jsonb;
begin
  perform public.require_staff(array['admin']::public.staff_role[]);
  select to_jsonb(s) into v_before from public.store_settings s;
  begin
    update public.store_settings s set
      reservation_minutes = coalesce((p ->> 'reservation_minutes')::integer, s.reservation_minutes),
      low_stock_threshold = coalesce((p ->> 'low_stock_threshold')::integer, s.low_stock_threshold),
      expiry_alert_days = coalesce((p ->> 'expiry_alert_days')::integer, s.expiry_alert_days),
      max_delivery_attempts = coalesce((p ->> 'max_delivery_attempts')::integer, s.max_delivery_attempts),
      require_delivery_code = coalesce((p ->> 'require_delivery_code')::boolean, s.require_delivery_code),
      return_window_days = coalesce((p ->> 'return_window_days')::integer, s.return_window_days),
      pay_on_delivery_enabled = coalesce((p ->> 'pay_on_delivery_enabled')::boolean, s.pay_on_delivery_enabled),
      pay_on_delivery_hold_hours = coalesce((p ->> 'pay_on_delivery_hold_hours')::integer, s.pay_on_delivery_hold_hours),
      pay_on_delivery_max_ghs = case when p ? 'pay_on_delivery_max_ghs'
        then nullif(btrim(p ->> 'pay_on_delivery_max_ghs'), '')::numeric else s.pay_on_delivery_max_ghs end,
      support_phone = case when p ? 'support_phone' then nullif(btrim(p ->> 'support_phone'), '') else s.support_phone end,
      support_whatsapp = case when p ? 'support_whatsapp' then nullif(btrim(p ->> 'support_whatsapp'), '') else s.support_whatsapp end,
      support_email = case when p ? 'support_email' then nullif(btrim(p ->> 'support_email'), '') else s.support_email end,
      support_hours = case when p ? 'support_hours' then nullif(btrim(p ->> 'support_hours'), '') else s.support_hours end,
      free_delivery_threshold_ghs = case when p ? 'free_delivery_threshold_ghs'
        then nullif(btrim(p ->> 'free_delivery_threshold_ghs'), '')::numeric else s.free_delivery_threshold_ghs end
    where s.id;
  exception
    when check_violation then
      raise exception 'One of the numbers is outside its allowed range.' using errcode = '22023';
    when invalid_text_representation then
      raise exception 'Numbers must be whole numbers.' using errcode = '22023';
  end;
  select to_jsonb(s) into v_after from public.store_settings s;
  perform public.audit('settings.changed', 'store_settings', null, jsonb_build_object('before', v_before, 'after', v_after));
end;
$$;

-- Staff confirm a pay-on-delivery order: the reserved stock becomes a sale and the order joins the to-pack queue.
create or replace function public.admin_confirm_cod_order(p_order_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  perform public.require_staff(array['operations']::public.staff_role[]);
  v_order := public.lock_order_for(p_order_id, array['pending_payment']::public.order_status[], 'confirmed');
  if v_order.payment_method <> 'cod' then
    raise exception 'Order % is paid for online, so it is confirmed when the payment arrives.', v_order.order_number
      using errcode = '22023';
  end if;
  if v_order.total_ghs is null then
    raise exception 'Delivery fees are not set, so the order total is unknown.' using errcode = '22023';
  end if;

  -- Turn the reservation into a sale, and log it in the stock ledger (as confirm_payment does).
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
  insert into public.stock_movements (product_id, size_code, reason, quantity, sellable_change, order_id, actor_id, actor_email, note)
  select sold.product_id, sold.size_code, 'sold', 0, -sold.quantity, v_order.id, auth.uid(), auth.jwt() ->> 'email',
         'Pay on delivery confirmed'
  from sold;

  perform public.set_order_event_context(p_note, jsonb_build_object('pay_on_delivery', true));
  update public.orders o
  set status = 'paid', cod_confirmed_at = now(), reservation_expires_at = null
  where o.id = p_order_id;
  perform public.audit('order.cod_confirmed', 'order', p_order_id::text,
    jsonb_build_object('note', nullif(btrim(p_note), ''), 'total_ghs', v_order.total_ghs));
end;
$$;

revoke all on function public.admin_confirm_cod_order(uuid, text) from public, anon;
grant execute on function public.admin_confirm_cod_order(uuid, text) to authenticated;

-- Delivery: closing a pay-on-delivery order records the cash. The old four-argument version is replaced, so a call with
-- four arguments can't be ambiguous.
drop function public.admin_mark_delivered(uuid, text, text, text);

create or replace function public.admin_mark_delivered(
  p_order_id uuid, p_recipient text, p_code text, p_note text default null, p_cash_collected boolean default false
)
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
  -- Pay on delivery: the rider must have collected the full amount before the order can be closed.
  if v_order.payment_method = 'cod' and v_order.paid_at is null and not coalesce(p_cash_collected, false) then
    raise exception 'Tick that you collected GH₵ % in cash.', trim(to_char(v_order.total_ghs, 'FM999999990.00'))
      using errcode = '22023';
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
    'code_checked', v_checked, 'cash_collected', v_order.payment_method = 'cod' and v_order.paid_at is null));
  if v_order.payment_method = 'cod' and v_order.paid_at is null then
    insert into public.payments (order_id, provider, provider_reference, amount_ghs, status, last_event)
    values (p_order_id, 'cash', 'COD-' || v_order.order_number, v_order.total_ghs, 'succeeded',
            jsonb_build_object('collected_by', auth.jwt() ->> 'email', 'recipient', btrim(p_recipient)))
    on conflict (provider, provider_reference) do nothing;
    update public.orders o
    set status = 'delivered', delivered_at = now(), delivered_to = btrim(p_recipient),
        paid_at = now(), cash_collected_ghs = v_order.total_ghs
    where o.id = p_order_id;
    perform public.audit('order.cash_collected', 'order', p_order_id::text,
      jsonb_build_object('amount_ghs', v_order.total_ghs, 'recipient', btrim(p_recipient)));
    return 'delivered';
  end if;
  update public.orders o set status = 'delivered', delivered_at = now(), delivered_to = btrim(p_recipient)
  where o.id = p_order_id;
  return 'delivered';
end;
$$;

revoke all on function public.admin_mark_delivered(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.admin_mark_delivered(uuid, text, text, text, boolean) to authenticated;
