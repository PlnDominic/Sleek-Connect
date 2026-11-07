-- Storefront browsing and search (PRD FR-011 to FR-013), managed banners and collections (FR-010), prominent safety
-- warnings (FR-017), order lookup, returns (FR-053/054), the help centre with support cases (FR-055), and the store
-- settings staff can edit.

-- ---------------------------------------------------------------------------
-- Product attributes: filters, warnings and returnability
-- ---------------------------------------------------------------------------

alter table public.products
  -- Category-specific filters (FR-013): skin types for skincare, shades for makeup.
  add column skin_types text[] not null default '{}',
  add column shades text[] not null default '{}',
  -- Shown prominently above "Add to bag" and in the bag (FR-017), e.g. "Small parts. Not for children under 3."
  add column warning_label text,
  -- Whether customers may request a return, and the reason shown when they can't (FR-053).
  add column returnable boolean not null default true,
  add column return_note text;

create or replace function public.admin_save_product(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
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
  v_published boolean;
  v_skin_types text[] := array(select btrim(x) from jsonb_array_elements_text(
    case when jsonb_typeof(p -> 'skin_types') = 'array' then p -> 'skin_types' else '[]'::jsonb end) x where btrim(x) <> '');
  v_shades text[] := array(select btrim(x) from jsonb_array_elements_text(
    case when jsonb_typeof(p -> 'shades') = 'array' then p -> 'shades' else '[]'::jsonb end) x where btrim(x) <> '');
begin
  perform public.require_staff(array['catalogue']::public.staff_role[]);

  if v_name = '' or length(v_name) > 120 then
    raise exception 'Enter a product name (up to 120 characters).' using errcode = '22023';
  end if;

  v_slug := lower(btrim(coalesce(nullif(p ->> 'slug', ''), v_name)));
  v_slug := btrim(regexp_replace(regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g'), '-+', '-', 'g'), '-');
  if v_slug = '' then
    raise exception 'Enter a web address for the product.' using errcode = '22023';
  end if;
  if exists (select 1 from public.products x where x.slug = v_slug and x.id is distinct from v_id) then
    raise exception 'Another product already uses the web address "%".', v_slug using errcode = '22023';
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

  -- Sizes: unique codes, at most one default; the product price is the default size's price.
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
      slug, name, brand, department, category_id, kids_filter, collection, price_ghs, was_price_ghs, badge, tag,
      summary, image_key, tint, kind, details, ingredients, country_of_origin, regulatory_reference,
      period_after_opening, skin_types, shades, warning_label, returnable, return_note, is_published
    ) values (
      v_slug, v_name, nullif(btrim(p ->> 'brand'), ''), v_department, nullif(p ->> 'category_id', ''), v_kids_filter,
      null, v_price, v_was, nullif(btrim(p ->> 'badge'), ''), coalesce(btrim(p ->> 'tag'), ''),
      coalesce(btrim(p ->> 'summary'), ''), nullif(p ->> 'image_key', ''),
      coalesce(nullif(p ->> 'tint', ''), case when v_department = 'beauty' then '#F4E3D7' else '#E3F0EC' end),
      v_kind, v_details, nullif(btrim(p ->> 'ingredients'), ''), nullif(btrim(p ->> 'country_of_origin'), ''),
      nullif(btrim(p ->> 'regulatory_reference'), ''), nullif(btrim(p ->> 'period_after_opening'), ''),
      v_skin_types, v_shades, nullif(btrim(p ->> 'warning_label'), ''), coalesce((p ->> 'returnable')::boolean, true),
      nullif(btrim(p ->> 'return_note'), ''), false
    )
    returning id into v_id;
    perform public.audit('product.created', 'product', v_id::text, jsonb_build_object('slug', v_slug, 'price_ghs', v_price));
  else
    select * into v_before from public.products x where x.id = v_id for update;
    if not found then
      raise exception 'That product no longer exists.' using errcode = '22023';
    end if;
    update public.products x set
      slug = v_slug, name = v_name, brand = nullif(btrim(p ->> 'brand'), ''), department = v_department,
      category_id = nullif(p ->> 'category_id', ''), kids_filter = v_kids_filter, price_ghs = v_price,
      was_price_ghs = v_was, badge = nullif(btrim(p ->> 'badge'), ''), tag = coalesce(btrim(p ->> 'tag'), ''),
      summary = coalesce(btrim(p ->> 'summary'), ''), image_key = nullif(p ->> 'image_key', ''),
      tint = coalesce(nullif(p ->> 'tint', ''), x.tint), kind = v_kind,
      -- Keep content the form doesn't edit, such as the photo gallery.
      details = (coalesce(x.details, '{}'::jsonb) - array['description', 'highlights', 'freeFrom', 'recommendedAge',
                 'warnings', 'howToUse']) || v_details,
      ingredients = nullif(btrim(p ->> 'ingredients'), ''),
      country_of_origin = nullif(btrim(p ->> 'country_of_origin'), ''),
      regulatory_reference = nullif(btrim(p ->> 'regulatory_reference'), ''),
      period_after_opening = nullif(btrim(p ->> 'period_after_opening'), ''),
      skin_types = v_skin_types,
      shades = v_shades,
      warning_label = nullif(btrim(p ->> 'warning_label'), ''),
      returnable = coalesce((p ->> 'returnable')::boolean, true),
      return_note = nullif(btrim(p ->> 'return_note'), '')
    where x.id = v_id;
    if v_before.price_ghs is distinct from v_price or v_before.was_price_ghs is distinct from v_was then
      perform public.audit('product.price_changed', 'product', v_id::text, jsonb_build_object(
        'before', jsonb_build_object('price_ghs', v_before.price_ghs, 'was_price_ghs', v_before.was_price_ghs),
        'after', jsonb_build_object('price_ghs', v_price, 'was_price_ghs', v_was)));
    end if;
  end if;

  -- Sizes and the stock rows that go with them.
  delete from public.product_sizes s where s.product_id = v_id;
  insert into public.product_sizes (product_id, code, label, price_ghs, is_default, sort_order)
  select v_id, lower(btrim(s ->> 'code')), btrim(s ->> 'label'), (s ->> 'price_ghs')::numeric,
         ord = v_default_ord, (ord - 1)::smallint
  from jsonb_array_elements(v_sizes) with ordinality as e(s, ord);

  v_codes := coalesce(v_codes, array['']);
  foreach v_code in array v_codes loop
    insert into public.inventory_levels (product_id, size_code) values (v_id, v_code) on conflict do nothing;
  end loop;
  for v_code in
    select i.size_code from public.inventory_levels i where i.product_id = v_id and i.size_code <> all (v_codes)
  loop
    if exists (select 1 from public.inventory_levels i where i.product_id = v_id and i.size_code = v_code
                 and (i.on_hand <> 0 or i.reserved <> 0))
       or exists (select 1 from public.stock_batches b where b.product_id = v_id and b.size_code = v_code
                    and b.quantity > 0) then
      raise exception 'Size "%" still has stock. Write it off or sell it before removing the size.',
        coalesce(nullif(v_code, ''), 'one size') using errcode = '22023';
    end if;
    delete from public.inventory_levels i where i.product_id = v_id and i.size_code = v_code;
  end loop;

  delete from public.product_age_bands b where b.product_id = v_id;
  insert into public.product_age_bands (product_id, age_band_id)
  select v_id, band from jsonb_array_elements_text(v_bands) band
  where exists (select 1 from public.age_bands a where a.id = band)
  on conflict do nothing;

  -- Publishing (FR-100): only complete products go on the store.
  v_problems := public.product_publish_problems(v_id);
  v_published := v_publish and cardinality(v_problems) = 0;
  update public.products x set is_published = v_published where x.id = v_id and x.is_published <> v_published;
  if found then
    perform public.audit(case when v_published then 'product.published' else 'product.unpublished' end,
      'product', v_id::text, null);
  end if;

  return jsonb_build_object('id', v_id, 'slug', v_slug, 'published', v_published, 'problems', to_jsonb(v_problems));
end;
$$;

-- (grants on admin_save_product are unchanged)

-- The saved bag now carries each product's warning label.
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
  warning_label text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.slug, p.name, nullif(b.size_code, ''), s.label, coalesce(s.price_ghs, p.price_ghs),
         p.image_key, p.tint, p.kind, b.quantity, coalesce(i.in_stock, false), p.warning_label
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
-- Search with typo tolerance (FR-012)
-- ---------------------------------------------------------------------------

create extension if not exists pg_trgm with schema extensions;

-- Published products matching a query, best first. Trigram word similarity forgives typos ("vitamn serun").
create function public.search_products(p_query text, p_limit integer default 60)
returns table (slug text, score real)
language sql
stable
security definer
set search_path = ''
as $$
  with q as (
    select lower(btrim(regexp_replace(regexp_replace(coalesce(p_query, ''), '[%_\\]', '', 'g'), '\s+', ' ', 'g'))) as q
  ),
  scored as (
    select p.slug,
      greatest(
        extensions.word_similarity(q.q, lower(p.name)),
        extensions.word_similarity(q.q, lower(coalesce(p.brand, ''))) * 0.9,
        extensions.word_similarity(q.q, lower(coalesce(c.name, ''))) * 0.8,
        extensions.word_similarity(q.q, lower(concat_ws(' ', p.tag, p.summary, p.kids_filter::text, p.department::text,
          array_to_string(p.skin_types || p.shades, ' ')))) * 0.7
      )
      + case when position(q.q in lower(p.name)) > 0 then 0.5 else 0 end
      + case when lower(coalesce(p.brand, '')) = q.q then 0.3 else 0 end as score
    from public.products p
    left join public.categories c on c.id = p.category_id
    cross join q
    where p.is_published and length(q.q) >= 2
  )
  select s.slug, s.score::real from scored s
  where s.score >= 0.45
  order by s.score desc, s.slug
  limit greatest(1, least(p_limit, 200));
$$;

revoke all on function public.search_products(text, integer) from public;
grant execute on function public.search_products(text, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Banners and featured collections managed by staff (FR-010)
-- ---------------------------------------------------------------------------

create table public.banners (
  id uuid primary key default gen_random_uuid(),
  placement text not null check (placement in ('home_hero', 'home_promo')),
  kicker text,
  title text not null check (length(btrim(title)) > 0),
  body text,
  cta_label text,
  cta_href text check (cta_href is null or cta_href ~ '^(/([^/\\]|$)|https://)'),
  secondary_cta_label text,
  secondary_cta_href text check (secondary_cta_href is null or secondary_cta_href ~ '^(/([^/\\]|$)|https://)'),
  image_key text,
  -- Colour scheme of a promo card.
  theme text not null default 'light' check (theme in ('light', 'sale', 'gift')),
  -- Shows a live countdown to this time (e.g. the end of a sale).
  countdown_to timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create trigger banners_set_updated_at
  before update on public.banners
  for each row execute function public.set_updated_at();

alter table public.banners enable row level security;

create policy "Live banners are public" on public.banners
  for select to anon, authenticated
  using (is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));

create policy "Staff can read all banners" on public.banners
  for select to authenticated using ((select public.current_staff_role()) is not null);

create policy "Staff can read all merchandising" on public.merchandising_slots
  for select to authenticated using ((select public.current_staff_role()) is not null);

grant select on public.banners to anon, authenticated;

-- Creates or updates a banner. p: {id?, placement, kicker, title, body, cta_label, cta_href, secondary_cta_label,
-- secondary_cta_href, image_key, theme, countdown_to, starts_at, ends_at, sort_order, is_active}
create function public.admin_save_banner(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_href text := nullif(btrim(p ->> 'cta_href'), '');
  v_href2 text := nullif(btrim(p ->> 'secondary_cta_href'), '');
begin
  perform public.require_staff(array['catalogue']::public.staff_role[]);
  if coalesce(btrim(p ->> 'title'), '') = '' then
    raise exception 'Enter a title.' using errcode = '22023';
  end if;
  if (v_href is not null and v_href !~ '^(/([^/\\]|$)|https://)') or (v_href2 is not null and v_href2 !~ '^(/([^/\\]|$)|https://)') then
    -- "//host" and "/\host" would leave the site, so a page link must not start with them.
    raise exception 'Links must start with / (a page on this site) or https://.' using errcode = '22023';
  end if;
  if (nullif(p ->> 'cta_label', '') is null) <> (v_href is null) then
    raise exception 'A button needs both a label and a link.' using errcode = '22023';
  end if;

  begin
    if v_id is null then
      insert into public.banners (placement, kicker, title, body, cta_label, cta_href, secondary_cta_label,
        secondary_cta_href, image_key, theme, countdown_to, starts_at, ends_at, sort_order, is_active)
      values (p ->> 'placement', nullif(btrim(p ->> 'kicker'), ''), btrim(p ->> 'title'), nullif(btrim(p ->> 'body'), ''),
        nullif(btrim(p ->> 'cta_label'), ''), v_href, nullif(btrim(p ->> 'secondary_cta_label'), ''), v_href2,
        nullif(p ->> 'image_key', ''), coalesce(nullif(p ->> 'theme', ''), 'light'),
        nullif(p ->> 'countdown_to', '')::timestamptz, nullif(p ->> 'starts_at', '')::timestamptz,
        nullif(p ->> 'ends_at', '')::timestamptz, coalesce(nullif(p ->> 'sort_order', '')::integer, 0),
        coalesce((p ->> 'is_active')::boolean, true))
      returning id into v_id;
    else
      update public.banners b set
        placement = p ->> 'placement', kicker = nullif(btrim(p ->> 'kicker'), ''), title = btrim(p ->> 'title'),
        body = nullif(btrim(p ->> 'body'), ''), cta_label = nullif(btrim(p ->> 'cta_label'), ''), cta_href = v_href,
        secondary_cta_label = nullif(btrim(p ->> 'secondary_cta_label'), ''), secondary_cta_href = v_href2,
        image_key = nullif(p ->> 'image_key', ''), theme = coalesce(nullif(p ->> 'theme', ''), 'light'),
        countdown_to = nullif(p ->> 'countdown_to', '')::timestamptz,
        starts_at = nullif(p ->> 'starts_at', '')::timestamptz, ends_at = nullif(p ->> 'ends_at', '')::timestamptz,
        sort_order = coalesce(nullif(p ->> 'sort_order', '')::integer, 0),
        is_active = coalesce((p ->> 'is_active')::boolean, true)
      where b.id = v_id;
      if not found then
        raise exception 'That banner no longer exists.' using errcode = '22023';
      end if;
    end if;
  exception
    when check_violation then
      raise exception 'Check the placement, theme and dates (the end must be after the start).' using errcode = '22023';
    when invalid_datetime_format or invalid_text_representation then
      raise exception 'Check the dates and the order number.' using errcode = '22023';
  end;
  perform public.audit('banner.saved', 'banner', v_id::text, p - 'id');
  return v_id;
end;
$$;

revoke all on function public.admin_save_banner(jsonb) from public, anon;
grant execute on function public.admin_save_banner(jsonb) to authenticated;

create function public.admin_delete_banner(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['catalogue']::public.staff_role[]);
  delete from public.banners b where b.id = p_id;
  perform public.audit('banner.deleted', 'banner', p_id::text, null);
end;
$$;

revoke all on function public.admin_delete_banner(uuid) from public, anon;
grant execute on function public.admin_delete_banner(uuid) to authenticated;

-- Replaces a featured collection with these products, in this order.
create function public.admin_set_collection(p_slot text, p_slugs text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unknown text;
begin
  perform public.require_staff(array['catalogue']::public.staff_role[]);
  if p_slot not in ('home_hero', 'home_new_arrivals', 'home_best_sellers', 'product_related',
                    'app_new_arrivals_beauty', 'app_new_arrivals_kids') then
    raise exception 'Unknown collection %.', p_slot using errcode = '22023';
  end if;
  select s into v_unknown from unnest(p_slugs) s where not exists (select 1 from public.products p where p.slug = s) limit 1;
  if v_unknown is not null then
    raise exception 'No product has the web address "%".', v_unknown using errcode = '22023';
  end if;
  delete from public.merchandising_slots m where m.slot = p_slot;
  insert into public.merchandising_slots (slot, product_id, position)
  select p_slot, p.id, min(e.ord)::smallint
  from unnest(p_slugs) with ordinality as e(slug, ord)
  join public.products p on p.slug = e.slug
  group by p.id;
  perform public.audit('collection.saved', 'collection', p_slot, jsonb_build_object('products', to_jsonb(p_slugs)));
end;
$$;

revoke all on function public.admin_set_collection(text, text[]) from public, anon;
grant execute on function public.admin_set_collection(text, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Store settings: support contacts and the return window, editable by admins
-- ---------------------------------------------------------------------------

alter table public.store_settings
  add column return_window_days integer not null default 7 check (return_window_days between 1 and 90),
  add column support_phone text,
  add column support_whatsapp text,
  add column support_email text,
  add column support_hours text;

-- Updates the settings named in p (only those keys). Admins only; recorded in the audit log.
create function public.admin_update_settings(p jsonb)
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
      support_hours = case when p ? 'support_hours' then nullif(btrim(p ->> 'support_hours'), '') else s.support_hours end
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

-- ---------------------------------------------------------------------------
-- Customer messages for returns and support cases
-- ---------------------------------------------------------------------------

-- Queues an SMS (and an email when there is an address) for a customer.
create function public.queue_customer_message(
  p_order_id uuid,
  p_template text,
  p_phone text,
  p_email text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(btrim(p_phone), '') <> '' then
    insert into public.notifications (order_id, template, channel, recipient, payload)
    values (p_order_id, p_template, 'sms', btrim(p_phone), p_payload);
  end if;
  if coalesce(btrim(p_email), '') <> '' then
    insert into public.notifications (order_id, template, channel, recipient, payload)
    values (p_order_id, p_template, 'email', btrim(p_email), p_payload);
  end if;
end;
$$;

revoke all on function public.queue_customer_message(uuid, text, text, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Finding an order without the link (for "Track an order")
-- ---------------------------------------------------------------------------

-- Failed order lookups, to slow down guessing. Only find_order uses it (no policies or grants).
create table public.order_lookup_failures (
  key text not null,
  at timestamptz not null default now()
);

create index order_lookup_failures_key_idx on public.order_lookup_failures (key, at);
alter table public.order_lookup_failures enable row level security;

-- The order-page token for an order number, if the phone number matches the one on the order. After 8 misses in an
-- hour for the same phone or order number it stops answering until the hour has passed.
create function public.find_order(p_order_number text, p_phone text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number text := upper(btrim(coalesce(p_order_number, '')));
  v_digits text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9);
  v_token uuid;
begin
  if v_number = '' or length(v_digits) < 9 then
    return null;
  end if;
  if (select count(*) from public.order_lookup_failures f
      where f.key = 'phone:' || v_digits and f.at > now() - interval '1 hour') >= 8
     or (select count(*) from public.order_lookup_failures f
         where f.key = 'order:' || v_number and f.at > now() - interval '1 hour') >= 8 then
    return null;
  end if;
  select o.public_token into v_token
  from public.orders o
  where o.order_number = v_number and right(regexp_replace(o.phone, '\D', '', 'g'), 9) = v_digits;
  if v_token is null then
    delete from public.order_lookup_failures f where f.at < now() - interval '1 day';
    insert into public.order_lookup_failures (key) values ('phone:' || v_digits), ('order:' || v_number);
  end if;
  return v_token;
end;
$$;

revoke all on function public.find_order(text, text) from public;
grant execute on function public.find_order(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Returns (FR-053, FR-054)
-- ---------------------------------------------------------------------------

create sequence public.return_number_seq start 1001;
create type public.return_status as enum ('requested', 'approved', 'rejected', 'received', 'refunded');
create type public.return_reason as enum (
  'damaged', 'wrong_item', 'not_as_described', 'expired_or_near_expiry', 'changed_mind', 'other'
);
create type public.return_outcome as enum ('restock', 'quarantine', 'write_off');

create table public.return_requests (
  id uuid primary key default gen_random_uuid(),
  case_number text not null unique default ('RT-' || nextval('public.return_number_seq')),
  order_id uuid not null references public.orders (id) on delete cascade,
  status public.return_status not null default 'requested',
  reason public.return_reason not null,
  details text check (details is null or length(details) <= 2000),
  -- Paths in the private return-photos storage bucket.
  photo_paths text[] not null default '{}',
  decision_note text,
  decided_at timestamptz,
  decided_by text,
  received_at timestamptz,
  received_by text,
  refund_amount_ghs numeric(10, 2),
  refunded_at timestamptz,
  refund_reference text,
  created_at timestamptz not null default now()
);

create index return_requests_order_idx on public.return_requests (order_id);
create index return_requests_status_idx on public.return_requests (status, created_at);

create table public.return_items (
  return_id uuid not null references public.return_requests (id) on delete cascade,
  order_item_id uuid not null references public.order_items (id),
  quantity integer not null check (quantity > 0),
  -- What happened to the units after inspection.
  outcome public.return_outcome,
  primary key (return_id, order_item_id)
);

alter table public.return_requests enable row level security;
alter table public.return_items enable row level security;

create policy "Staff can read returns" on public.return_requests
  for select to authenticated using ((select public.current_staff_role()) is not null);
create policy "Staff can read returned items" on public.return_items
  for select to authenticated using ((select public.current_staff_role()) is not null);

grant select on public.return_requests, public.return_items to authenticated;

-- Photos customers attach to a return. Private: only staff can view them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('return-photos', 'return-photos', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;

-- Customers upload return photos into a folder named after a hash of their order token, so staff (who can read the
-- photo paths) never learn the token itself.
create function public.return_photo_folder(p_order_token uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(p_order_token::text, 'UTF8')), 'hex');
$$;

revoke all on function public.return_photo_folder(uuid) from public, anon, authenticated;

-- A customer may upload into their order's folder while the order can still be returned, up to 10 files per order.
create function public.can_upload_return_photo(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.orders o cross join public.store_settings s
    where o.status = 'delivered'
      and o.delivered_at + make_interval(days => s.return_window_days) > now()
      and public.return_photo_folder(o.public_token) = split_part(p_name, '/', 1)
  )
  and (select count(*) from storage.objects so
       where so.bucket_id = 'return-photos' and split_part(so.name, '/', 1) = split_part(p_name, '/', 1)) < 10;
$$;

revoke all on function public.can_upload_return_photo(text) from public;
grant execute on function public.can_upload_return_photo(text) to anon, authenticated;

create policy "Customers can attach photos to a return" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'return-photos' and public.can_upload_return_photo(name));

create policy "Staff can view return photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'return-photos' and (select public.current_staff_role()) is not null);

-- Creates a return case for a delivered order. p_items: [{order_item_id, quantity}]. Returns the case number.
create function public.request_return(
  p_order_token uuid,
  p_items jsonb,
  p_reason public.return_reason,
  p_details text default null,
  p_photo_paths text[] default '{}'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_window integer;
  v_return public.return_requests%rowtype;
  v_item jsonb;
  v_line record;
  v_qty integer;
  v_path text;
begin
  select * into v_order from public.orders o where o.public_token = p_order_token for update;
  if not found then
    raise exception 'We couldn''t find that order.' using errcode = '22023';
  end if;
  select s.return_window_days into v_window from public.store_settings s;
  if v_order.status <> 'delivered' or v_order.delivered_at is null then
    raise exception 'Returns can be requested once the order has been delivered.' using errcode = '22023';
  end if;
  if v_order.delivered_at + make_interval(days => v_window) <= now() then
    raise exception 'The return window for this order closed on %.',
      to_char((v_order.delivered_at + make_interval(days => v_window)) at time zone 'Africa/Accra', 'FMDD Mon YYYY')
      using errcode = '22023';
  end if;
  if p_reason is null then
    raise exception 'Choose a reason for the return.' using errcode = '22023';
  end if;
  if p_reason = 'other' and coalesce(btrim(p_details), '') = '' then
    raise exception 'Tell us what''s wrong.' using errcode = '22023';
  end if;
  if length(coalesce(p_details, '')) > 2000 then
    raise exception 'Keep the details under 2,000 characters.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Choose at least one item to return.' using errcode = '22023';
  end if;
  if cardinality(coalesce(p_photo_paths, '{}')) > 3 then
    raise exception 'Attach up to 3 photos.' using errcode = '22023';
  end if;
  foreach v_path in array coalesce(p_photo_paths, '{}') loop
    if split_part(v_path, '/', 1) <> public.return_photo_folder(p_order_token)
       or not exists (select 1 from storage.objects so where so.bucket_id = 'return-photos' and so.name = v_path) then
      raise exception 'One of the photos didn''t upload. Please add it again.' using errcode = '22023';
    end if;
  end loop;
  if (select count(*) from public.return_requests r where r.order_id = v_order.id) >= 5 then
    raise exception 'This order already has several return requests. Please contact us instead.' using errcode = '22023';
  end if;

  insert into public.return_requests (order_id, reason, details, photo_paths)
  values (v_order.id, p_reason, nullif(btrim(p_details), ''), coalesce(p_photo_paths, '{}'))
  returning * into v_return;

  for v_item in select * from jsonb_array_elements(p_items) loop
    begin
      v_qty := (v_item ->> 'quantity')::integer;
    exception when invalid_text_representation then
      v_qty := null;
    end;
    select oi.id, oi.product_name, oi.quantity, coalesce(p.returnable, true) as returnable,
           coalesce((select sum(ri.quantity) from public.return_items ri join public.return_requests r on r.id = ri.return_id
                     where ri.order_item_id = oi.id and r.status <> 'rejected'), 0)::integer as already
    into v_line
    from public.order_items oi left join public.products p on p.id = oi.product_id
    where oi.order_id = v_order.id and oi.id::text = v_item ->> 'order_item_id';
    if not found then
      raise exception 'That item isn''t part of this order.' using errcode = '22023';
    end if;
    -- Items that can't be returned (e.g. opened cosmetics) still can when we got it wrong.
    if not v_line.returnable and p_reason not in ('damaged', 'wrong_item', 'expired_or_near_expiry') then
      raise exception '% can only be returned if it arrived damaged, wrong or expired.', v_line.product_name
        using errcode = '22023';
    end if;
    if v_qty is null or v_qty < 1 or v_qty > v_line.quantity - v_line.already then
      raise exception 'You can return up to % of %.', greatest(v_line.quantity - v_line.already, 0), v_line.product_name
        using errcode = '22023';
    end if;
    insert into public.return_items (return_id, order_item_id, quantity) values (v_return.id, v_line.id, v_qty);
  end loop;

  perform public.queue_customer_message(v_order.id, 'return_requested', v_order.phone,
    (select u.email from auth.users u where u.id = v_order.user_id),
    jsonb_build_object('case_number', v_return.case_number, 'order_number', v_order.order_number,
      'customer_name', v_order.customer_name, 'order_token', v_order.public_token));
  return v_return.case_number;
end;
$$;

revoke all on function public.request_return(uuid, jsonb, public.return_reason, text, text[]) from public;
grant execute on function public.request_return(uuid, jsonb, public.return_reason, text, text[]) to anon, authenticated;

-- Message helper for return decisions.
create function public.queue_return_message(p_return_id uuid, p_template text)
returns void
language sql
security definer
set search_path = ''
as $$
  select public.queue_customer_message(o.id, p_template, o.phone,
    (select u.email from auth.users u where u.id = o.user_id),
    jsonb_build_object('case_number', r.case_number, 'order_number', o.order_number, 'customer_name', o.customer_name,
      'order_token', o.public_token, 'note', r.decision_note, 'refund_amount_ghs', r.refund_amount_ghs))
  from public.return_requests r join public.orders o on o.id = r.order_id
  where r.id = p_return_id;
$$;

revoke all on function public.queue_return_message(uuid, text) from public, anon, authenticated;

-- Approves or rejects a return request. A rejection needs a note, which the customer sees.
create function public.admin_decide_return(p_return_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.return_status;
begin
  perform public.require_staff(array['support', 'operations']::public.staff_role[]);
  select r.status into v_status from public.return_requests r where r.id = p_return_id for update;
  if not found then
    raise exception 'That return no longer exists.' using errcode = '22023';
  end if;
  if v_status <> 'requested' then
    raise exception 'This return has already been %.', v_status using errcode = '22023';
  end if;
  if not p_approve and coalesce(btrim(p_note), '') = '' then
    raise exception 'Tell the customer why the return was declined.' using errcode = '22023';
  end if;
  update public.return_requests r
  set status = case when p_approve then 'approved' else 'rejected' end::public.return_status,
      decision_note = nullif(btrim(p_note), ''), decided_at = now(), decided_by = auth.jwt() ->> 'email'
  where r.id = p_return_id;
  perform public.queue_return_message(p_return_id, case when p_approve then 'return_approved' else 'return_rejected' end);
  perform public.audit(case when p_approve then 'return.approved' else 'return.rejected' end, 'return',
    p_return_id::text, jsonb_build_object('note', nullif(btrim(p_note), '')));
end;
$$;

revoke all on function public.admin_decide_return(uuid, boolean, text) from public, anon;
grant execute on function public.admin_decide_return(uuid, boolean, text) to authenticated;

-- Records the returned goods after inspection. p_outcomes: [{order_item_id, outcome}] where outcome is restock
-- (back into the batch it was packed from), quarantine (held in a quarantined batch) or write_off.
-- Sets the refund due: the returned items' prices (delivery isn't refunded).
create function public.admin_receive_return(p_return_id uuid, p_outcomes jsonb, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_return public.return_requests%rowtype;
  v_item record;
  v_outcome public.return_outcome;
  v_left integer;
  v_alloc record;
  v_take integer;
  v_batch public.stock_batches%rowtype;
  v_note text;
begin
  perform public.require_staff(array['operations']::public.staff_role[]);
  select * into v_return from public.return_requests r where r.id = p_return_id for update;
  if not found then
    raise exception 'That return no longer exists.' using errcode = '22023';
  end if;
  if v_return.status <> 'approved' then
    raise exception 'Only approved returns can be received (this one is %).', v_return.status using errcode = '22023';
  end if;
  v_note := 'Return ' || v_return.case_number || coalesce(': ' || nullif(btrim(p_note), ''), '');

  for v_item in
    select ri.order_item_id, ri.quantity, oi.product_id, coalesce(oi.size_code, '') as size_code
    from public.return_items ri join public.order_items oi on oi.id = ri.order_item_id
    where ri.return_id = p_return_id
  loop
    begin
      v_outcome := (select o ->> 'outcome' from jsonb_array_elements(p_outcomes) o
                    where o ->> 'order_item_id' = v_item.order_item_id::text limit 1)::public.return_outcome;
    exception when invalid_text_representation then
      v_outcome := null;
    end;
    if v_outcome is null then
      raise exception 'Choose what happens to every returned item.' using errcode = '22023';
    end if;
    update public.return_items ri set outcome = v_outcome
    where ri.return_id = p_return_id and ri.order_item_id = v_item.order_item_id;

    if v_outcome = 'write_off' or v_item.product_id is null then
      continue;
    end if;

    -- Put the units back with the batches they were packed from (latest expiry first).
    v_left := v_item.quantity;
    for v_alloc in
      select b.id, b.batch_code, b.expires_on, b.status, ab.quantity
      from public.order_item_batches ab join public.stock_batches b on b.id = ab.batch_id
      where ab.order_item_id = v_item.order_item_id
      order by b.expires_on desc nulls first
    loop
      exit when v_left = 0;
      v_take := least(v_left, v_alloc.quantity);
      if v_outcome = 'restock' then
        update public.stock_batches b set quantity = b.quantity + v_take where b.id = v_alloc.id;
        update public.inventory_levels i
        set on_hand = i.on_hand + case when v_alloc.status = 'available' then v_take else 0 end
        where i.product_id = v_item.product_id and i.size_code = v_item.size_code;
        perform public.log_stock_movement(v_item.product_id, v_item.size_code, v_alloc.id, 'returned', v_take,
          case when v_alloc.status = 'available' then v_take else 0 end, v_return.order_id, v_note);
      else
        -- Quarantine: a held-aside batch next to the original, off sale until someone releases or writes it off.
        select * into v_batch from public.stock_batches b
        where b.product_id = v_item.product_id and b.size_code = v_item.size_code
          and b.batch_code = v_alloc.batch_code || '-RET';
        if not found then
          insert into public.stock_batches (product_id, size_code, batch_code, expires_on, quantity, status, note)
          values (v_item.product_id, v_item.size_code, v_alloc.batch_code || '-RET', v_alloc.expires_on, 0, 'quarantined',
                  'Returned goods held for inspection')
          returning * into v_batch;
        elsif v_batch.status = 'available' then
          update public.stock_batches b set status = 'quarantined' where b.id = v_batch.id;
          update public.inventory_levels i set on_hand = i.on_hand - v_batch.quantity
          where i.product_id = v_item.product_id and i.size_code = v_item.size_code;
          perform public.log_stock_movement(v_item.product_id, v_item.size_code, v_batch.id, 'quarantined', 0,
            -v_batch.quantity, null, v_note);
        end if;
        update public.stock_batches b set quantity = b.quantity + v_take where b.id = v_batch.id;
        perform public.log_stock_movement(v_item.product_id, v_item.size_code, v_batch.id, 'returned', v_take, 0,
          v_return.order_id, v_note);
      end if;
      v_left := v_left - v_take;
    end loop;

    -- Orders packed before batches were tracked: the units go back on sale (restock) or are just recorded.
    if v_left > 0 and v_outcome = 'restock' then
      update public.inventory_levels i set on_hand = i.on_hand + v_left
      where i.product_id = v_item.product_id and i.size_code = v_item.size_code;
      perform public.log_stock_movement(v_item.product_id, v_item.size_code, null, 'restocked', 0, v_left,
        v_return.order_id, v_note);
    end if;
  end loop;

  update public.return_requests r
  set status = 'received', received_at = now(), received_by = auth.jwt() ->> 'email',
      refund_amount_ghs = (select coalesce(sum(oi.unit_price_ghs * ri.quantity), 0)
                           from public.return_items ri join public.order_items oi on oi.id = ri.order_item_id
                           where ri.return_id = p_return_id)
  where r.id = p_return_id;
  perform public.queue_return_message(p_return_id, 'return_received');
  perform public.audit('return.received', 'return', p_return_id::text, jsonb_build_object('outcomes', p_outcomes));
end;
$$;

revoke all on function public.admin_receive_return(uuid, jsonb, text) from public, anon;
grant execute on function public.admin_receive_return(uuid, jsonb, text) to authenticated;

-- Records that the refund for a received return was paid (outside the system, for now).
create function public.admin_mark_return_refunded(p_return_id uuid, p_reference text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['finance', 'operations']::public.staff_role[]);
  if coalesce(btrim(p_reference), '') = '' then
    raise exception 'Enter the refund reference (e.g. the Mobile Money transaction ID).' using errcode = '22023';
  end if;
  update public.return_requests r
  set status = 'refunded', refunded_at = now(), refund_reference = btrim(p_reference)
  where r.id = p_return_id and r.status = 'received';
  if not found then
    raise exception 'Only received returns can be marked as refunded.' using errcode = '22023';
  end if;
  perform public.queue_return_message(p_return_id, 'return_refunded');
  perform public.audit('return.refunded', 'return', p_return_id::text, jsonb_build_object('reference', btrim(p_reference)));
end;
$$;

revoke all on function public.admin_mark_return_refunded(uuid, text) from public, anon;
grant execute on function public.admin_mark_return_refunded(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Help centre: support cases (FR-055)
-- ---------------------------------------------------------------------------

create sequence public.support_case_seq start 1001;
create type public.support_topic as enum (
  'delivery', 'damaged_or_wrong', 'payment', 'product_question', 'account', 'other'
);
create type public.support_status as enum ('open', 'answered', 'closed');

create table public.support_cases (
  id uuid primary key default gen_random_uuid(),
  case_number text not null unique default ('CS-' || nextval('public.support_case_seq')),
  order_id uuid references public.orders (id) on delete set null,
  -- What the customer typed as the order number when it couldn't be matched.
  order_reference text,
  topic public.support_topic not null,
  name text not null,
  phone text not null,
  email text,
  message text not null check (length(message) <= 2000),
  status public.support_status not null default 'open',
  staff_reply text,
  replied_at timestamptz,
  replied_by text,
  created_at timestamptz not null default now()
);

create index support_cases_status_idx on public.support_cases (status, created_at);
create index support_cases_created_idx on public.support_cases (created_at);

alter table public.support_cases enable row level security;

create policy "Staff can read support cases" on public.support_cases
  for select to authenticated using ((select public.current_staff_role()) is not null);

grant select on public.support_cases to authenticated;

-- Opens a support case. The order is linked from the order-page token, or from an order number whose phone matches.
-- Returns the case number.
create function public.create_support_case(
  p_topic public.support_topic,
  p_name text,
  p_phone text,
  p_message text,
  p_email text default null,
  p_order_token uuid default null,
  p_order_number text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_case public.support_cases%rowtype;
  v_digits text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9);
  v_recent integer;
begin
  if p_topic is null then
    raise exception 'Choose what your message is about.' using errcode = '22023';
  end if;
  if coalesce(btrim(p_name), '') = '' or length(p_name) > 120 then
    raise exception 'Enter your name.' using errcode = '22023';
  end if;
  if length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) not between 9 and 15 then
    raise exception 'Enter a phone number we can reach you on.' using errcode = '22023';
  end if;
  if p_email is not null and btrim(p_email) <> '' and btrim(p_email) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Check the email address.' using errcode = '22023';
  end if;
  if coalesce(btrim(p_message), '') = '' or length(p_message) > 2000 then
    raise exception 'Write your message (up to 2,000 characters).' using errcode = '22023';
  end if;
  select count(*) into v_recent from public.support_cases c
  where c.created_at > now() - interval '1 hour' and right(regexp_replace(c.phone, '\D', '', 'g'), 9) = v_digits;
  if v_recent >= 3 then
    raise exception 'You''ve sent us several messages in the last hour. We''ll reply to those first.' using errcode = '22023';
  end if;

  if p_order_token is not null then
    select o.id into v_order_id from public.orders o where o.public_token = p_order_token;
  elsif coalesce(btrim(p_order_number), '') <> '' then
    select o.id into v_order_id from public.orders o where o.public_token = public.find_order(p_order_number, p_phone);
  end if;

  insert into public.support_cases (order_id, order_reference, topic, name, phone, email, message)
  values (v_order_id, case when v_order_id is null then nullif(btrim(p_order_number), '') end, p_topic,
          btrim(p_name), btrim(p_phone), nullif(btrim(p_email), ''), btrim(p_message))
  returning * into v_case;

  -- Acknowledge the first case from a phone each hour, and no more than 60 an hour in all, so the form can't be used
  -- to send messages to someone else's phone. The case number is shown on screen either way.
  if v_recent = 0 and (select count(*) from public.support_cases c where c.created_at > now() - interval '1 hour') <= 60 then
    perform public.queue_customer_message(v_order_id, 'support_received', v_case.phone, v_case.email,
      jsonb_build_object('case_number', v_case.case_number, 'customer_name', v_case.name));
  end if;
  return v_case.case_number;
end;
$$;

revoke all on function public.create_support_case(public.support_topic, text, text, text, text, uuid, text) from public;
grant execute on function public.create_support_case(public.support_topic, text, text, text, text, uuid, text)
  to anon, authenticated;

-- Replies to a case (the customer gets the reply by SMS/email) and optionally closes it.
create function public.admin_reply_support_case(p_case_id uuid, p_reply text, p_close boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.support_cases%rowtype;
begin
  perform public.require_staff(array['support', 'operations']::public.staff_role[]);
  select * into v_case from public.support_cases c where c.id = p_case_id for update;
  if not found then
    raise exception 'That case no longer exists.' using errcode = '22023';
  end if;
  if coalesce(btrim(p_reply), '') = '' and not p_close then
    raise exception 'Write a reply, or close the case.' using errcode = '22023';
  end if;
  update public.support_cases c
  set staff_reply = coalesce(nullif(btrim(p_reply), ''), c.staff_reply),
      replied_at = case when coalesce(btrim(p_reply), '') <> '' then now() else c.replied_at end,
      replied_by = case when coalesce(btrim(p_reply), '') <> '' then auth.jwt() ->> 'email' else c.replied_by end,
      status = case when p_close then 'closed' else 'answered' end::public.support_status
  where c.id = p_case_id;
  if coalesce(btrim(p_reply), '') <> '' then
    perform public.queue_customer_message(v_case.order_id, 'support_reply', v_case.phone, v_case.email,
      jsonb_build_object('case_number', v_case.case_number, 'customer_name', v_case.name, 'note', btrim(p_reply)));
  end if;
  perform public.audit(case when p_close then 'support.closed' else 'support.replied' end, 'support_case',
    p_case_id::text, null);
end;
$$;

revoke all on function public.admin_reply_support_case(uuid, text, boolean) from public, anon;
grant execute on function public.admin_reply_support_case(uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- The customer's order page now also shows returns, warnings and what can be returned
-- ---------------------------------------------------------------------------

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
        'size_label', i.size_label,
        'quantity', i.quantity,
        'unit_price_ghs', i.unit_price_ghs,
        'line_total_ghs', i.line_total_ghs,
        'image_key', p.image_key,
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

-- (grants on get_order are unchanged)

-- ---------------------------------------------------------------------------
-- Starter content: the home page as designed, now editable in the admin console
-- ---------------------------------------------------------------------------

insert into public.banners (placement, kicker, title, body, cta_label, cta_href, secondary_cta_label, secondary_cta_href,
                            image_key, theme, sort_order)
select * from (values
  ('home_hero', 'Trending now', E'Glow Products\nYou''ll Love',
   E'Authentic beauty and safe picks for little ones,\ncurated for modern families in Ghana.',
   'Shop Now', '/shop?sort=newest', 'Shop Baby & Kids', '/shop/kids', 'heroModel', 'light', 0),
  ('home_promo', 'Flash Sale', 'Up To [X]% Off', null, 'Shop Sale Now', '/shop?sale=1', null, null,
   'flashSale', 'sale', 0),
  ('home_promo', 'New Collection', 'Gift Season 2026', 'Wrapped gift sets for her, for him and for little ones.',
   'Shop Collection', '/products/newborn-gift-hamper', null, null, 'giftCollection', 'gift', 1)
) as v
where not exists (select 1 from public.banners);

-- The products floating around the hero image (existing stores; new ones get them from the seed).
insert into public.merchandising_slots (slot, product_id, position)
select 'home_hero', p.id, (e.ord - 1)::smallint
from unnest(array['vitamin-c-brightening-serum', 'whipped-shea-body-butter', 'velvet-matte-lip-colour',
                  'gentle-baby-wash-shampoo']) with ordinality as e(slug, ord)
join public.products p on p.slug = e.slug
on conflict do nothing;
