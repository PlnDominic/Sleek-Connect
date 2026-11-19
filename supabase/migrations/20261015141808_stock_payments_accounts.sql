-- Stock reservation (PRD FR-025), server-verified payments (FR-031/032) and account-saved bags (FR-020).

-- ---------------------------------------------------------------------------
-- Store settings
-- ---------------------------------------------------------------------------

create table public.store_settings (
  id boolean primary key default true check (id),
  -- How long stock is held for an unpaid order before it is released.
  reservation_minutes integer not null default 15 check (reservation_minutes between 1 and 240)
);

insert into public.store_settings default values;

alter table public.store_settings enable row level security;
create policy "Store settings are public" on public.store_settings for select to anon, authenticated using (true);
grant select on public.store_settings to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Inventory
-- ---------------------------------------------------------------------------

create table public.inventory_levels (
  product_id uuid not null references public.products (id) on delete cascade,
  -- product_sizes.code, or '' for products sold in one size.
  size_code text not null default '',
  on_hand integer not null default 0 check (on_hand >= 0),
  reserved integer not null default 0 check (reserved >= 0),
  in_stock boolean generated always as (on_hand - reserved > 0) stored,
  updated_at timestamptz not null default now(),
  primary key (product_id, size_code),
  constraint inventory_reserved_within_on_hand check (reserved <= on_hand)
);

comment on table public.inventory_levels is
  'Stock per sellable unit. A unit with no row cannot be sold. reserved = held by unpaid orders.';

create trigger inventory_levels_set_updated_at
  before update on public.inventory_levels
  for each row execute function public.set_updated_at();

alter table public.inventory_levels enable row level security;

create policy "Stock status of published products is public" on public.inventory_levels
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.is_published));

-- Shoppers may see whether something is in stock, not how many units there are.
revoke all on public.inventory_levels from anon, authenticated;
grant select (product_id, size_code, in_stock) on public.inventory_levels to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Orders: reservation and lookup
-- ---------------------------------------------------------------------------

alter table public.orders
  add column reservation_expires_at timestamptz,
  add column paid_at timestamptz,
  add column cancel_reason text,
  -- Unguessable token that lets the shopper who placed a guest order check its status.
  add column public_token uuid not null default gen_random_uuid(),
  -- Set when something needs staff attention, e.g. money received for an order that already expired.
  add column needs_review boolean not null default false;

create unique index orders_public_token_idx on public.orders (public_token);
create index orders_pending_expiry_idx on public.orders (reservation_expires_at) where status = 'pending_payment';

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------

create type public.payment_status as enum ('pending', 'succeeded', 'failed', 'expired');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  provider text not null,
  provider_reference text not null,
  amount_ghs numeric(10, 2) not null check (amount_ghs > 0),
  status public.payment_status not null default 'pending',
  last_event jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_reference)
);

create index payments_order_id_idx on public.payments (order_id);

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- Server-only: written by the payment functions below, read by staff in the dashboard.
alter table public.payments enable row level security;
revoke all on public.payments from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Stock helpers (not callable through the API)
-- ---------------------------------------------------------------------------

-- Releases an unpaid order's reserved stock and closes the order.
create function public.release_order_reservation(p_order_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.orders o
  set status = 'cancelled', cancel_reason = p_reason
  where o.id = p_order_id and o.status = 'pending_payment';
  if not found then
    return;
  end if;

  update public.inventory_levels i
  set reserved = i.reserved - held.quantity
  from (
    select oi.product_id, coalesce(oi.size_code, '') as size_code, sum(oi.quantity)::integer as quantity
    from public.order_items oi
    where oi.order_id = p_order_id and oi.product_id is not null
    group by oi.product_id, coalesce(oi.size_code, '')
  ) held
  where i.product_id = held.product_id and i.size_code = held.size_code;

  update public.payments p set status = 'expired' where p.order_id = p_order_id and p.status = 'pending';
end;
$$;

revoke all on function public.release_order_reservation(uuid, text) from public, anon, authenticated;

-- Cancels unpaid orders whose reservation has run out. Runs every minute (see cron schedule below).
create function public.expire_unpaid_orders()
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
    for update skip locked
  loop
    perform public.release_order_reservation(v_order_id, 'payment_timeout');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.expire_unpaid_orders() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- place_order: now reserves stock
-- ---------------------------------------------------------------------------

drop function public.place_order(jsonb, text, jsonb, jsonb, boolean);

-- p_customer: {"name", "phone", "area", "ghanapost_gps"?, "directions"?}
-- p_payment:  {"method": "momo"|"card", "network"?: "mtn"|"telecel"|"at", "wallet"?}
-- p_items:    [{"slug", "size"?, "quantity"}]
create function public.place_order(
  p_customer jsonb,
  p_delivery_option text,
  p_payment jsonb,
  p_items jsonb,
  p_is_gift boolean default false
)
returns table (
  order_number text,
  order_token uuid,
  subtotal_ghs numeric,
  delivery_fee_ghs numeric,
  total_ghs numeric,
  reserved_until timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := nullif(btrim(p_customer ->> 'name'), '');
  v_phone text := nullif(btrim(p_customer ->> 'phone'), '');
  v_area text := nullif(btrim(p_customer ->> 'area'), '');
  v_method text := p_payment ->> 'method';
  v_network text := nullif(p_payment ->> 'network', '');
  v_wallet text := nullif(btrim(p_payment ->> 'wallet'), '');
  v_fee numeric(10, 2);
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

  if not exists (select 1 from public.delivery_areas a where a.name = v_area and a.is_active) then
    raise exception 'We don''t deliver to that area yet.' using errcode = '22023';
  end if;

  select o.fee_ghs into v_fee from public.delivery_options o where o.id = p_delivery_option;
  if not found then
    raise exception 'Choose a delivery window.' using errcode = '22023';
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
    user_id, customer_name, phone, area, ghanapost_gps, rider_directions, delivery_option_id,
    is_gift, payment_method, momo_network, wallet_number, subtotal_ghs, reservation_expires_at
  )
  values (
    auth.uid(), v_name, v_phone, v_area,
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

  update public.orders o
  set subtotal_ghs = v_subtotal,
      delivery_fee_ghs = v_fee,
      total_ghs = case when v_fee is null then null else v_subtotal + v_fee end
  where o.id = v_order_id;

  return query
  select v_order_number, v_order_token, v_subtotal, v_fee,
         case when v_fee is null then null else v_subtotal + v_fee end, v_reserved_until;
end;
$$;

comment on function public.place_order(jsonb, text, jsonb, jsonb, boolean) is
  'Creates a pending_payment order and reserves its stock. Prices come from the catalogue, never from the caller.';

revoke all on function public.place_order(jsonb, text, jsonb, jsonb, boolean) from public;
grant execute on function public.place_order(jsonb, text, jsonb, jsonb, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Order status for the shopper who placed it
-- ---------------------------------------------------------------------------

create function public.get_order_status(p_order_token uuid)
returns table (
  order_number text,
  status public.order_status,
  payment_status public.payment_status,
  total_ghs numeric,
  reserved_until timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.order_number, o.status,
         (select p.status from public.payments p where p.order_id = o.id order by p.created_at desc limit 1),
         o.total_ghs, o.reservation_expires_at
  from public.orders o
  where o.public_token = p_order_token;
$$;

revoke all on function public.get_order_status(uuid) from public;
grant execute on function public.get_order_status(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Payment lifecycle (server-only: called with the secret key by the web app's payment code)
-- ---------------------------------------------------------------------------

-- Records that a payment request was sent to the provider for an order.
create function public.start_payment(p_order_token uuid, p_provider text, p_reference text)
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

revoke all on function public.start_payment(uuid, text, text) from public, anon, authenticated;

-- Applies a verified provider result. Safe to call more than once for the same payment.
create function public.confirm_payment(
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

  -- Final states are final: repeated or out-of-order notifications change nothing.
  if v_payment.status in ('succeeded', 'failed') then
    return query select v_order.order_number, v_order.status, v_payment.status;
    return;
  end if;

  update public.payments p
  set status = p_status::public.payment_status, last_event = p_event
  where p.id = v_payment.id;

  if p_status = 'failed' then
    perform public.release_order_reservation(v_order.id, 'payment_failed');
  elsif p_amount_ghs is distinct from v_payment.amount_ghs then
    -- Money arrived but not the amount we asked for: leave the order for staff to resolve.
    update public.orders o set needs_review = true where o.id = v_order.id;
  elsif v_order.status = 'pending_payment' then
    -- Turn the reservation into a sale.
    update public.inventory_levels i
    set on_hand = i.on_hand - held.quantity, reserved = i.reserved - held.quantity
    from (
      select oi.product_id, coalesce(oi.size_code, '') as size_code, sum(oi.quantity)::integer as quantity
      from public.order_items oi
      where oi.order_id = v_order.id and oi.product_id is not null
      group by oi.product_id, coalesce(oi.size_code, '')
    ) held
    where i.product_id = held.product_id and i.size_code = held.size_code;

    update public.orders o set status = 'paid', paid_at = now() where o.id = v_order.id;
  else
    -- Paid after the reservation expired (or the order was cancelled): needs a refund or manual re-instatement.
    update public.orders o set needs_review = true where o.id = v_order.id;
  end if;

  return query
  select o.order_number, o.status, p.status
  from public.orders o join public.payments p on p.order_id = o.id
  where p.id = v_payment.id;
end;
$$;

revoke all on function public.confirm_payment(text, text, text, numeric, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Release expired reservations every minute
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule('expire-unpaid-orders', '* * * * *', 'select public.expire_unpaid_orders()');

-- ---------------------------------------------------------------------------
-- Accounts: consent and saved bags
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  confirmed_adult_at timestamptz,
  accepted_terms_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per shopper account. Consent timestamps satisfy PRD FR-003.';

alter table public.profiles enable row level security;
create policy "Shoppers can read their own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
grant select on public.profiles to authenticated;

-- Records that the signed-in shopper confirmed they are 18+ and accepted the terms and privacy notice.
create function public.record_signup_consent()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  insert into public.profiles (id, confirmed_adult_at, accepted_terms_at)
  values (auth.uid(), now(), now())
  on conflict (id) do update
  set confirmed_adult_at = coalesce(public.profiles.confirmed_adult_at, excluded.confirmed_adult_at),
      accepted_terms_at = coalesce(public.profiles.accepted_terms_at, excluded.accepted_terms_at);
end;
$$;

revoke all on function public.record_signup_consent() from public, anon;
grant execute on function public.record_signup_consent() to authenticated;

create table public.bag_items (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  size_code text not null default '',
  quantity integer not null check (quantity between 1 and 20),
  updated_at timestamptz not null default now(),
  primary key (user_id, product_id, size_code)
);

create index bag_items_product_id_idx on public.bag_items (product_id);

alter table public.bag_items enable row level security;
create policy "Shoppers manage their own bag" on public.bag_items
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.bag_items from anon;
grant select, insert, update, delete on public.bag_items to authenticated;

-- The signed-in shopper's bag with current names and prices.
create function public.get_bag()
returns table (
  slug text,
  name text,
  size_code text,
  size_label text,
  unit_price_ghs numeric,
  image_key text,
  tint text,
  kind public.product_kind,
  quantity integer,
  in_stock boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.slug, p.name, nullif(b.size_code, ''), s.label, coalesce(s.price_ghs, p.price_ghs),
         p.image_key, p.tint, p.kind, b.quantity, coalesce(i.in_stock, false)
  from public.bag_items b
  join public.products p on p.id = b.product_id and p.is_published
  left join public.product_sizes s on s.product_id = b.product_id and s.code = b.size_code
  left join public.inventory_levels i on i.product_id = b.product_id and i.size_code = b.size_code
  where b.user_id = (select auth.uid())
  order by b.updated_at, p.name;
$$;

revoke all on function public.get_bag() from public, anon;
grant execute on function public.get_bag() to authenticated;

-- Replaces the signed-in shopper's bag. p_items: [{"slug", "size"?, "quantity"}]; unknown items are skipped.
create function public.set_bag(p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 50 then
    raise exception 'Invalid bag.' using errcode = '22023';
  end if;

  delete from public.bag_items b where b.user_id = auth.uid();

  insert into public.bag_items (user_id, product_id, size_code, quantity, updated_at)
  select auth.uid(), p.id, coalesce(item ->> 'size', ''), least(sum((item ->> 'quantity')::integer), 20),
         now() + make_interval(secs => (min(ord) / 1000.0)::double precision)
  from jsonb_array_elements(p_items) with ordinality as e(item, ord)
  join public.products p on p.slug = item ->> 'slug' and p.is_published
  where jsonb_typeof(item -> 'quantity') = 'number'
    and (item ->> 'quantity')::numeric = trunc((item ->> 'quantity')::numeric)
    and (item ->> 'quantity')::integer between 1 and 20
    and (
      (item ->> 'size' is null and not exists (select 1 from public.product_sizes s where s.product_id = p.id))
      or exists (select 1 from public.product_sizes s where s.product_id = p.id and s.code = item ->> 'size')
    )
  group by p.id, coalesce(item ->> 'size', '');
end;
$$;

revoke all on function public.set_bag(jsonb) from public, anon;
grant execute on function public.set_bag(jsonb) to authenticated;
