-- Suppliers: vendors that the owner creates and manages (no sign-in of their own).
-- ---------------------------------------------------------------------------
-- The shopper pays Sleek Connect, which buys the goods from the supplier at the supplier's price and sells them at that price plus the owner's
-- markup (the pricing the marketplace already had). Staff add the supplier, enter their products, prices and stock, approve each product
-- with its markup, collect the goods, and pay the supplier for what was delivered. Suppliers have no account, no store fee and no dashboard.
-- Sellers opening their own stores is switched off by default (store_settings.vendor_accounts_open) and can be switched on again later.

alter table public.vendors add column is_supplier boolean not null default false;
alter table public.store_settings add column vendor_accounts_open boolean not null default false;

-- A supplier is always open for business: there is no yearly fee. Everything else is as before.
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
        v.is_house or v.is_supplier
        or exists (
          select 1 from public.vendor_subscriptions s
          where s.vendor_id = v.id and s.starts_on <= current_date
            and s.ends_on + (select st.vendor_grace_days from public.store_settings st) >= current_date
        )
      )
  );
$$;

-- New seller accounts are refused while vendor_accounts_open is off.
create or replace function public.vendor_apply(p_name text, p_owner_name text, p_email text, p_phone text, p_id_type text, p_id_number text, p_id_path text, p_tagline text DEFAULT NULL::text, p_accept_terms boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v_user uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_owner text := btrim(coalesce(p_owner_name, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_base text;
  v_slug text;
  v_try integer := 1;
  v_id uuid;
begin
  if not coalesce((select st.vendor_accounts_open from public.store_settings st), false) then
    raise exception 'We are not opening new seller accounts right now. To supply us, get in touch through the Contact page.' using errcode = '42501';
  end if;
  if v_user is null or auth.jwt() ->> 'email' is null then
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
  if length(v_owner) < 2 or length(v_owner) > 80 then
    raise exception 'Enter your full name as it appears on your ID.' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 200 then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_phone, ''))) < 7 then
    raise exception 'Enter a phone number we can reach you on.' using errcode = '22023';
  end if;
  if p_id_type is null or p_id_type not in ('ghana_card', 'passport', 'voters_id', 'drivers_license') then
    raise exception 'Choose the type of ID you are submitting.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_id_number, ''))) < 5 or length(btrim(p_id_number)) > 30 then
    raise exception 'Enter your ID number.' using errcode = '22023';
  end if;
  if split_part(coalesce(p_id_path, ''), '/', 1) <> v_user::text
     or not exists (select 1 from storage.objects o where o.bucket_id = 'vendor-ids' and o.name = p_id_path) then
    raise exception 'Upload a photo or scan of your ID.' using errcode = '22023';
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
  insert into public.vendor_private (vendor_id, phone, email, terms_accepted_at, owner_name, id_type, id_number, id_document_path)
  values (v_id, btrim(p_phone), v_email, now(), v_owner, p_id_type, btrim(p_id_number), p_id_path);
  perform public.audit('vendor.applied', 'vendor', v_id::text, jsonb_build_object('slug', v_slug));
  perform public.queue_vendor_message(v_id, 'vendor_application_received', '{}'::jsonb);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- The vendor functions, split so staff can do the same work for a supplier. The internal functions take the vendor row; the vendor_*
-- functions look up the signed-in vendor and call them, exactly as before.
-- ---------------------------------------------------------------------------

create function public.write_vendor_product(v public.vendors, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
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
revoke all on function public.write_vendor_product(public.vendors, jsonb) from public, anon, authenticated;

create function public.set_vendor_stock(v public.vendors, p_product_id uuid, p_size_code text, p_quantity integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
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
revoke all on function public.set_vendor_stock(public.vendors, uuid, text, integer) from public, anon, authenticated;

create function public.delete_vendor_product(v public.vendors, p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
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
revoke all on function public.delete_vendor_product(public.vendors, uuid) from public, anon, authenticated;

create function public.list_vendor_products(v public.vendors)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'slug', p.slug, 'name', p.name, 'brand', p.brand, 'department', p.department, 'kind', p.kind,
      'category_id', p.category_id, 'summary', p.summary, 'details', p.details, 'kids_filter', p.kids_filter,
      'ingredients', p.ingredients, 'country_of_origin', p.country_of_origin,
      'regulatory_reference', p.regulatory_reference, 'period_after_opening', p.period_after_opening,
      'returnable', p.returnable, 'return_note', p.return_note,
      'age_bands', coalesce((select jsonb_agg(b.age_band_id) from public.product_age_bands b where b.product_id = p.id), '[]'::jsonb),
      'review_status', p.review_status, 'review_note', p.review_note, 'publish_requested', p.publish_requested,
      'is_published', p.is_published, 'vendor_price_ghs', p.vendor_price_ghs, 'vendor_was_price_ghs', p.vendor_was_price_ghs,
      'markup_percent', case when p.review_status = 'approved' then p.markup_percent end,
      'shopper_price_ghs', case when p.review_status = 'approved' then p.price_ghs end,
      'problems', to_jsonb(public.product_publish_problems(p.id)),
      -- Stock of a product sold in one size only (no size rows).
      'one_size_stock', (select il.on_hand - il.reserved from public.inventory_levels il where il.product_id = p.id and il.size_code = ''),
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
revoke all on function public.list_vendor_products(public.vendors) from public, anon, authenticated;

create or replace function public.vendor_save_product(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return public.write_vendor_product(public.vendor_require_approved(), p);
end;
$$;

create or replace function public.vendor_set_stock(p_product_id uuid, p_size_code text, p_quantity integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.set_vendor_stock(public.vendor_require_approved(), p_product_id, p_size_code, p_quantity);
end;
$$;

create or replace function public.vendor_delete_product(p_product_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.delete_vendor_product(public.vendor_require_approved(), p_product_id);
end;
$$;

create or replace function public.vendor_my_products()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  return public.list_vendor_products(public.vendor_require_own());
end;
$$;


-- ---------------------------------------------------------------------------
-- Staff functions for suppliers
-- ---------------------------------------------------------------------------

-- The supplier row, or an error: staff manage suppliers only (never a seller's own store, never the house range).
create function public.supplier_require(p_vendor_id uuid)
returns public.vendors
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.vendors;
begin
  select * into v from public.vendors x where x.id = p_vendor_id and x.is_supplier;
  if not found then
    raise exception 'That supplier doesn''t exist.' using errcode = '22023';
  end if;
  return v;
end;
$$;

revoke all on function public.supplier_require(uuid) from public, anon, authenticated;

-- The details a supplier record holds, checked and written. p: {name, tagline, description, contact_name, phone, email,
-- business_type, legal_name, tin, business_registration, payout_network, payout_wallet, payout_name}
create function public.write_supplier_details(p_vendor_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact text := nullif(btrim(coalesce(p ->> 'contact_name', '')), '');
  v_phone text := nullif(btrim(coalesce(p ->> 'phone', '')), '');
  v_email text := nullif(btrim(coalesce(p ->> 'email', '')), '');
  v_network text := nullif(btrim(coalesce(p ->> 'payout_network', '')), '');
  v_wallet text := regexp_replace(coalesce(p ->> 'payout_wallet', ''), '[^0-9+]', '', 'g');
  v_pname text := nullif(btrim(coalesce(p ->> 'payout_name', '')), '');
begin
  if v_contact is not null and length(v_contact) not between 2 and 80 then
    raise exception 'The contact person''s name is 2 to 80 characters.' using errcode = '22023';
  end if;
  if v_email is not null and v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;
  if v_phone is not null and regexp_replace(v_phone, '\D', '', 'g') !~ '^\d{9,15}$' then
    raise exception 'Enter a valid phone number.' using errcode = '22023';
  end if;
  if v_wallet <> '' then
    if v_network is null or v_network not in ('mtn', 'telecel', 'at') then
      raise exception 'Choose the Mobile Money network for the payout number.' using errcode = '22023';
    end if;
    if length(v_wallet) < 9 or length(v_wallet) > 14 then
      raise exception 'Enter a valid Mobile Money number.' using errcode = '22023';
    end if;
    if v_pname is null or length(v_pname) < 2 then
      raise exception 'Enter the name registered on that wallet.' using errcode = '22023';
    end if;
  end if;
  update public.vendor_private pr
  set owner_name = v_contact, phone = v_phone, email = v_email,
      payout_network = case when v_wallet <> '' then v_network end,
      payout_wallet = nullif(v_wallet, ''),
      payout_name = case when v_wallet <> '' then v_pname end
  where pr.vendor_id = p_vendor_id;
  if nullif(btrim(coalesce(p ->> 'tin', '')), '') is not null then
    perform public.vendor_write_tax_info(p_vendor_id, p);
  end if;
end;
$$;

revoke all on function public.write_supplier_details(uuid, jsonb) from public, anon, authenticated;

create function public.admin_create_supplier(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p ->> 'name', ''));
  v_slug text;
  v_id uuid;
begin
  perform public.require_staff(array['admin']::public.staff_role[]);
  if length(v_name) < 2 or length(v_name) > 60 then
    raise exception 'Enter the supplier''s name (2 to 60 characters).' using errcode = '22023';
  end if;
  if length(coalesce(p ->> 'tagline', '')) > 120 or length(coalesce(p ->> 'description', '')) > 2000 then
    raise exception 'The one-line description is up to 120 characters and the story up to 2000.' using errcode = '22023';
  end if;
  v_slug := left(public.vendor_slugify(v_name), 40);
  if length(v_slug) < 3 then
    raise exception 'Use a longer name.' using errcode = '22023';
  end if;
  if exists (select 1 from public.vendors x where x.slug = v_slug) then
    v_slug := left(v_slug, 33) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  end if;
  insert into public.vendors (owner_id, is_house, is_supplier, slug, name, tagline, description, status)
  values (null, false, true, v_slug, v_name, nullif(btrim(coalesce(p ->> 'tagline', '')), ''), nullif(btrim(coalesce(p ->> 'description', '')), ''), 'active')
  returning id into v_id;
  insert into public.vendor_private (vendor_id) values (v_id);
  perform public.write_supplier_details(v_id, p);
  perform public.audit('supplier.created', 'vendor', v_id::text, jsonb_build_object('name', v_name));
  return v_id;
end;
$$;

revoke all on function public.admin_create_supplier(jsonb) from public, anon;
grant execute on function public.admin_create_supplier(jsonb) to authenticated;

create function public.admin_update_supplier(p_vendor_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vendors;
  v_name text := btrim(coalesce(p ->> 'name', ''));
begin
  perform public.require_staff(array['admin']::public.staff_role[]);
  v := public.supplier_require(p_vendor_id);
  if length(v_name) < 2 or length(v_name) > 60 then
    raise exception 'Enter the supplier''s name (2 to 60 characters).' using errcode = '22023';
  end if;
  if length(coalesce(p ->> 'tagline', '')) > 120 or length(coalesce(p ->> 'description', '')) > 2000 then
    raise exception 'The one-line description is up to 120 characters and the story up to 2000.' using errcode = '22023';
  end if;
  update public.vendors x
  set name = v_name, tagline = nullif(btrim(coalesce(p ->> 'tagline', '')), ''), description = nullif(btrim(coalesce(p ->> 'description', '')), '')
  where x.id = v.id;
  perform public.write_supplier_details(v.id, p);
  perform public.audit('supplier.updated', 'vendor', v.id::text, null);
end;
$$;

revoke all on function public.admin_update_supplier(uuid, jsonb) from public, anon;
grant execute on function public.admin_update_supplier(uuid, jsonb) to authenticated;

-- Every supplier with their contact and payout details, product counts and what they are owed.
create function public.admin_list_suppliers()
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
      'id', v.id, 'slug', v.slug, 'name', v.name, 'tagline', v.tagline, 'description', v.description, 'created_at', v.created_at,
      'contact_name', pr.owner_name, 'phone', pr.phone, 'email', pr.email,
      'business_type', pr.business_type, 'legal_name', pr.legal_name, 'tin', pr.tin, 'business_registration', pr.business_registration,
      'payout_network', pr.payout_network, 'payout_wallet', pr.payout_wallet, 'payout_name', pr.payout_name,
      'products', (select count(*) from public.products p where p.vendor_id = v.id),
      'pending_products', (select count(*) from public.products p where p.vendor_id = v.id and p.review_status = 'pending'),
      'on_sale', (select count(*) from public.products p where p.vendor_id = v.id and p.is_published),
      'balance', public.vendor_balance(v.id)
    ) order by v.name)
    from public.vendors v left join public.vendor_private pr on pr.vendor_id = v.id
    where v.is_supplier), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_list_suppliers() from public, anon;
grant execute on function public.admin_list_suppliers() to authenticated;

create function public.admin_supplier_products(p_vendor_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['catalogue']::public.staff_role[]);
  return public.list_vendor_products(public.supplier_require(p_vendor_id));
end;
$$;

revoke all on function public.admin_supplier_products(uuid) from public, anon;
grant execute on function public.admin_supplier_products(uuid) to authenticated;

create function public.admin_save_supplier_product(p_vendor_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['catalogue']::public.staff_role[]);
  return public.write_vendor_product(public.supplier_require(p_vendor_id), p);
end;
$$;

revoke all on function public.admin_save_supplier_product(uuid, jsonb) from public, anon;
grant execute on function public.admin_save_supplier_product(uuid, jsonb) to authenticated;

create function public.admin_set_supplier_stock(p_vendor_id uuid, p_product_id uuid, p_size_code text, p_quantity integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['operations']::public.staff_role[]);
  perform public.set_vendor_stock(public.supplier_require(p_vendor_id), p_product_id, p_size_code, p_quantity);
end;
$$;

revoke all on function public.admin_set_supplier_stock(uuid, uuid, text, integer) from public, anon;
grant execute on function public.admin_set_supplier_stock(uuid, uuid, text, integer) to authenticated;

create function public.admin_delete_supplier_product(p_vendor_id uuid, p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['catalogue']::public.staff_role[]);
  perform public.delete_vendor_product(public.supplier_require(p_vendor_id), p_product_id);
end;
$$;

revoke all on function public.admin_delete_supplier_product(uuid, uuid) from public, anon;
grant execute on function public.admin_delete_supplier_product(uuid, uuid) to authenticated;

-- Whether sellers can open their own stores (off: the owner adds suppliers instead).
create function public.admin_set_vendor_accounts_open(p_open boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['admin']::public.staff_role[]);
  update public.store_settings set vendor_accounts_open = coalesce(p_open, false);
  perform public.audit('settings.vendor_accounts_open', 'settings', 'store', jsonb_build_object('open', coalesce(p_open, false)));
end;
$$;

revoke all on function public.admin_set_vendor_accounts_open(boolean) from public, anon;
grant execute on function public.admin_set_vendor_accounts_open(boolean) to authenticated;
