-- Marketplace: vendors run their own storefronts on Sleek Connect.
--
--  * A vendor applies, the owner approves, and the vendor pays a yearly subscription before the storefront opens.
--  * Vendors enter their own products and prices. The owner reviews each product and sets a markup; the shopper sees
--    the vendor's price plus the markup (products.price_ghs), so everything that already reads price_ghs keeps working.
--  * Sleek Connect's own range belongs to a built-in "house" vendor and behaves exactly as before.
--  * products.is_published stays the single visibility flag. For vendor products it is computed by a trigger:
--    the vendor asked to publish AND the owner approved the product AND the vendor's store is live (approved and paid).
--  * Ordering from vendor stores stays closed (store_settings.marketplace_orders_open) until order splitting,
--    fulfilment and payouts are switched on, so no shopper can pay for something nobody has agreed to ship.

create type public.vendor_status as enum ('pending', 'active', 'suspended', 'rejected');
create type public.product_review_status as enum ('draft', 'pending', 'approved', 'rejected');

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

alter table public.store_settings
  add column vendor_annual_fee_ghs numeric(10, 2) not null default 300 check (vendor_annual_fee_ghs >= 0),
  add column vendor_grace_days integer not null default 7 check (vendor_grace_days between 0 and 60),
  add column default_markup_percent numeric(5, 2) not null default 10 check (default_markup_percent between 0 and 200),
  add column vendor_payment_instructions text check (vendor_payment_instructions is null or length(vendor_payment_instructions) <= 1000),
  add column marketplace_orders_open boolean not null default false;

-- ---------------------------------------------------------------------------
-- Vendors
-- ---------------------------------------------------------------------------

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid unique references auth.users (id) on delete set null,
  is_house boolean not null default false,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 40),
  name text not null check (length(btrim(name)) between 2 and 60),
  tagline text check (tagline is null or length(tagline) <= 120),
  description text check (description is null or length(description) <= 2000),
  -- Paths in the public vendor-assets bucket: <vendor id>/<file>
  logo_path text,
  banner_path text,
  status public.vendor_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index vendors_one_house on public.vendors (is_house) where is_house;

-- Contact details and the owner's notes: visible to the vendor and the owner only, never public.
create table public.vendor_private (
  vendor_id uuid primary key references public.vendors (id) on delete cascade,
  phone text check (phone is null or length(phone) <= 30),
  email text check (email is null or length(email) <= 200),
  review_note text check (review_note is null or length(review_note) <= 1000),
  terms_accepted_at timestamptz
);

-- One row per paid year. The store is open while a period covers today (plus the grace days).
create table public.vendor_subscriptions (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  amount_ghs numeric(10, 2) not null check (amount_ghs >= 0),
  method text not null default 'manual' check (method in ('manual', 'momo', 'card', 'bank')),
  reference text check (reference is null or length(reference) <= 100),
  note text check (note is null or length(note) <= 500),
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create index vendor_subscriptions_vendor_idx on public.vendor_subscriptions (vendor_id, ends_on desc);

create trigger vendors_set_updated_at before update on public.vendors
  for each row execute function public.set_updated_at();

-- The built-in vendor that owns the existing catalogue.
insert into public.vendors (is_house, slug, name, tagline, status)
values (true, 'sleek-connect', 'Sleek Connect', 'Our own range, checked and shipped by us', 'active');

create function public.house_vendor_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select v.id from public.vendors v where v.is_house;
$$;

-- Approved by the owner and inside a paid period (or its grace days). The house vendor is always live.
create function public.vendor_is_live(p_vendor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.vendors v
    where v.id = p_vendor_id and v.status = 'active'
      and (
        v.is_house
        or exists (
          select 1 from public.vendor_subscriptions s
          where s.vendor_id = v.id and s.starts_on <= current_date
            and s.ends_on + (select st.vendor_grace_days from public.store_settings st) >= current_date
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Products: owner, review state and markup
-- ---------------------------------------------------------------------------

alter table public.products
  add column vendor_id uuid references public.vendors (id),
  add column review_status public.product_review_status not null default 'approved',
  add column publish_requested boolean not null default true,
  add column vendor_price_ghs numeric(10, 2) check (vendor_price_ghs is null or vendor_price_ghs >= 0),
  add column vendor_was_price_ghs numeric(10, 2) check (vendor_was_price_ghs is null or vendor_was_price_ghs >= 0),
  add column markup_percent numeric(5, 2) not null default 0 check (markup_percent between 0 and 200),
  add column review_note text check (review_note is null or length(review_note) <= 500);

update public.products set vendor_id = public.house_vendor_id();
alter table public.products alter column vendor_id set not null;
alter table public.products alter column vendor_id set default public.house_vendor_id();
create index products_vendor_idx on public.products (vendor_id);
create index products_review_idx on public.products (review_status) where review_status <> 'approved';

alter table public.product_sizes
  add column vendor_price_ghs numeric(10, 2) check (vendor_price_ghs is null or vendor_price_ghs >= 0);

-- Price = vendor price + markup, visibility = asked + approved + store live. Only for vendor (non-house) products.
create function public.products_marketplace_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.vendors v where v.id = new.vendor_id and v.is_house) then
    return new;
  end if;
  if new.vendor_price_ghs is null then
    raise exception 'A vendor product needs the vendor''s price.' using errcode = '22023';
  end if;
  new.price_ghs := round(new.vendor_price_ghs * (1 + new.markup_percent / 100), 2);
  new.was_price_ghs := case
    when new.vendor_was_price_ghs is null then null
    else round(new.vendor_was_price_ghs * (1 + new.markup_percent / 100), 2)
  end;
  new.is_published := new.publish_requested and new.review_status = 'approved' and public.vendor_is_live(new.vendor_id);
  return new;
end;
$$;

create trigger products_marketplace_rules before insert or update on public.products
  for each row execute function public.products_marketplace_rules();

-- When the markup changes, size prices follow.
create function public.product_sizes_marketplace_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_markup numeric;
begin
  select p.markup_percent into v_markup
  from public.products p
  join public.vendors v on v.id = p.vendor_id and not v.is_house
  where p.id = new.product_id;
  if found then
    if new.vendor_price_ghs is null then
      raise exception 'Every size needs the vendor''s price.' using errcode = '22023';
    end if;
    new.price_ghs := round(new.vendor_price_ghs * (1 + v_markup / 100), 2);
  end if;
  return new;
end;
$$;

create trigger product_sizes_marketplace_price before insert or update on public.product_sizes
  for each row execute function public.product_sizes_marketplace_price();

create function public.products_markup_resize()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.product_sizes s set vendor_price_ghs = s.vendor_price_ghs where s.product_id = new.id;
  return null;
end;
$$;

create trigger products_markup_resize after update of markup_percent on public.products
  for each row when (old.markup_percent is distinct from new.markup_percent)
  execute function public.products_markup_resize();

-- Re-evaluates visibility for one vendor's products (or everyone's when null). Only touches rows that change.
create function public.refresh_vendor_products(p_vendor_id uuid default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.products p set publish_requested = p.publish_requested
  where (p_vendor_id is null or p.vendor_id = p_vendor_id)
    and not exists (select 1 from public.vendors v where v.id = p.vendor_id and v.is_house)
    and p.is_published is distinct from (p.publish_requested and p.review_status = 'approved' and public.vendor_is_live(p.vendor_id));
$$;

revoke all on function public.refresh_vendor_products(uuid) from public, anon, authenticated;

create function public.vendors_refresh_products()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refresh_vendor_products(new.id);
  return null;
end;
$$;

create function public.vendor_subscriptions_refresh_products()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refresh_vendor_products(case when tg_op = 'DELETE' then old.vendor_id else new.vendor_id end);
  return null;
end;
$$;

create trigger vendors_refresh_products after insert or update of status on public.vendors
  for each row execute function public.vendors_refresh_products();
create trigger vendor_subscriptions_refresh_products after insert or update or delete on public.vendor_subscriptions
  for each row execute function public.vendor_subscriptions_refresh_products();

-- Subscriptions run out on their own, so check every night.
select cron.schedule('refresh-vendor-products', '10 0 * * *', 'select public.refresh_vendor_products(null)');

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.vendors enable row level security;
alter table public.vendor_private enable row level security;
alter table public.vendor_subscriptions enable row level security;

create policy "Live stores are public" on public.vendors
  for select to anon, authenticated using (public.vendor_is_live(id));
create policy "Staff can read all vendors" on public.vendors
  for select to authenticated using ((select public.current_staff_role()) = 'admin');
create policy "Vendors can read their own store" on public.vendors
  for select to authenticated using (owner_id = (select auth.uid()));

create policy "Vendors can read their own private details" on public.vendor_private
  for select to authenticated using (exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = (select auth.uid())));

create policy "Vendors can read their own subscription" on public.vendor_subscriptions
  for select to authenticated using (exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = (select auth.uid())));
create policy "Admins can read subscriptions" on public.vendor_subscriptions
  for select to authenticated using ((select public.current_staff_role()) = 'admin');

-- No owner_id in the public columns: who runs a store is not public.
grant select (id, is_house, slug, name, tagline, description, logo_path, banner_path, status, created_at) on public.vendors
  to anon, authenticated;
grant select on public.vendor_private, public.vendor_subscriptions to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: a public bucket for logos and banners; vendors write under their own folder once their store is live.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vendor-assets', 'vendor-assets', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- The vendor whose store the caller runs, if it is live (approved and paid).
create function public.my_live_vendor_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select v.id from public.vendors v
  where v.owner_id = auth.uid() and not v.is_house and public.vendor_is_live(v.id);
$$;

revoke all on function public.my_live_vendor_id() from public, anon;
grant execute on function public.my_live_vendor_id() to authenticated;

create policy "Vendors upload store images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'vendor-assets' and split_part(name, '/', 1) = (select public.my_live_vendor_id())::text);
create policy "Vendors list store images" on storage.objects
  for select to authenticated
  using (bucket_id = 'vendor-assets' and split_part(name, '/', 1) = (select public.my_live_vendor_id())::text);
create policy "Vendors remove store images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'vendor-assets' and split_part(name, '/', 1) = (select public.my_live_vendor_id())::text);

-- Vendors upload product photos under their own product ids in product-images.
create function public.my_product_folder_ok(p_folder text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.products p
    where p.id::text = p_folder and p.vendor_id = public.my_live_vendor_id()
  );
$$;

revoke all on function public.my_product_folder_ok(text) from public, anon;
grant execute on function public.my_product_folder_ok(text) to authenticated;

create policy "Vendors upload their product photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and (select public.my_product_folder_ok(split_part(name, '/', 1))));
create policy "Vendors list their product photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'product-images' and (select public.my_product_folder_ok(split_part(name, '/', 1))));
create policy "Vendors remove their product photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and (select public.my_product_folder_ok(split_part(name, '/', 1))));

-- ---------------------------------------------------------------------------
-- Order lines remember who sold them and how the price splits (filled by trigger; place_order is unchanged).
-- ---------------------------------------------------------------------------

alter table public.order_items
  add column vendor_id uuid references public.vendors (id),
  add column vendor_unit_price_ghs numeric(10, 2),
  add column markup_unit_ghs numeric(10, 2);

create function public.order_items_marketplace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vendor uuid;
  v_is_house boolean;
  v_markup numeric;
  v_open boolean;
  v_base numeric;
begin
  select p.vendor_id, v.is_house, p.markup_percent into v_vendor, v_is_house, v_markup
  from public.products p join public.vendors v on v.id = p.vendor_id
  where p.id = new.product_id;

  new.vendor_id := v_vendor;
  if v_is_house then
    return new;
  end if;

  select st.marketplace_orders_open into v_open from public.store_settings st;
  if not v_open then
    raise exception 'Ordering from vendor stores opens soon.' using errcode = '22023';
  end if;

  -- What the vendor is owed per unit: the vendor's own price for this size.
  select coalesce(s.vendor_price_ghs, p.vendor_price_ghs) into v_base
  from public.products p
  left join public.product_sizes s on s.product_id = p.id and s.code = new.size_code
  where p.id = new.product_id;
  new.vendor_unit_price_ghs := v_base;
  new.markup_unit_ghs := new.unit_price_ghs - v_base;
  return new;
end;
$$;

create trigger order_items_marketplace before insert on public.order_items
  for each row execute function public.order_items_marketplace();

-- ---------------------------------------------------------------------------
-- Vendor functions (the signed-in vendor, never anyone else's store)
-- ---------------------------------------------------------------------------

-- The caller's own vendor row, or an error when they have none.
create function public.vendor_require_own()
returns public.vendors
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.vendors%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;
  select * into v from public.vendors x where x.owner_id = auth.uid() and not x.is_house;
  if not found then
    raise exception 'You don''t have a vendor application yet.' using errcode = '42501';
  end if;
  return v;
end;
$$;

revoke all on function public.vendor_require_own() from public, anon, authenticated;

-- The caller's own vendor row, which must be live (approved and paid).
create function public.vendor_require_live()
returns public.vendors
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.vendors := public.vendor_require_own();
begin
  if v.status <> 'active' then
    raise exception 'Your store is not approved yet.' using errcode = '42501';
  end if;
  if not public.vendor_is_live(v.id) then
    raise exception 'Your subscription has ended. Renew it to keep editing your store.' using errcode = '42501';
  end if;
  return v;
end;
$$;

revoke all on function public.vendor_require_live() from public, anon, authenticated;

create function public.vendor_slugify(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(regexp_replace(regexp_replace(lower(btrim(coalesce(p_text, ''))), '[''’]', '', 'g'), '[^a-z0-9]+', '-', 'g'), '-+', '-', 'g'), '-');
$$;

-- Applies to open a store. Starts as pending until the owner approves it.
create function public.vendor_apply(p_name text, p_phone text, p_tagline text default null, p_accept_terms boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
  v_name text := btrim(coalesce(p_name, ''));
  v_base text;
  v_slug text;
  v_try integer := 1;
  v_id uuid;
begin
  if v_user is null or v_email is null then
    raise exception 'Sign in to apply for a store.' using errcode = '42501';
  end if;
  if public.current_staff_role() is not null then
    raise exception 'Staff accounts can''t open vendor stores. Use another email address.' using errcode = '42501';
  end if;
  if exists (select 1 from public.vendors v where v.owner_id = v_user) then
    raise exception 'You have already applied.' using errcode = '22023';
  end if;
  if length(v_name) < 2 or length(v_name) > 60 then
    raise exception 'Enter your store name (2 to 60 characters).' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_phone, ''))) < 7 then
    raise exception 'Enter a phone number we can reach you on.' using errcode = '22023';
  end if;
  if not coalesce(p_accept_terms, false) then
    raise exception 'Accept the vendor terms to continue.' using errcode = '22023';
  end if;

  v_base := left(public.vendor_slugify(v_name), 34);
  if length(v_base) < 3 then
    v_base := 'store-' || v_base;
  end if;
  v_slug := v_base;
  while exists (select 1 from public.vendors v where v.slug = v_slug) loop
    v_try := v_try + 1;
    v_slug := v_base || '-' || v_try;
  end loop;

  insert into public.vendors (owner_id, slug, name, tagline)
  values (v_user, v_slug, v_name, nullif(btrim(p_tagline), ''))
  returning id into v_id;
  insert into public.vendor_private (vendor_id, phone, email, terms_accepted_at)
  values (v_id, btrim(p_phone), v_email, now());
  perform public.audit('vendor.applied', 'vendor', v_id::text, jsonb_build_object('slug', v_slug));
  return v_id;
end;
$$;

revoke all on function public.vendor_apply(text, text, text, boolean) from public, anon;
grant execute on function public.vendor_apply(text, text, text, boolean) to authenticated;

-- The signed-in user's store and subscription, or null when they have not applied.
create function public.vendor_me()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.vendors%rowtype;
  s public.store_settings%rowtype;
  v_paid_until date;
  v_next_start date;
begin
  if auth.uid() is null then
    return null;
  end if;
  select * into v from public.vendors x where x.owner_id = auth.uid() and not x.is_house;
  if not found then
    return null;
  end if;
  select * into s from public.store_settings;
  select max(sub.ends_on) into v_paid_until from public.vendor_subscriptions sub where sub.vendor_id = v.id;
  return jsonb_build_object(
    'id', v.id,
    'slug', v.slug,
    'name', v.name,
    'tagline', v.tagline,
    'description', v.description,
    'logo_path', v.logo_path,
    'banner_path', v.banner_path,
    'status', v.status,
    'live', public.vendor_is_live(v.id),
    'paid_until', v_paid_until,
    'grace_days', s.vendor_grace_days,
    'annual_fee_ghs', s.vendor_annual_fee_ghs,
    'payment_instructions', s.vendor_payment_instructions,
    'phone', (select p.phone from public.vendor_private p where p.vendor_id = v.id),
    'email', (select p.email from public.vendor_private p where p.vendor_id = v.id),
    'review_note', (select p.review_note from public.vendor_private p where p.vendor_id = v.id)
  );
end;
$$;

revoke all on function public.vendor_me() from public, anon;
grant execute on function public.vendor_me() to authenticated;

-- Edits the store page. p: name, tagline, description, logo_path, banner_path, phone.
create function public.vendor_update_store(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vendors := public.vendor_require_live();
  v_name text := btrim(coalesce(p ->> 'name', v.name));
  v_logo text := coalesce(nullif(p ->> 'logo_path', ''), case when p ? 'logo_path' then null else v.logo_path end);
  v_banner text := coalesce(nullif(p ->> 'banner_path', ''), case when p ? 'banner_path' then null else v.banner_path end);
begin
  if length(v_name) < 2 or length(v_name) > 60 then
    raise exception 'Enter your store name (2 to 60 characters).' using errcode = '22023';
  end if;
  if v_logo is not null and split_part(v_logo, '/', 1) <> v.id::text then
    raise exception 'That logo isn''t yours.' using errcode = '22023';
  end if;
  if v_banner is not null and split_part(v_banner, '/', 1) <> v.id::text then
    raise exception 'That banner isn''t yours.' using errcode = '22023';
  end if;
  update public.vendors x set
    name = v_name,
    tagline = case when p ? 'tagline' then nullif(btrim(left(p ->> 'tagline', 120)), '') else x.tagline end,
    description = case when p ? 'description' then nullif(btrim(left(p ->> 'description', 2000)), '') else x.description end,
    logo_path = v_logo,
    banner_path = v_banner
  where x.id = v.id;
  if p ? 'phone' then
    update public.vendor_private pr set phone = nullif(btrim(left(p ->> 'phone', 30)), '') where pr.vendor_id = v.id;
  end if;
  perform public.audit('vendor.store_updated', 'vendor', v.id::text, null);
end;
$$;

revoke all on function public.vendor_update_store(jsonb) from public, anon;
grant execute on function public.vendor_update_store(jsonb) to authenticated;

-- Creates or edits one of the vendor's products. The owner reviews it before it goes on sale and sets the markup.
-- p: id?, name, brand, department, kind, kids_filter, category_id, price_ghs, was_price_ghs, sizes[{code,label,price_ghs,
-- is_default}], age_bands, description, highlights, free_from, recommended_age, warnings, how_to_use, ingredients,
-- country_of_origin, regulatory_reference, period_after_opening, skin_types, shades, warning_label, returnable,
-- return_note, publish.
create function public.vendor_save_product(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vendors := public.vendor_require_live();
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_before public.products%rowtype;
  v_name text := btrim(coalesce(p ->> 'name', ''));
  v_slug text;
  v_department public.department;
  v_kind public.product_kind;
  v_kids_filter public.kids_filter;
  v_price numeric;
  v_was numeric;
  v_sizes jsonb := coalesce(p -> 'sizes', '[]'::jsonb);
  v_bands jsonb := coalesce(p -> 'age_bands', '[]'::jsonb);
  v_codes text[];
  v_default_price numeric;
  v_default_ord bigint := 0;
  v_code text;
  v_details jsonb;
  v_problems text[];
  v_publish boolean := coalesce((p ->> 'publish')::boolean, false);
  v_review public.product_review_status;
  v_skin_types text[] := array(select btrim(x) from jsonb_array_elements_text(
    case when jsonb_typeof(p -> 'skin_types') = 'array' then p -> 'skin_types' else '[]'::jsonb end) x where btrim(x) <> '');
  v_shades text[] := array(select btrim(x) from jsonb_array_elements_text(
    case when jsonb_typeof(p -> 'shades') = 'array' then p -> 'shades' else '[]'::jsonb end) x where btrim(x) <> '');
  v_resubmit boolean := false;
begin
  if v_name = '' or length(v_name) > 120 then
    raise exception 'Enter a product name (up to 120 characters).' using errcode = '22023';
  end if;
  if v_id is not null then
    select * into v_before from public.products x where x.id = v_id and x.vendor_id = v.id for update;
    if not found then
      raise exception 'That product isn''t in your store.' using errcode = '42501';
    end if;
  end if;

  -- The web address is made from the name and kept once it exists, so shoppers' links keep working.
  if v_before.id is not null then
    v_slug := v_before.slug;
  else
    v_slug := left(public.vendor_slugify(v.slug || '-' || v_name), 70);
    if v_slug = '' then
      raise exception 'Enter a product name.' using errcode = '22023';
    end if;
    if exists (select 1 from public.products x where x.slug = v_slug) then
      v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
    end if;
  end if;

  begin
    v_department := (p ->> 'department')::public.department;
    v_kind := (p ->> 'kind')::public.product_kind;
    v_kids_filter := nullif(p ->> 'kids_filter', '')::public.kids_filter;
  exception when invalid_text_representation then
    raise exception 'Choose a department, product type and kids filter from the lists.' using errcode = '22023';
  end;
  if v_department is null or v_kind is null then
    raise exception 'Choose a department and product type.' using errcode = '22023';
  end if;
  if v_department = 'beauty' then
    v_kids_filter := null;
  end if;
  if nullif(p ->> 'category_id', '') is not null
     and not exists (select 1 from public.categories c where c.id = p ->> 'category_id') then
    raise exception 'Choose a category from the list.' using errcode = '22023';
  end if;

  begin
    v_price := nullif(btrim(p ->> 'price_ghs'), '')::numeric;
    v_was := nullif(btrim(p ->> 'was_price_ghs'), '')::numeric;
  exception when invalid_text_representation then
    raise exception 'Prices must be numbers.' using errcode = '22023';
  end;

  if jsonb_typeof(v_sizes) <> 'array' or jsonb_typeof(v_bands) <> 'array' then
    raise exception 'Invalid sizes or age bands.' using errcode = '22023';
  end if;
  select array_agg(lower(btrim(s ->> 'code'))) into v_codes from jsonb_array_elements(v_sizes) s;
  if v_codes is not null then
    if exists (select 1 from unnest(v_codes) c where c = '' or c !~ '^[a-z0-9][a-z0-9-]*$') then
      raise exception 'Size codes may use lowercase letters, numbers and dashes only.' using errcode = '22023';
    end if;
    if (select count(distinct c) from unnest(v_codes) c) <> cardinality(v_codes) then
      raise exception 'Each size needs its own code.' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(v_sizes) s where coalesce(btrim(s ->> 'label'), '') = '') then
      raise exception 'Give every size a label, e.g. "200 ml".' using errcode = '22023';
    end if;
    begin
      if exists (select 1 from jsonb_array_elements(v_sizes) s where (s ->> 'price_ghs')::numeric < 0) then
        raise exception 'Prices can''t be negative.' using errcode = '22023';
      end if;
      select (s ->> 'price_ghs')::numeric, ord into v_default_price, v_default_ord
      from jsonb_array_elements(v_sizes) with ordinality as e(s, ord)
      order by coalesce((s ->> 'is_default')::boolean, false) desc, ord
      limit 1;
    exception when invalid_text_representation then
      raise exception 'Size prices must be numbers.' using errcode = '22023';
    end;
    v_price := v_default_price;
  end if;
  if v_price is null or v_price < 0 then
    raise exception 'Enter a price.' using errcode = '22023';
  end if;
  if v_was is not null and v_was <= v_price then
    raise exception 'The "was" price must be higher than the price.' using errcode = '22023';
  end if;

  v_details := jsonb_strip_nulls(jsonb_build_object(
    'description', nullif(btrim(p ->> 'description'), ''),
    'highlights', case when jsonb_typeof(p -> 'highlights') = 'array' and jsonb_array_length(p -> 'highlights') > 0
                       then p -> 'highlights' end,
    'freeFrom', case when jsonb_typeof(p -> 'free_from') = 'array' and jsonb_array_length(p -> 'free_from') > 0
                     then p -> 'free_from' end,
    'recommendedAge', nullif(btrim(p ->> 'recommended_age'), ''),
    'warnings', nullif(btrim(p ->> 'warnings'), ''),
    'howToUse', nullif(btrim(p ->> 'how_to_use'), '')
  ));

  if v_id is null then
    insert into public.products (
      vendor_id, review_status, publish_requested, vendor_price_ghs, vendor_was_price_ghs, markup_percent,
      slug, name, brand, department, category_id, kids_filter, collection, price_ghs, was_price_ghs, badge, tag,
      summary, image_key, tint, kind, details, ingredients, country_of_origin, regulatory_reference,
      period_after_opening, skin_types, shades, warning_label, returnable, return_note, is_published
    ) values (
      v.id, 'pending', v_publish, v_price, v_was,
      (select st.default_markup_percent from public.store_settings st),
      v_slug, v_name, nullif(btrim(p ->> 'brand'), ''), v_department, nullif(p ->> 'category_id', ''), v_kids_filter,
      null, v_price, v_was, null, '',
      coalesce(btrim(p ->> 'summary'), ''), null,
      case when v_department = 'beauty' then '#F4E3D7' else '#E3F0EC' end,
      v_kind, v_details, nullif(btrim(p ->> 'ingredients'), ''), nullif(btrim(p ->> 'country_of_origin'), ''),
      nullif(btrim(p ->> 'regulatory_reference'), ''), nullif(btrim(p ->> 'period_after_opening'), ''),
      v_skin_types, v_shades, nullif(btrim(p ->> 'warning_label'), ''), coalesce((p ->> 'returnable')::boolean, true),
      nullif(btrim(p ->> 'return_note'), ''), false
    )
    returning id into v_id;
    perform public.audit('vendor.product_created', 'product', v_id::text, jsonb_build_object('vendor', v.slug));
  else
    -- Changing what the product is sends it back for another look; changing prices or stock does not.
    v_resubmit := v_before.name is distinct from v_name
      or v_before.brand is distinct from nullif(btrim(p ->> 'brand'), '')
      or v_before.department is distinct from v_department
      or v_before.kind is distinct from v_kind
      or v_before.category_id is distinct from nullif(p ->> 'category_id', '')
      or v_before.summary is distinct from coalesce(btrim(p ->> 'summary'), '')
      or (v_before.details ->> 'description') is distinct from (v_details ->> 'description')
      or v_before.ingredients is distinct from nullif(btrim(p ->> 'ingredients'), '');
    v_review := case when v_resubmit then 'pending' else v_before.review_status end;
    update public.products x set
      name = v_name, brand = nullif(btrim(p ->> 'brand'), ''), department = v_department,
      category_id = nullif(p ->> 'category_id', ''), kids_filter = v_kids_filter,
      vendor_price_ghs = v_price, vendor_was_price_ghs = v_was,
      summary = coalesce(btrim(p ->> 'summary'), ''), kind = v_kind,
      details = (coalesce(x.details, '{}'::jsonb) - array['description', 'highlights', 'freeFrom', 'recommendedAge',
                 'warnings', 'howToUse']) || v_details,
      ingredients = nullif(btrim(p ->> 'ingredients'), ''),
      country_of_origin = nullif(btrim(p ->> 'country_of_origin'), ''),
      regulatory_reference = nullif(btrim(p ->> 'regulatory_reference'), ''),
      period_after_opening = nullif(btrim(p ->> 'period_after_opening'), ''),
      skin_types = v_skin_types, shades = v_shades,
      warning_label = nullif(btrim(p ->> 'warning_label'), ''),
      returnable = coalesce((p ->> 'returnable')::boolean, true),
      return_note = nullif(btrim(p ->> 'return_note'), ''),
      publish_requested = v_publish,
      review_status = v_review,
      review_note = case when v_resubmit then null else x.review_note end
    where x.id = v_id;
    perform public.audit('vendor.product_updated', 'product', v_id::text,
      jsonb_build_object('vendor', v.slug, 'resubmitted', v_resubmit));
  end if;

  delete from public.product_sizes s where s.product_id = v_id;
  insert into public.product_sizes (product_id, code, label, price_ghs, vendor_price_ghs, is_default, sort_order)
  select v_id, lower(btrim(s ->> 'code')), btrim(s ->> 'label'), (s ->> 'price_ghs')::numeric,
         (s ->> 'price_ghs')::numeric, ord = v_default_ord, (ord - 1)::smallint
  from jsonb_array_elements(v_sizes) with ordinality as e(s, ord);

  v_codes := coalesce(v_codes, array['']);
  foreach v_code in array v_codes loop
    insert into public.inventory_levels (product_id, size_code) values (v_id, v_code) on conflict do nothing;
  end loop;
  for v_code in
    select i.size_code from public.inventory_levels i where i.product_id = v_id and i.size_code <> all (v_codes)
  loop
    if exists (select 1 from public.inventory_levels i where i.product_id = v_id and i.size_code = v_code
                 and (i.on_hand <> 0 or i.reserved <> 0)) then
      raise exception 'Size "%" still has stock. Set its stock to 0 and wait for open orders before removing the size.',
        coalesce(nullif(v_code, ''), 'one size') using errcode = '22023';
    end if;
    delete from public.inventory_levels i where i.product_id = v_id and i.size_code = v_code;
  end loop;

  delete from public.product_age_bands b where b.product_id = v_id;
  insert into public.product_age_bands (product_id, age_band_id)
  select v_id, band from jsonb_array_elements_text(v_bands) band
  where exists (select 1 from public.age_bands a where a.id = band)
  on conflict do nothing;

  v_problems := public.product_publish_problems(v_id);
  return jsonb_build_object('id', v_id, 'slug', v_slug, 'problems', to_jsonb(v_problems));
end;
$$;

revoke all on function public.vendor_save_product(jsonb) from public, anon;
grant execute on function public.vendor_save_product(jsonb) to authenticated;

-- Sets how many units the vendor has of one size. Reserved units (open orders) stay reserved.
create function public.vendor_set_stock(p_product_id uuid, p_size_code text, p_quantity integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vendors := public.vendor_require_live();
  v_level public.inventory_levels%rowtype;
  v_target integer;
begin
  if p_quantity is null or p_quantity < 0 or p_quantity > 100000 then
    raise exception 'Enter a stock number from 0 to 100,000.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.products p where p.id = p_product_id and p.vendor_id = v.id) then
    raise exception 'That product isn''t in your store.' using errcode = '42501';
  end if;
  select * into v_level from public.inventory_levels i
  where i.product_id = p_product_id and i.size_code = coalesce(p_size_code, '') for update;
  if not found then
    raise exception 'That size doesn''t exist.' using errcode = '22023';
  end if;
  v_target := v_level.reserved + p_quantity;
  if v_target <> v_level.on_hand then
    update public.inventory_levels i set on_hand = v_target where i.product_id = p_product_id and i.size_code = v_level.size_code;
    perform public.log_stock_movement(p_product_id, v_level.size_code, null, 'adjusted', v_target - v_level.on_hand,
      v_target - v_level.on_hand, null, 'Set by vendor ' || v.slug);
  end if;
end;
$$;

revoke all on function public.vendor_set_stock(uuid, text, integer) from public, anon;
grant execute on function public.vendor_set_stock(uuid, text, integer) to authenticated;

-- Takes a product off sale for good. Products with orders are kept (hidden) so past orders still make sense.
create function public.vendor_delete_product(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vendors := public.vendor_require_live();
begin
  if not exists (select 1 from public.products p where p.id = p_product_id and p.vendor_id = v.id) then
    raise exception 'That product isn''t in your store.' using errcode = '42501';
  end if;
  if exists (select 1 from public.order_items i where i.product_id = p_product_id) then
    update public.products p set publish_requested = false, review_status = 'draft' where p.id = p_product_id;
  else
    delete from public.products p where p.id = p_product_id;
  end if;
  perform public.audit('vendor.product_removed', 'product', p_product_id::text, jsonb_build_object('vendor', v.slug));
end;
$$;

revoke all on function public.vendor_delete_product(uuid) from public, anon;
grant execute on function public.vendor_delete_product(uuid) to authenticated;

-- Records an uploaded photo for one of the vendor's products. Returns the photo id.
create function public.vendor_add_product_image(p_product_id uuid, p_path text, p_alt text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vendors := public.vendor_require_live();
  v_id uuid;
begin
  if not exists (select 1 from public.products p where p.id = p_product_id and p.vendor_id = v.id) then
    raise exception 'That product isn''t in your store.' using errcode = '42501';
  end if;
  if split_part(p_path, '/', 1) <> p_product_id::text
     or not exists (select 1 from storage.objects o where o.bucket_id = 'product-images' and o.name = p_path) then
    raise exception 'The photo didn''t upload. Please try again.' using errcode = '22023';
  end if;
  if (select count(*) from public.product_images i where i.product_id = p_product_id) >= 8 then
    raise exception 'A product can have up to 8 photos. Remove one first.' using errcode = '22023';
  end if;
  insert into public.product_images (product_id, path, alt, sort_order)
  values (p_product_id, p_path, nullif(btrim(left(p_alt, 200)), ''),
          coalesce((select max(i.sort_order) + 1 from public.product_images i where i.product_id = p_product_id), 0))
  returning id into v_id;
  -- A new photo of an approved product is still the same product; nothing to re-review.
  return v_id;
end;
$$;

revoke all on function public.vendor_add_product_image(uuid, text, text) from public, anon;
grant execute on function public.vendor_add_product_image(uuid, text, text) to authenticated;

-- Removes the record of a photo (the file itself is removed through the Storage API).
create function public.vendor_remove_product_image(p_image_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vendors := public.vendor_require_live();
  v_path text;
begin
  delete from public.product_images i
  using public.products p
  where i.id = p_image_id and p.id = i.product_id and p.vendor_id = v.id
  returning i.path into v_path;
  if v_path is null then
    raise exception 'That photo isn''t in your store.' using errcode = '42501';
  end if;
  return v_path;
end;
$$;

revoke all on function public.vendor_remove_product_image(uuid) from public, anon;
grant execute on function public.vendor_remove_product_image(uuid) to authenticated;

-- The vendor's own products with their review state, markup shown as the final shopper price, and stock per size.
-- Columns are listed explicitly so nothing staff-only leaks here either.
create function public.vendor_my_products()
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
      'id', p.id, 'slug', p.slug, 'name', p.name, 'brand', p.brand, 'department', p.department, 'kind', p.kind,
      'category_id', p.category_id, 'summary', p.summary, 'details', p.details,
      'review_status', p.review_status, 'review_note', p.review_note, 'publish_requested', p.publish_requested,
      'is_published', p.is_published, 'vendor_price_ghs', p.vendor_price_ghs, 'vendor_was_price_ghs', p.vendor_was_price_ghs,
      'markup_percent', case when p.review_status = 'approved' then p.markup_percent end,
      'shopper_price_ghs', case when p.review_status = 'approved' then p.price_ghs end,
      'problems', to_jsonb(public.product_publish_problems(p.id)),
      'sizes', coalesce((
        select jsonb_agg(jsonb_build_object('code', s.code, 'label', s.label, 'vendor_price_ghs', s.vendor_price_ghs,
                 'is_default', s.is_default, 'stock', coalesce(i.in_stock_qty, 0)) order by s.sort_order)
        from public.product_sizes s
        left join lateral (
          select il.on_hand - il.reserved as in_stock_qty from public.inventory_levels il
          where il.product_id = p.id and il.size_code = s.code
        ) i on true
        where s.product_id = p.id), '[]'::jsonb),
      'images', coalesce((
        select jsonb_agg(jsonb_build_object('id', im.id, 'path', im.path) order by im.sort_order)
        from public.product_images im where im.product_id = p.id), '[]'::jsonb)
    ) order by p.created_at desc)
    from public.products p where p.vendor_id = v.id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.vendor_my_products() from public, anon;
grant execute on function public.vendor_my_products() to authenticated;

-- ---------------------------------------------------------------------------
-- Owner (admin) functions
-- ---------------------------------------------------------------------------

-- Every vendor with what the owner needs to decide: contact details, status, subscription, product counts.
create function public.admin_vendors()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['admin']::public.staff_role[]);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', v.id, 'slug', v.slug, 'name', v.name, 'tagline', v.tagline, 'status', v.status, 'created_at', v.created_at,
      'live', public.vendor_is_live(v.id),
      'phone', pr.phone, 'email', pr.email, 'review_note', pr.review_note,
      'paid_until', (select max(s.ends_on) from public.vendor_subscriptions s where s.vendor_id = v.id),
      'products', (select count(*) from public.products p where p.vendor_id = v.id),
      'pending_products', (select count(*) from public.products p where p.vendor_id = v.id and p.review_status = 'pending')
    ) order by (v.status = 'pending') desc, v.created_at desc)
    from public.vendors v
    left join public.vendor_private pr on pr.vendor_id = v.id
    where not v.is_house
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_vendors() from public, anon;
grant execute on function public.admin_vendors() to authenticated;

create function public.admin_review_vendor(p_vendor_id uuid, p_decision public.vendor_status, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['admin']::public.staff_role[]);
  if p_decision = 'pending' then
    raise exception 'Choose approve, reject or suspend.' using errcode = '22023';
  end if;
  update public.vendors v set status = p_decision where v.id = p_vendor_id and not v.is_house;
  if not found then
    raise exception 'That vendor no longer exists.' using errcode = '22023';
  end if;
  update public.vendor_private pr set review_note = nullif(btrim(left(p_note, 1000)), '') where pr.vendor_id = p_vendor_id;
  perform public.audit('vendor.' || p_decision::text, 'vendor', p_vendor_id::text, jsonb_build_object('note', p_note));
end;
$$;

revoke all on function public.admin_review_vendor(uuid, public.vendor_status, text) from public, anon;
grant execute on function public.admin_review_vendor(uuid, public.vendor_status, text) to authenticated;

-- Records a payment for a year of subscription. A renewal starts the day after the current period ends.
create function public.admin_record_subscription(
  p_vendor_id uuid, p_amount_ghs numeric, p_method text default 'manual', p_reference text default null, p_note text default null
)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start date;
  v_end date;
begin
  perform public.require_staff(array['admin']::public.staff_role[]);
  if not exists (select 1 from public.vendors v where v.id = p_vendor_id and not v.is_house) then
    raise exception 'That vendor no longer exists.' using errcode = '22023';
  end if;
  if p_amount_ghs is null or p_amount_ghs < 0 then
    raise exception 'Enter the amount paid.' using errcode = '22023';
  end if;
  v_start := greatest(current_date, coalesce((select max(s.ends_on) + 1 from public.vendor_subscriptions s where s.vendor_id = p_vendor_id), current_date));
  v_end := (v_start + interval '1 year')::date - 1;
  insert into public.vendor_subscriptions (vendor_id, starts_on, ends_on, amount_ghs, method, reference, note, recorded_by)
  values (p_vendor_id, v_start, v_end, p_amount_ghs, p_method, nullif(btrim(p_reference), ''), nullif(btrim(p_note), ''), auth.uid());
  perform public.audit('vendor.subscription_recorded', 'vendor', p_vendor_id::text,
    jsonb_build_object('amount_ghs', p_amount_ghs, 'starts_on', v_start, 'ends_on', v_end, 'method', p_method));
  return v_end;
end;
$$;

revoke all on function public.admin_record_subscription(uuid, numeric, text, text, text) from public, anon;
grant execute on function public.admin_record_subscription(uuid, numeric, text, text, text) to authenticated;

-- The review queue: vendor products waiting for the owner, with what's needed to judge them.
create function public.admin_vendor_products(p_status public.product_review_status default 'pending')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['admin', 'catalogue']::public.staff_role[]);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'slug', p.slug, 'name', p.name, 'brand', p.brand, 'department', p.department, 'summary', p.summary,
      'vendor_id', v.id, 'vendor_name', v.name, 'vendor_slug', v.slug,
      'vendor_price_ghs', p.vendor_price_ghs, 'markup_percent', p.markup_percent, 'price_ghs', p.price_ghs,
      'review_status', p.review_status, 'review_note', p.review_note, 'publish_requested', p.publish_requested,
      'is_published', p.is_published, 'problems', to_jsonb(public.product_publish_problems(p.id)),
      'image_count', (select count(*) from public.product_images i where i.product_id = p.id)
    ) order by p.updated_at desc)
    from public.products p join public.vendors v on v.id = p.vendor_id
    where not v.is_house and p.review_status = p_status
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_vendor_products(public.product_review_status) from public, anon;
grant execute on function public.admin_vendor_products(public.product_review_status) to authenticated;

-- Approves or rejects a vendor product and sets its markup. An approved product goes on sale when it is complete,
-- the vendor wants it published and the store is live.
create function public.admin_review_product(
  p_product_id uuid, p_decision public.product_review_status, p_markup_percent numeric default null, p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.products%rowtype;
  v_problems text[];
begin
  perform public.require_staff(array['admin']::public.staff_role[]);
  if p_decision not in ('approved', 'rejected', 'pending') then
    raise exception 'Choose approve, reject or send back.' using errcode = '22023';
  end if;
  select x.* into p from public.products x
  join public.vendors v on v.id = x.vendor_id and not v.is_house
  where x.id = p_product_id for update of x;
  if not found then
    raise exception 'That vendor product no longer exists.' using errcode = '22023';
  end if;
  if p_markup_percent is not null and (p_markup_percent < 0 or p_markup_percent > 200) then
    raise exception 'The markup must be between 0%% and 200%%.' using errcode = '22023';
  end if;
  v_problems := public.product_publish_problems(p_product_id);
  if p_decision = 'approved' and cardinality(v_problems) > 0 then
    raise exception 'This product is missing: %.', array_to_string(v_problems, ', ') using errcode = '22023';
  end if;
  update public.products x set
    review_status = p_decision,
    markup_percent = coalesce(p_markup_percent, x.markup_percent),
    review_note = nullif(btrim(left(p_note, 500)), '')
  where x.id = p_product_id;
  perform public.audit('product.review_' || p_decision::text, 'product', p_product_id::text,
    jsonb_build_object('markup_percent', coalesce(p_markup_percent, p.markup_percent), 'note', p_note));
  return (select jsonb_build_object('id', x.id, 'review_status', x.review_status, 'markup_percent', x.markup_percent,
            'price_ghs', x.price_ghs, 'is_published', x.is_published) from public.products x where x.id = p_product_id);
end;
$$;

revoke all on function public.admin_review_product(uuid, public.product_review_status, numeric, text) from public, anon;
grant execute on function public.admin_review_product(uuid, public.product_review_status, numeric, text) to authenticated;

-- Marketplace settings: yearly fee, grace days, default markup, payment instructions, and the switch for vendor orders.
create function public.admin_set_marketplace_settings(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['admin']::public.staff_role[]);
  begin
    update public.store_settings s set
      vendor_annual_fee_ghs = coalesce((p ->> 'vendor_annual_fee_ghs')::numeric, s.vendor_annual_fee_ghs),
      vendor_grace_days = coalesce((p ->> 'vendor_grace_days')::integer, s.vendor_grace_days),
      default_markup_percent = coalesce((p ->> 'default_markup_percent')::numeric, s.default_markup_percent),
      vendor_payment_instructions = case when p ? 'vendor_payment_instructions'
        then nullif(btrim(p ->> 'vendor_payment_instructions'), '') else s.vendor_payment_instructions end,
      marketplace_orders_open = coalesce((p ->> 'marketplace_orders_open')::boolean, s.marketplace_orders_open);
  exception
    when invalid_text_representation or check_violation then
      raise exception 'Check the marketplace settings: fee and markup are numbers, grace days up to 60, markup up to 200%%.'
        using errcode = '22023';
  end;
  perform public.refresh_vendor_products(null);
  perform public.audit('marketplace.settings_changed', 'store_settings', 'marketplace', p);
end;
$$;

revoke all on function public.admin_set_marketplace_settings(jsonb) from public, anon;
grant execute on function public.admin_set_marketplace_settings(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Shopper data rights: a vendor's store details are exported, and closed when the account is deleted.
-- ---------------------------------------------------------------------------

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
    'vendor_store', (
      select jsonb_build_object('name', v.name, 'web_address', v.slug, 'tagline', v.tagline, 'description', v.description,
        'status', v.status, 'applied_at', v.created_at, 'phone', pr.phone, 'email', pr.email,
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

create or replace function public.account_deletion_blocker()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
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
  select count(distinct o.id) into v_open from public.order_items i
  join public.vendors v on v.id = i.vendor_id and v.owner_id = v_user and not v.is_house
  join public.orders o on o.id = i.order_id
  where o.status not in ('delivered', 'cancelled', 'returned');
  if v_open > 0 then
    return format('Your store has %s order%s still in progress. You can delete your account once %s delivered or cancelled.',
                  v_open, case when v_open = 1 then '' else 's' end, case when v_open = 1 then 'it is' else 'they are' end);
  end if;
  return null;
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
