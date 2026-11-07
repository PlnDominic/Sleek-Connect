-- Sleek Connect: catalogue, checkout configuration and orders.
--
-- Access model
--   * Catalogue and checkout-configuration tables are readable by everyone (anon + authenticated).
--     Nothing in them is writable through the Data API; manage them from the dashboard or with
--     the service role.
--   * Orders are only created through public.place_order(), which prices every line from the
--     database. Shoppers who are signed in can read their own orders; nobody else can.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.department as enum ('beauty', 'kids');
create type public.product_kind as enum ('bottle', 'jar', 'tube', 'garment', 'toy', 'gift');
create type public.kids_filter as enum ('bath', 'toys', 'clothing', 'gifts');
create type public.order_status as enum (
  'pending_payment', 'paid', 'packed', 'out_for_delivery', 'delivered', 'cancelled'
);
create type public.payment_method as enum ('momo', 'card');
create type public.momo_network as enum ('mtn', 'telecel', 'at');

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------

create table public.age_bands (
  id text primary key,
  label text not null,
  stage text not null,
  sort_order smallint not null
);

comment on table public.age_bands is
  'Child age bands used only as a shopping filter. No child data is stored (PRD FR-016).';

create table public.categories (
  id text primary key,
  name text not null,
  department public.department not null,
  image_key text,
  tint text not null,
  kind public.product_kind not null,
  sort_order smallint not null default 0
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  brand text,
  department public.department not null,
  category_id text references public.categories (id) on update cascade on delete set null,
  kids_filter public.kids_filter,
  collection text,
  price_ghs numeric(10, 2) not null check (price_ghs >= 0),
  was_price_ghs numeric(10, 2) check (was_price_ghs >= 0),
  badge text,
  tag text not null,
  summary text not null,
  image_key text,
  tint text not null,
  kind public.product_kind not null,
  -- Product-page content: description, highlights, freeFrom, recommendedAge, warnings, howToUse, gallery.
  details jsonb check (details is null or jsonb_typeof(details) = 'object'),
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_category_id_idx on public.products (category_id);

create table public.product_sizes (
  product_id uuid not null references public.products (id) on delete cascade,
  code text not null,
  label text not null,
  price_ghs numeric(10, 2) not null check (price_ghs >= 0),
  is_default boolean not null default false,
  sort_order smallint not null default 0,
  primary key (product_id, code)
);

create unique index product_sizes_one_default_idx on public.product_sizes (product_id) where is_default;

create table public.product_age_bands (
  product_id uuid not null references public.products (id) on delete cascade,
  age_band_id text not null references public.age_bands (id) on update cascade on delete cascade,
  primary key (product_id, age_band_id)
);

create index product_age_bands_age_band_id_idx on public.product_age_bands (age_band_id);

-- Ordered product lists shown on the storefront, e.g. 'home_new_arrivals' (PRD FR-010).
create table public.merchandising_slots (
  slot text not null,
  product_id uuid not null references public.products (id) on delete cascade,
  position smallint not null,
  primary key (slot, product_id)
);

create index merchandising_slots_product_id_idx on public.merchandising_slots (product_id);

-- ---------------------------------------------------------------------------
-- Checkout configuration
-- ---------------------------------------------------------------------------

create table public.delivery_areas (
  name text primary key,
  is_active boolean not null default true,
  sort_order smallint not null default 0
);

create table public.delivery_options (
  id text primary key,
  label text not null,
  -- NULL until the business sets the fee; orders then have no total yet.
  fee_ghs numeric(10, 2) check (fee_ghs >= 0),
  sort_order smallint not null default 0
);

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------

create sequence public.order_number_seq start 1001;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('SC-' || nextval('public.order_number_seq')),
  status public.order_status not null default 'pending_payment',
  user_id uuid references auth.users (id) on delete set null,
  customer_name text not null,
  phone text not null,
  area text not null references public.delivery_areas (name) on update cascade,
  ghanapost_gps text,
  rider_directions text,
  delivery_option_id text not null references public.delivery_options (id),
  is_gift boolean not null default false,
  payment_method public.payment_method not null,
  momo_network public.momo_network,
  wallet_number text,
  subtotal_ghs numeric(10, 2) not null check (subtotal_ghs >= 0),
  delivery_fee_ghs numeric(10, 2) check (delivery_fee_ghs >= 0),
  total_ghs numeric(10, 2) check (total_ghs >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_momo_details check (
    payment_method <> 'momo' or (momo_network is not null and wallet_number is not null)
  )
);

create index orders_user_id_idx on public.orders (user_id);
create index orders_area_idx on public.orders (area);
create index orders_delivery_option_id_idx on public.orders (delivery_option_id);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  -- Snapshot of what was bought, so the order stays correct if the catalogue changes.
  product_name text not null,
  size_code text,
  size_label text,
  unit_price_ghs numeric(10, 2) not null check (unit_price_ghs >= 0),
  quantity integer not null check (quantity between 1 and 20),
  line_total_ghs numeric(10, 2) not null check (line_total_ghs >= 0)
);

create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_product_id_idx on public.order_items (product_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.age_bands enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_sizes enable row level security;
alter table public.product_age_bands enable row level security;
alter table public.merchandising_slots enable row level security;
alter table public.delivery_areas enable row level security;
alter table public.delivery_options enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy "Age bands are public" on public.age_bands
  for select to anon, authenticated using (true);

create policy "Categories are public" on public.categories
  for select to anon, authenticated using (true);

create policy "Published products are public" on public.products
  for select to anon, authenticated using (is_published);

create policy "Sizes of published products are public" on public.product_sizes
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.is_published));

create policy "Age bands of published products are public" on public.product_age_bands
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.is_published));

create policy "Merchandising of published products is public" on public.merchandising_slots
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.is_published));

create policy "Active delivery areas are public" on public.delivery_areas
  for select to anon, authenticated using (is_active);

create policy "Delivery options are public" on public.delivery_options
  for select to anon, authenticated using (true);

create policy "Shoppers can read their own orders" on public.orders
  for select to authenticated using (user_id = (select auth.uid()));

create policy "Shoppers can read items of their own orders" on public.order_items
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())));

-- Explicit grants: read-only catalogue for the Data API; no direct access to orders for anon.
revoke all on public.orders, public.order_items from anon;
grant select on
  public.age_bands, public.categories, public.products, public.product_sizes, public.product_age_bands,
  public.merchandising_slots, public.delivery_areas, public.delivery_options
  to anon, authenticated;
grant select on public.orders, public.order_items to authenticated;

-- ---------------------------------------------------------------------------
-- place_order: the only way to create an order
-- ---------------------------------------------------------------------------

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
  subtotal_ghs numeric,
  delivery_fee_ghs numeric,
  total_ghs numeric
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
  v_subtotal numeric(10, 2) := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_size public.product_sizes%rowtype;
  v_has_sizes boolean;
  v_qty integer;
  v_unit numeric(10, 2);
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

  insert into public.orders (
    user_id, customer_name, phone, area, ghanapost_gps, rider_directions, delivery_option_id,
    is_gift, payment_method, momo_network, wallet_number, subtotal_ghs
  )
  values (
    auth.uid(), v_name, v_phone, v_area,
    left(nullif(btrim(p_customer ->> 'ghanapost_gps'), ''), 20),
    left(nullif(btrim(p_customer ->> 'directions'), ''), 300),
    p_delivery_option, coalesce(p_is_gift, false), v_method::public.payment_method,
    v_network::public.momo_network, v_wallet, 0
  )
  returning id, orders.order_number into v_order_id, v_order_number;

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
  select v_order_number, v_subtotal, v_fee, case when v_fee is null then null else v_subtotal + v_fee end;
end;
$$;

comment on function public.place_order(jsonb, text, jsonb, jsonb, boolean) is
  'Creates a pending_payment order. Prices come from the catalogue, never from the caller.';

revoke all on function public.place_order(jsonb, text, jsonb, jsonb, boolean) from public;
grant execute on function public.place_order(jsonb, text, jsonb, jsonb, boolean) to anon, authenticated;
