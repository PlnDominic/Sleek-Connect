-- The store builder: set a store up before it is live, the way Etsy lets you build a shop before you open it.
-- ---------------------------------------------------------------------------
--  * A vendor can now work on their store as soon as they have applied (logo, banner, story, policies, links, sections), and
--    add draft products as soon as the store is approved: nothing is public until the store is approved AND paid for.
--  * New store details: an announcement, a returns policy, how many days they take to pack an order, an Instagram handle and a
--    website. Sections group a store's products ("Skincare", "Hair"), as on an Etsy shop.
--  * vendor_name_available checks a store name as it is typed (length, characters, reserved words, taken).
--  * A store can be paused (and resumed): its products leave the shop while it is paused; orders already placed still need packing.

alter table public.vendors
  add column announcement text check (announcement is null or length(announcement) <= 200),
  add column returns_policy text check (returns_policy is null or length(returns_policy) <= 1000),
  add column processing_days integer not null default 2 check (processing_days between 1 and 14),
  add column instagram text check (instagram is null or instagram ~ '^[A-Za-z0-9._]{1,60}$'),
  add column website text check (website is null or (length(website) <= 200 and website ~ '^https?://[^\s]+$')),
  add column paused_at timestamptz,
  add column paused_note text check (paused_note is null or length(paused_note) <= 300);

-- Public on a live store's page (the vendor's private notes and who owns it stay hidden).
grant select (announcement, returns_policy, processing_days, instagram, website) on public.vendors to anon, authenticated;

-- A paused store is not live: its products leave the shop and its page disappears until it is resumed.
create or replace function public.vendor_is_live(p_vendor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.vendors v
    where v.id = p_vendor_id and v.status = 'active' and v.paused_at is null
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

drop trigger vendors_refresh_products on public.vendors;
create trigger vendors_refresh_products after insert or update of status, paused_at on public.vendors
  for each row execute function public.vendors_refresh_products();

-- The vendor whose store the caller runs while it is being set up or open (pending or approved). The storage rules for logos
-- and banners use it, so a vendor can upload them before the store is live.
create or replace function public.my_live_vendor_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select v.id from public.vendors v
  where v.owner_id = auth.uid() and not v.is_house and v.status in ('pending', 'active');
$$;

-- The caller's own vendor row, approved by us (but not necessarily paid for yet): enough to prepare products.
create or replace function public.vendor_require_approved()
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
  return v;
end;
$$;

revoke all on function public.vendor_require_approved() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Store details
-- ---------------------------------------------------------------------------

create or replace function public.vendor_update_store(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vendors := public.vendor_require_own();
  v_name text := btrim(coalesce(p ->> 'name', v.name));
  v_logo text := coalesce(nullif(p ->> 'logo_path', ''), case when p ? 'logo_path' then null else v.logo_path end);
  v_banner text := coalesce(nullif(p ->> 'banner_path', ''), case when p ? 'banner_path' then null else v.banner_path end);
  v_days integer := case when p ? 'processing_days' then (p ->> 'processing_days')::integer else v.processing_days end;
  v_instagram text := case when p ? 'instagram' then nullif(regexp_replace(btrim(coalesce(p ->> 'instagram', '')), '^@', ''), '') else v.instagram end;
  v_website text := case when p ? 'website' then nullif(btrim(coalesce(p ->> 'website', '')), '') else v.website end;
begin
  if v.status not in ('pending', 'active') then
    raise exception 'Your store can''t be edited right now.' using errcode = '42501';
  end if;
  if length(v_name) < 2 or length(v_name) > 60 then
    raise exception 'Enter your store name (2 to 60 characters).' using errcode = '22023';
  end if;
  if v_logo is not null and split_part(v_logo, '/', 1) <> v.id::text then
    raise exception 'That logo isn''t yours.' using errcode = '22023';
  end if;
  if v_banner is not null and split_part(v_banner, '/', 1) <> v.id::text then
    raise exception 'That banner isn''t yours.' using errcode = '22023';
  end if;
  if v_days < 1 or v_days > 14 then
    raise exception 'Packing time is between 1 and 14 working days.' using errcode = '22023';
  end if;
  if v_instagram is not null and v_instagram !~ '^[A-Za-z0-9._]{1,60}$' then
    raise exception 'Enter your Instagram name without spaces, for example ama.naturals.' using errcode = '22023';
  end if;
  if v_website is not null and (length(v_website) > 200 or v_website !~ '^https?://[^\s]+$') then
    raise exception 'The website must start with http:// or https://.' using errcode = '22023';
  end if;
  update public.vendors x set
    name = v_name,
    tagline = case when p ? 'tagline' then nullif(btrim(left(p ->> 'tagline', 120)), '') else x.tagline end,
    description = case when p ? 'description' then nullif(btrim(left(p ->> 'description', 2000)), '') else x.description end,
    announcement = case when p ? 'announcement' then nullif(btrim(left(p ->> 'announcement', 200)), '') else x.announcement end,
    returns_policy = case when p ? 'returns_policy' then nullif(btrim(left(p ->> 'returns_policy', 1000)), '') else x.returns_policy end,
    processing_days = v_days,
    instagram = v_instagram,
    website = v_website,
    logo_path = v_logo,
    banner_path = v_banner
  where x.id = v.id;
  if p ? 'phone' then
    update public.vendor_private pr set phone = nullif(btrim(left(p ->> 'phone', 30)), '') where pr.vendor_id = v.id;
  end if;
  perform public.audit('vendor.store_updated', 'vendor', v.id::text, null);
end;
$$;

-- Pause or resume the store. While paused its products and page are hidden; orders already placed must still be packed.
create or replace function public.vendor_set_paused(p_paused boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vendors := public.vendor_require_approved();
begin
  update public.vendors x
  set paused_at = case when p_paused then coalesce(x.paused_at, now()) else null end,
      paused_note = case when p_paused then nullif(btrim(left(coalesce(p_note, ''), 300)), '') else null end
  where x.id = v.id;
  perform public.audit(case when p_paused then 'vendor.paused' else 'vendor.resumed' end, 'vendor', v.id::text, null);
end;
$$;

revoke all on function public.vendor_set_paused(boolean, text) from public, anon;
grant execute on function public.vendor_set_paused(boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Choosing a store name
-- ---------------------------------------------------------------------------

-- {available, slug, reason?, suggestion?}: is this a good, free store name? The caller's own store counts as free.
create or replace function public.vendor_name_available(p_name text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_slug text := public.vendor_slugify(btrim(coalesce(p_name, '')));
  v_try integer := 1;
  v_suggestion text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;
  if length(v_name) < 2 or length(v_name) > 60 then
    return jsonb_build_object('available', false, 'reason', 'Use 2 to 60 characters.');
  end if;
  if v_name !~ '^[[:alnum:] &''’.,-]+$' then
    return jsonb_build_object('available', false, 'reason', 'Use letters, numbers, spaces and simple punctuation only.');
  end if;
  if length(v_slug) < 3 then
    return jsonb_build_object('available', false, 'reason', 'Add a few more letters.');
  end if;
  if v_slug ~ '^(admin|administrator|official|support|help|sleek|sleek-connect|sleek-connect-store|store|shop|vendor|vendors|sell|stores|test)$'
     or v_slug like 'sleek-connect-%' then
    return jsonb_build_object('available', false, 'reason', 'That name is reserved. Choose another.');
  end if;
  if exists (select 1 from public.vendors v where v.slug = v_slug and v.owner_id is distinct from auth.uid()) then
    v_suggestion := v_slug;
    while exists (select 1 from public.vendors v where v.slug = v_suggestion) loop
      v_try := v_try + 1;
      v_suggestion := left(v_slug, 34) || '-' || v_try;
    end loop;
    return jsonb_build_object('available', false, 'reason', 'That name is taken.', 'suggestion', replace(initcap(replace(v_suggestion, '-', ' ')), ' ', ' '));
  end if;
  return jsonb_build_object('available', true, 'slug', v_slug);
end;
$$;

revoke all on function public.vendor_name_available(text) from public, anon;
grant execute on function public.vendor_name_available(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Sections: groups of products on the store page
-- ---------------------------------------------------------------------------

create table public.vendor_sections (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 40),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index vendor_sections_name_idx on public.vendor_sections (vendor_id, lower(name));

alter table public.vendor_sections enable row level security;
create policy "Sections of live stores are public" on public.vendor_sections
  for select to anon, authenticated using (public.vendor_is_live(vendor_id));
create policy "Vendors can read their own sections" on public.vendor_sections
  for select to authenticated using (exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = (select auth.uid())));
grant select on public.vendor_sections to anon, authenticated;

alter table public.products add column section_id uuid references public.vendor_sections (id) on delete set null;
create index products_section_idx on public.products (section_id) where section_id is not null;

create or replace function public.vendor_save_section(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vendors := public.vendor_require_own();
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_name text := btrim(coalesce(p ->> 'name', ''));
begin
  if v.status not in ('pending', 'active') then
    raise exception 'Your store can''t be edited right now.' using errcode = '42501';
  end if;
  if length(v_name) < 1 or length(v_name) > 40 then
    raise exception 'Name the section (up to 40 characters).' using errcode = '22023';
  end if;
  if v_id is null then
    if (select count(*) from public.vendor_sections s where s.vendor_id = v.id) >= 12 then
      raise exception 'A store can have up to 12 sections.' using errcode = '22023';
    end if;
    insert into public.vendor_sections (vendor_id, name, sort_order)
    values (v.id, v_name, coalesce((select max(s.sort_order) + 1 from public.vendor_sections s where s.vendor_id = v.id), 0))
    returning id into v_id;
  else
    update public.vendor_sections s set name = v_name where s.id = v_id and s.vendor_id = v.id;
    if not found then
      raise exception 'That section doesn''t exist.' using errcode = '22023';
    end if;
  end if;
  return v_id;
exception
  when unique_violation then
    raise exception 'You already have a section called that.' using errcode = '22023';
end;
$$;

revoke all on function public.vendor_save_section(jsonb) from public, anon;
grant execute on function public.vendor_save_section(jsonb) to authenticated;

create or replace function public.vendor_delete_section(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vendors := public.vendor_require_own();
begin
  delete from public.vendor_sections s where s.id = p_id and s.vendor_id = v.id;
end;
$$;

revoke all on function public.vendor_delete_section(uuid) from public, anon;
grant execute on function public.vendor_delete_section(uuid) to authenticated;

-- Puts one of the vendor's products in one of their sections (or none). It doesn't change what the product is, so it needs no review.
create or replace function public.vendor_set_product_section(p_product_id uuid, p_section_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vendors := public.vendor_require_approved();
begin
  if p_section_id is not null and not exists (select 1 from public.vendor_sections s where s.id = p_section_id and s.vendor_id = v.id) then
    raise exception 'That section doesn''t exist.' using errcode = '22023';
  end if;
  update public.products x set section_id = p_section_id where x.id = p_product_id and x.vendor_id = v.id;
  if not found then
    raise exception 'That product isn''t yours.' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.vendor_set_product_section(uuid, uuid) from public, anon;
grant execute on function public.vendor_set_product_section(uuid, uuid) to authenticated;

-- Which section each of the vendor's products is in.
create or replace function public.vendor_product_sections()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.vendors := public.vendor_require_own();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('product_id', p.id, 'section_id', p.section_id)) from public.products p where p.vendor_id = v.id), '[]'::jsonb);
end;
$$;

revoke all on function public.vendor_product_sections() from public, anon;
grant execute on function public.vendor_product_sections() to authenticated;

-- ---------------------------------------------------------------------------
-- Products can be prepared once the store is approved (they still go on sale only when it is live and they are approved)
-- ---------------------------------------------------------------------------

create or replace function public.vendor_set_stock(p_product_id uuid, p_size_code text, p_quantity integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vendors := public.vendor_require_approved();
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

create or replace function public.vendor_delete_product(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vendors := public.vendor_require_approved();
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

create or replace function public.vendor_add_product_image(p_product_id uuid, p_path text, p_alt text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vendors := public.vendor_require_approved();
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

create or replace function public.vendor_remove_product_image(p_image_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vendors := public.vendor_require_approved();
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

create or replace function public.vendor_save_product(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v public.vendors := public.vendor_require_approved();
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
  v_prev jsonb;
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
    -- Keep what the owner approved, so the review can show what changed.
    v_prev := case
      when v_resubmit and v_before.review_status = 'approved' and v_before.review_previous is null then jsonb_build_object(
        'name', v_before.name, 'brand', v_before.brand, 'department', v_before.department,
        'category_id', v_before.category_id, 'summary', v_before.summary,
        'description', v_before.details ->> 'description', 'ingredients', v_before.ingredients)
      else v_before.review_previous
    end;
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
      review_note = case when v_resubmit then null else x.review_note end,
      review_previous = v_prev
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

-- The vendor's own view of their store, now with the new details.
create or replace function public.vendor_me()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
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
    'announcement', v.announcement,
    'returns_policy', v.returns_policy,
    'processing_days', v.processing_days,
    'instagram', v.instagram,
    'website', v.website,
    'paused', v.paused_at is not null,
    'paused_note', v.paused_note,
    'status', v.status,
    'live', public.vendor_is_live(v.id),
    'paid_until', v_paid_until,
    'grace_days', s.vendor_grace_days,
    'annual_fee_ghs', s.vendor_annual_fee_ghs,
    'payment_instructions', s.vendor_payment_instructions,
    'phone', (select p.phone from public.vendor_private p where p.vendor_id = v.id),
    'email', (select p.email from public.vendor_private p where p.vendor_id = v.id),
    'review_note', (select p.review_note from public.vendor_private p where p.vendor_id = v.id),
    'owner_name', (select p.owner_name from public.vendor_private p where p.vendor_id = v.id),
    'id_type', (select p.id_type from public.vendor_private p where p.vendor_id = v.id)
  );
end;
$$;
