-- Push notifications for the mobile app. A phone registers its Expo push token (signed in, or just for one order it is
-- following); each order status change that already sends an SMS or email also queues a push for those devices.

alter type public.notification_channel add value if not exists 'push';

create table public.push_devices (
  token text primary key check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$'),
  user_id uuid references auth.users (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_devices_user_idx on public.push_devices (user_id) where user_id is not null;

-- Devices that follow one order without a sign-in, proved by knowing the order's private token.
create table public.push_device_orders (
  token text not null references public.push_devices (token) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  primary key (token, order_id)
);

create index push_device_orders_order_idx on public.push_device_orders (order_id);

-- No direct access: devices are registered and removed through the functions below.
alter table public.push_devices enable row level security;
alter table public.push_device_orders enable row level security;

create trigger push_devices_set_updated_at before update on public.push_devices
  for each row execute function public.set_updated_at();

-- Registers this phone for push messages. Signed in, it receives messages for all of the shopper's orders; with an
-- order token it receives messages for that order too. Registering again moves the phone to whoever is signed in now.
create function public.register_push_device(p_token text, p_platform text, p_order_token uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order uuid;
begin
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$' then
    raise exception 'That is not a valid push token.' using errcode = '22023';
  end if;
  if p_platform not in ('ios', 'android') then
    raise exception 'Unknown platform.' using errcode = '22023';
  end if;
  insert into public.push_devices (token, user_id, platform)
  values (p_token, auth.uid(), p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform;
  if p_order_token is not null then
    select o.id into v_order from public.orders o where o.public_token = p_order_token;
    if v_order is null then
      raise exception 'We could not find that order.' using errcode = '22023';
    end if;
    insert into public.push_device_orders (token, order_id) values (p_token, v_order) on conflict do nothing;
  end if;
end;
$$;

revoke all on function public.register_push_device(text, text, uuid) from public;
grant execute on function public.register_push_device(text, text, uuid) to anon, authenticated;

create function public.unregister_push_device(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_devices d where d.token = p_token;
$$;

revoke all on function public.unregister_push_device(text) from public;
grant execute on function public.unregister_push_device(text) to anon, authenticated;

-- Server side only: the push service said the phone no longer exists (app removed), so stop sending to it.
create function public.forget_push_device(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_devices d where d.token = p_token;
$$;

revoke all on function public.forget_push_device(text) from public, anon, authenticated;

create or replace function public.queue_order_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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

  select u.email into v_email from auth.users u where u.id = v_order.user_id;
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
$$;

create or replace function public.export_my_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
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
        'customer_name', o.customer_name, 'phone', o.phone, 'area', o.area, 'ghanapost_gps', o.ghanapost_gps,
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
$$;

create or replace function public.delete_my_account()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
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
  set user_id = null, customer_name = 'Deleted customer', phone = '', ghanapost_gps = null, rider_directions = null,
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
$$;
