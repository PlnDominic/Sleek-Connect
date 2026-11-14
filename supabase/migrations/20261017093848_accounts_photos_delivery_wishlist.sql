-- Saved addresses (PRD FR-023), product photos (NFR-P2), delivery zones, free delivery and estimates (FR-040/041),
-- customer cancellation (FR-052), reorder data (FR-051) and the wishlist (FR-063).

-- ---------------------------------------------------------------------------
-- Saved addresses (FR-023)
-- ---------------------------------------------------------------------------

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text check (label is null or length(label) <= 40),
  recipient_name text not null check (length(recipient_name) between 1 and 120),
  phone text not null,
  area text not null,
  ghanapost_gps text check (ghanapost_gps is null or length(ghanapost_gps) <= 20),
  directions text check (directions is null or length(directions) <= 300),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customer_addresses_user_idx on public.customer_addresses (user_id);
create unique index customer_addresses_one_default_idx on public.customer_addresses (user_id) where is_default;

create trigger customer_addresses_set_updated_at
  before update on public.customer_addresses
  for each row execute function public.set_updated_at();

alter table public.customer_addresses enable row level security;
create policy "Shoppers read their own addresses" on public.customer_addresses
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.customer_addresses to authenticated;

-- Adds or updates one of the signed-in shopper's addresses. p: {id?, label, recipient_name, phone, area,
-- ghanapost_gps, directions, is_default}. The first address becomes the default. Returns the address id.
create function public.save_address(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_name text := nullif(btrim(p ->> 'recipient_name'), '');
  v_phone text := nullif(btrim(p ->> 'phone'), '');
  v_area text := nullif(btrim(p ->> 'area'), '');
  v_gps text := upper(nullif(btrim(p ->> 'ghanapost_gps'), ''));
  v_default boolean := coalesce((p ->> 'is_default')::boolean, false);
begin
  if v_user is null then
    raise exception 'Sign in to save addresses.' using errcode = '42501';
  end if;
  if v_name is null or length(v_name) > 120 then
    raise exception 'Enter the name of the person receiving the order.' using errcode = '22023';
  end if;
  if v_phone is null or regexp_replace(v_phone, '\D', '', 'g') !~ '^\d{9,15}$' then
    raise exception 'Enter a valid phone number.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.delivery_areas a where a.name = v_area and a.is_active) then
    raise exception 'Choose one of the areas we deliver to.' using errcode = '22023';
  end if;
  if v_gps is not null and v_gps !~ '^[A-Z]{2}-?[0-9]{3,4}-?[0-9]{3,5}$' then
    raise exception 'GhanaPost GPS addresses look like GA-123-4567.' using errcode = '22023';
  end if;
  if length(coalesce(p ->> 'directions', '')) > 300 or length(coalesce(p ->> 'label', '')) > 40 then
    raise exception 'Keep the label under 40 characters and the directions under 300.' using errcode = '22023';
  end if;

  if v_id is null then
    if (select count(*) from public.customer_addresses c where c.user_id = v_user) >= 10 then
      raise exception 'You can save up to 10 addresses. Remove one first.' using errcode = '22023';
    end if;
    v_default := v_default or not exists (select 1 from public.customer_addresses c where c.user_id = v_user);
    if v_default then
      update public.customer_addresses c set is_default = false where c.user_id = v_user and c.is_default;
    end if;
    insert into public.customer_addresses (user_id, label, recipient_name, phone, area, ghanapost_gps, directions, is_default)
    values (v_user, nullif(btrim(p ->> 'label'), ''), v_name, v_phone, v_area, v_gps, nullif(btrim(p ->> 'directions'), ''),
            v_default)
    returning id into v_id;
  else
    if not exists (select 1 from public.customer_addresses c where c.id = v_id and c.user_id = v_user) then
      raise exception 'That address no longer exists.' using errcode = '22023';
    end if;
    if v_default then
      update public.customer_addresses c set is_default = false where c.user_id = v_user and c.is_default and c.id <> v_id;
    end if;
    update public.customer_addresses c
    set label = nullif(btrim(p ->> 'label'), ''), recipient_name = v_name, phone = v_phone, area = v_area,
        ghanapost_gps = v_gps, directions = nullif(btrim(p ->> 'directions'), ''),
        is_default = v_default or c.is_default
    where c.id = v_id;
  end if;
  return v_id;
end;
$$;

revoke all on function public.save_address(jsonb) from public, anon;
grant execute on function public.save_address(jsonb) to authenticated;

-- Removes one of the shopper's addresses. If it was the default, the most recently used remaining one takes over.
create function public.delete_address(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_was_default boolean;
begin
  delete from public.customer_addresses c where c.id = p_id and c.user_id = v_user returning c.is_default into v_was_default;
  if v_was_default then
    update public.customer_addresses c set is_default = true
    where c.id = (select c2.id from public.customer_addresses c2 where c2.user_id = v_user order by c2.updated_at desc limit 1);
  end if;
end;
$$;

revoke all on function public.delete_address(uuid) from public, anon;
grant execute on function public.delete_address(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Product photos (NFR-P2)
-- ---------------------------------------------------------------------------

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  -- Path in the public product-images bucket: <product id>/<random id>.<ext>
  path text not null unique,
  alt text check (alt is null or length(alt) <= 200),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index product_images_product_idx on public.product_images (product_id, sort_order);

alter table public.product_images enable row level security;
create policy "Photos of published products are public" on public.product_images
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.is_published));
create policy "Staff can read all product photos" on public.product_images
  for select to authenticated using ((select public.current_staff_role()) is not null);
grant select on public.product_images to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Catalogue staff (two-step verified) upload and remove photos. Anyone can view them: the bucket is public.
create policy "Catalogue staff upload product photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and (select public.current_staff_role()) in ('admin', 'catalogue'));
create policy "Catalogue staff remove product photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and (select public.current_staff_role()) in ('admin', 'catalogue'));
create policy "Catalogue staff list product photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'product-images' and (select public.current_staff_role()) in ('admin', 'catalogue'));

-- Records an uploaded photo against its product (last in the gallery). Returns the photo id.
create function public.admin_add_product_image(p_product_id uuid, p_path text, p_alt text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.require_staff(array['catalogue']::public.staff_role[]);
  if not exists (select 1 from public.products p where p.id = p_product_id) then
    raise exception 'That product no longer exists.' using errcode = '22023';
  end if;
  if split_part(p_path, '/', 1) <> p_product_id::text
     or not exists (select 1 from storage.objects o where o.bucket_id = 'product-images' and o.name = p_path) then
    raise exception 'The photo didn''t upload. Please try again.' using errcode = '22023';
  end if;
  if (select count(*) from public.product_images i where i.product_id = p_product_id) >= 8 then
    raise exception 'A product can have up to 8 photos. Remove one first.' using errcode = '22023';
  end if;
  insert into public.product_images (product_id, path, alt, sort_order)
  values (p_product_id, p_path, nullif(btrim(p_alt), ''),
          coalesce((select max(i.sort_order) + 1 from public.product_images i where i.product_id = p_product_id), 0))
  returning id into v_id;
  perform public.audit('product.photo_added', 'product', p_product_id::text, jsonb_build_object('path', p_path));
  return v_id;
end;
$$;

revoke all on function public.admin_add_product_image(uuid, text, text) from public, anon;
grant execute on function public.admin_add_product_image(uuid, text, text) to authenticated;

-- Sets the gallery order (the first photo is the main one) and each photo's description.
-- p_photos: [{id, alt}] in display order.
create function public.admin_arrange_product_images(p_product_id uuid, p_photos jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['catalogue']::public.staff_role[]);
  update public.product_images i
  set sort_order = e.ord, alt = nullif(btrim(left(e.photo ->> 'alt', 200)), '')
  from jsonb_array_elements(p_photos) with ordinality as e(photo, ord)
  where i.product_id = p_product_id and i.id::text = e.photo ->> 'id';
  perform public.audit('product.photos_arranged', 'product', p_product_id::text, null);
end;
$$;

revoke all on function public.admin_arrange_product_images(uuid, jsonb) from public, anon;
grant execute on function public.admin_arrange_product_images(uuid, jsonb) to authenticated;

-- Removes a photo from its product and returns its storage path (the caller deletes the file through Storage).
create function public.admin_remove_product_image(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_photo public.product_images%rowtype;
begin
  perform public.require_staff(array['catalogue']::public.staff_role[]);
  delete from public.product_images i where i.id = p_id returning * into v_photo;
  if not found then
    raise exception 'That photo was already removed.' using errcode = '22023';
  end if;
  perform public.audit('product.photo_removed', 'product', v_photo.product_id::text, jsonb_build_object('path', v_photo.path));
  return v_photo.path;
end;
$$;

revoke all on function public.admin_remove_product_image(uuid) from public, anon;
grant execute on function public.admin_remove_product_image(uuid) to authenticated;

-- The bag shows each product's main photo.
drop function public.get_bag();

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
  in_stock boolean,
  warning_label text,
  photo_path text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.slug, p.name, nullif(b.size_code, ''), s.label, coalesce(s.price_ghs, p.price_ghs),
         p.image_key, p.tint, p.kind, b.quantity, coalesce(i.in_stock, false), p.warning_label,
         (select pi.path from public.product_images pi where pi.product_id = p.id order by pi.sort_order, pi.created_at limit 1)
  from public.bag_items b
  join public.products p on p.id = b.product_id and p.is_published
  left join public.product_sizes s on s.product_id = b.product_id and s.code = b.size_code
  left join public.inventory_levels i on i.product_id = b.product_id and i.size_code = b.size_code
  where b.user_id = (select auth.uid())
  order by b.updated_at, p.name;
$$;

revoke all on function public.get_bag() from public, anon;
grant execute on function public.get_bag() to authenticated;

-- ---------------------------------------------------------------------------
-- Delivery zones, free delivery and estimates (FR-040, FR-041)
-- ---------------------------------------------------------------------------

-- Areas can be grouped into zones that charge their own fee per delivery option, or don't offer an option.
-- Areas without a zone, and zones without a rate for an option, use the option's standard fee.
create table public.delivery_zones (
  id text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  name text not null check (length(btrim(name)) between 1 and 60),
  sort_order smallint not null default 0
);

alter table public.delivery_areas
  add column zone_id text references public.delivery_zones (id) on delete set null;

create table public.delivery_rates (
  zone_id text not null references public.delivery_zones (id) on delete cascade,
  option_id text not null references public.delivery_options (id) on delete cascade,
  fee_ghs numeric(10, 2) check (fee_ghs >= 0),
  is_available boolean not null default true,
  primary key (zone_id, option_id)
);

alter table public.delivery_options
  -- Free once the bag reaches store_settings.free_delivery_threshold_ghs.
  add column free_eligible boolean not null default false,
  -- Working days from dispatch to delivery, shown to shoppers as an estimate.
  add column days_min smallint check (days_min >= 0),
  add column days_max smallint check (days_max >= 0),
  -- Orders paid before this time (Accra) are dispatched the same day.
  add column cutoff_time time,
  add check (days_max is null or days_min is null or days_max >= days_min);

update public.delivery_options set free_eligible = true where id = 'standard';

alter table public.store_settings
  add column free_delivery_threshold_ghs numeric(10, 2) check (free_delivery_threshold_ghs >= 0);

alter table public.delivery_zones enable row level security;
alter table public.delivery_rates enable row level security;
create policy "Delivery zones are public" on public.delivery_zones for select to anon, authenticated using (true);
create policy "Delivery rates are public" on public.delivery_rates for select to anon, authenticated using (true);
grant select on public.delivery_zones, public.delivery_rates to anon, authenticated;

-- Staff need to see inactive areas too.
create policy "Staff can read all delivery areas" on public.delivery_areas
  for select to authenticated using ((select public.current_staff_role()) is not null);

-- Creates or renames a delivery area, assigns its zone and switches it on or off. Admins only.
-- p: {old_name?, name, zone_id, is_active, sort_order}
create function public.admin_save_delivery_area(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text := nullif(btrim(p ->> 'old_name'), '');
  v_name text := nullif(btrim(p ->> 'name'), '');
  v_zone text := nullif(p ->> 'zone_id', '');
begin
  perform public.require_staff(array['admin']::public.staff_role[]);
  if v_name is null or length(v_name) > 60 then
    raise exception 'Enter the area name (up to 60 characters).' using errcode = '22023';
  end if;
  if v_zone is not null and not exists (select 1 from public.delivery_zones z where z.id = v_zone) then
    raise exception 'That zone no longer exists.' using errcode = '22023';
  end if;
  if v_name is distinct from v_old and exists (select 1 from public.delivery_areas a where a.name = v_name) then
    raise exception 'There is already an area called %.', v_name using errcode = '22023';
  end if;
  if v_old is null then
    insert into public.delivery_areas (name, zone_id, is_active, sort_order)
    values (v_name, v_zone, coalesce((p ->> 'is_active')::boolean, true),
            coalesce(nullif(p ->> 'sort_order', '')::smallint, (select coalesce(max(a.sort_order) + 1, 0) from public.delivery_areas a)));
  else
    update public.delivery_areas a
    set name = v_name, zone_id = v_zone, is_active = coalesce((p ->> 'is_active')::boolean, a.is_active),
        sort_order = coalesce(nullif(p ->> 'sort_order', '')::smallint, a.sort_order)
    where a.name = v_old;
    if not found then
      raise exception 'That area no longer exists.' using errcode = '22023';
    end if;
    -- Saved addresses follow a renamed area.
    update public.customer_addresses c set area = v_name where c.area = v_old and v_name <> v_old;
  end if;
  perform public.audit('delivery.area_saved', 'delivery_area', v_name, p);
end;
$$;

revoke all on function public.admin_save_delivery_area(jsonb) from public, anon;
grant execute on function public.admin_save_delivery_area(jsonb) to authenticated;

-- Creates or renames a zone. Admins only.
create function public.admin_save_delivery_zone(p_id text, p_name text, p_sort_order smallint default 0)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['admin']::public.staff_role[]);
  if coalesce(btrim(p_name), '') = '' or length(p_name) > 60 then
    raise exception 'Enter the zone name (up to 60 characters).' using errcode = '22023';
  end if;
  if p_id is null or p_id !~ '^[a-z0-9-]{1,40}$' then
    raise exception 'Zone codes use lower-case letters, numbers and dashes.' using errcode = '22023';
  end if;
  insert into public.delivery_zones (id, name, sort_order) values (p_id, btrim(p_name), coalesce(p_sort_order, 0))
  on conflict (id) do update set name = excluded.name, sort_order = excluded.sort_order;
  perform public.audit('delivery.zone_saved', 'delivery_zone', p_id, jsonb_build_object('name', btrim(p_name)));
end;
$$;

revoke all on function public.admin_save_delivery_zone(text, text, smallint) from public, anon;
grant execute on function public.admin_save_delivery_zone(text, text, smallint) to authenticated;

-- Deletes a zone; its areas fall back to the standard fees. Admins only.
create function public.admin_delete_delivery_zone(p_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['admin']::public.staff_role[]);
  delete from public.delivery_zones z where z.id = p_id;
  perform public.audit('delivery.zone_deleted', 'delivery_zone', p_id, null);
end;
$$;

revoke all on function public.admin_delete_delivery_zone(text) from public, anon;
grant execute on function public.admin_delete_delivery_zone(text) to authenticated;

-- Sets what a zone charges for a delivery option. p_fee null = the option's standard fee. Admins only.
create function public.admin_set_delivery_rate(p_zone_id text, p_option_id text, p_fee numeric, p_available boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['admin']::public.staff_role[]);
  if p_fee < 0 then
    raise exception 'Fees can''t be negative.' using errcode = '22023';
  end if;
  if p_fee is null and coalesce(p_available, true) then
    delete from public.delivery_rates r where r.zone_id = p_zone_id and r.option_id = p_option_id;
  else
    insert into public.delivery_rates (zone_id, option_id, fee_ghs, is_available)
    values (p_zone_id, p_option_id, p_fee, coalesce(p_available, true))
    on conflict (zone_id, option_id) do update set fee_ghs = excluded.fee_ghs, is_available = excluded.is_available;
  end if;
  perform public.audit('delivery.rate_set', 'delivery_zone', p_zone_id,
    jsonb_build_object('option', p_option_id, 'fee_ghs', p_fee, 'available', coalesce(p_available, true)));
exception
  when foreign_key_violation then
    raise exception 'That zone or delivery option no longer exists.' using errcode = '22023';
end;
$$;

revoke all on function public.admin_set_delivery_rate(text, text, numeric, boolean) from public, anon;
grant execute on function public.admin_set_delivery_rate(text, text, numeric, boolean) to authenticated;

-- Updates a delivery option's standard fee, free-delivery eligibility, estimate and cut-off. Admins only.
-- p: {id, label, fee_ghs, free_eligible, days_min, days_max, cutoff_time}
create function public.admin_save_delivery_option(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
begin
  perform public.require_staff(array['admin']::public.staff_role[]);
  select to_jsonb(o) into v_before from public.delivery_options o where o.id = p ->> 'id';
  if v_before is null then
    raise exception 'That delivery option no longer exists.' using errcode = '22023';
  end if;
  if coalesce(btrim(p ->> 'label'), '') = '' or length(p ->> 'label') > 40 then
    raise exception 'Enter a name for the option (up to 40 characters).' using errcode = '22023';
  end if;
  begin
    update public.delivery_options o
    set label = btrim(p ->> 'label'),
        fee_ghs = nullif(btrim(p ->> 'fee_ghs'), '')::numeric,
        free_eligible = coalesce((p ->> 'free_eligible')::boolean, false),
        days_min = nullif(btrim(p ->> 'days_min'), '')::smallint,
        days_max = nullif(btrim(p ->> 'days_max'), '')::smallint,
        cutoff_time = nullif(btrim(p ->> 'cutoff_time'), '')::time
    where o.id = p ->> 'id';
  exception
    when check_violation then
      raise exception 'Check the numbers: fees can''t be negative and the longest estimate can''t be shorter than the shortest.'
        using errcode = '22023';
    when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
      raise exception 'Fees and days must be numbers, and the cut-off a time like 14:00.' using errcode = '22023';
  end;
  perform public.audit('delivery.option_saved', 'delivery_option', p ->> 'id',
    jsonb_build_object('before', v_before, 'after', (select to_jsonb(o) from public.delivery_options o where o.id = p ->> 'id')));
end;
$$;

revoke all on function public.admin_save_delivery_option(jsonb) from public, anon;
grant execute on function public.admin_save_delivery_option(jsonb) to authenticated;

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

revoke all on function public.admin_update_settings(jsonb) from public, anon;
grant execute on function public.admin_update_settings(jsonb) to authenticated;

-- place_order now charges the zone's fee and applies free delivery.
-- p_customer: {"name", "phone", "area", "ghanapost_gps"?, "directions"?}
-- p_payment:  {"method": "momo"|"card", "network"?: "mtn"|"telecel"|"at", "wallet"?}
-- p_items:    [{"slug", "size"?, "quantity"}]
create or replace function public.place_order(
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
$$;

-- ---------------------------------------------------------------------------
-- Customers cancel their own order before packing starts (FR-052)
-- ---------------------------------------------------------------------------

create function public.cancel_my_order(p_order_token uuid, p_reason text default null)
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
  set status = 'cancelled', cancel_reason = v_reason, refund_due = true
  where o.id = v_order.id;
end;
$$;

revoke all on function public.cancel_my_order(uuid, text) from public;
grant execute on function public.cancel_my_order(uuid, text) to anon, authenticated;

-- The order page: can the customer cancel, each line's size code (for "Buy again") and main photo.
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

-- ---------------------------------------------------------------------------
-- Wishlist (FR-063)
-- ---------------------------------------------------------------------------

create table public.wishlist_items (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create index wishlist_items_product_idx on public.wishlist_items (product_id);

alter table public.wishlist_items enable row level security;
create policy "Shoppers read their own wishlist" on public.wishlist_items
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.wishlist_items to authenticated;

-- The signed-in shopper's saved products (published only), newest first.
create function public.get_wishlist()
returns table (slug text, saved_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.slug, w.created_at
  from public.wishlist_items w join public.products p on p.id = w.product_id and p.is_published
  where w.user_id = (select auth.uid())
  order by w.created_at desc;
$$;

revoke all on function public.get_wishlist() from public, anon;
grant execute on function public.get_wishlist() to authenticated;

-- Saves (p_saved true) or removes products by slug; unknown slugs are ignored. Up to 200 saved products.
create function public.set_wishlist(p_slugs text[], p_saved boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Sign in to save products.' using errcode = '42501';
  end if;
  if p_saved then
    insert into public.wishlist_items (user_id, product_id)
    select v_user, p.id from public.products p where p.slug = any (p_slugs) and p.is_published
    on conflict do nothing;
    if (select count(*) from public.wishlist_items w where w.user_id = v_user) > 200 then
      raise exception 'You can save up to 200 products.' using errcode = '22023';
    end if;
  else
    delete from public.wishlist_items w
    using public.products p
    where w.user_id = v_user and w.product_id = p.id and p.slug = any (p_slugs);
  end if;
end;
$$;

revoke all on function public.set_wishlist(text[], boolean) from public, anon;
grant execute on function public.set_wishlist(text[], boolean) to authenticated;
