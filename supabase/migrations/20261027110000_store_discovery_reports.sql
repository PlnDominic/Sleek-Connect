-- Finding stores, rating them, and vendors' own reports; plus a summary of what a vendor changed for re-review.

-- ---------------------------------------------------------------------------
-- Stores directory and ratings (public). A store's rating is the average of the published reviews of its products.
-- ---------------------------------------------------------------------------

create function public.store_directory()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug', v.slug, 'name', v.name, 'tagline', v.tagline, 'logo_path', v.logo_path, 'banner_path', v.banner_path,
    'product_count', coalesce(c.products, 0), 'rating', coalesce(r.average, 0), 'review_count', coalesce(r.reviews, 0))
    order by coalesce(c.products, 0) desc, v.name), '[]'::jsonb)
  from public.vendors v
  left join (select p.vendor_id, count(*)::integer as products from public.products p where p.is_published group by p.vendor_id) c
    on c.vendor_id = v.id
  left join (
    select p.vendor_id, round(avg(rv.rating), 1) as average, count(*)::integer as reviews
    from public.product_reviews rv join public.products p on p.id = rv.product_id
    where p.is_published and rv.status = 'published' group by p.vendor_id
  ) r on r.vendor_id = v.id
  where not v.is_house and public.vendor_is_live(v.id) and coalesce(c.products, 0) > 0;
$$;

grant execute on function public.store_directory() to anon, authenticated;

create function public.store_rating(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('average', coalesce(round(avg(rv.rating), 1), 0), 'count', count(*)::integer)
  from public.product_reviews rv
  join public.products p on p.id = rv.product_id
  join public.vendors v on v.id = p.vendor_id
  where v.slug = p_slug and public.vendor_is_live(v.id) and p.is_published and rv.status = 'published';
$$;

grant execute on function public.store_rating(text) to anon, authenticated;

create function public.store_reviews(p_slug text, p_limit integer default 6)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'rating', t.rating, 'title', t.title, 'body', t.body, 'display_name', t.display_name, 'created_at', t.created_at,
    'product_name', t.name, 'product_slug', t.slug) order by t.created_at desc), '[]'::jsonb)
  from (
    select rv.rating, rv.title, rv.body, rv.display_name, rv.created_at, p.name, p.slug
    from public.product_reviews rv
    join public.products p on p.id = rv.product_id
    join public.vendors v on v.id = p.vendor_id
    where v.slug = p_slug and public.vendor_is_live(v.id) and p.is_published and rv.status = 'published'
    order by rv.created_at desc
    limit greatest(1, least(coalesce(p_limit, 6), 30))
  ) t;
$$;

grant execute on function public.store_reviews(text, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- A vendor's sales report: per day, totals, and best sellers, from paid orders that were not cancelled or returned.
-- ---------------------------------------------------------------------------

create function public.vendor_report(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.vendors := public.vendor_require_own();
  n integer := greatest(7, least(coalesce(p_days, 30), 365));
  v_from date := current_date - (greatest(7, least(coalesce(p_days, 30), 365)) - 1);
begin
  return (
    with lines as (
      select (o.paid_at at time zone 'UTC')::date as d, o.id as order_id, oi.product_name, oi.quantity,
             oi.vendor_unit_price_ghs * oi.quantity as amount
      from public.order_items oi join public.orders o on o.id = oi.order_id
      where oi.vendor_id = v.id and o.paid_at is not null
        and (o.paid_at at time zone 'UTC')::date >= v_from
        and o.status not in ('cancelled', 'returned', 'pending_payment')
    ),
    per_day as (
      select d, sum(quantity)::integer as units, sum(amount) as revenue, count(distinct order_id)::integer as orders
      from lines group by d
    )
    select jsonb_build_object(
      'days', (select jsonb_agg(jsonb_build_object('date', g.d::date, 'units', coalesce(p.units, 0),
                 'revenue', coalesce(p.revenue, 0), 'orders', coalesce(p.orders, 0)) order by g.d)
               from generate_series(v_from, current_date, interval '1 day') g(d)
               left join per_day p on p.d = g.d::date),
      'totals', jsonb_build_object('units', coalesce((select sum(quantity) from lines), 0),
                'revenue', coalesce((select sum(amount) from lines), 0),
                'orders', (select count(distinct order_id) from lines)),
      'top_products', coalesce((
        select jsonb_agg(jsonb_build_object('name', t.product_name, 'units', t.units, 'revenue', t.revenue) order by t.revenue desc)
        from (select product_name, sum(quantity)::integer as units, sum(amount) as revenue
              from lines group by product_name order by sum(amount) desc limit 8) t), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.vendor_report(integer) from public, anon;
grant execute on function public.vendor_report(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- What a vendor changed: when an approved product goes back for review, the approved values are kept for the owner.
-- ---------------------------------------------------------------------------

alter table public.products add column review_previous jsonb;

create or replace function public.vendor_save_product(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
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

create or replace function public.admin_vendor_products(p_status product_review_status DEFAULT 'pending'::product_review_status)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
begin
  perform public.require_staff(array['admin', 'catalogue']::public.staff_role[]);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'slug', p.slug, 'name', p.name, 'brand', p.brand, 'department', p.department, 'summary', p.summary,
      'category_id', p.category_id, 'description', p.details ->> 'description', 'ingredients', p.ingredients,
      'review_previous', p.review_previous,
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

create or replace function public.admin_review_product(p_product_id uuid, p_decision product_review_status, p_markup_percent numeric DEFAULT NULL::numeric, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
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
    review_note = nullif(btrim(left(p_note, 500)), ''),
    review_previous = case when p_decision in ('approved', 'rejected') then null else x.review_previous end
  where x.id = p_product_id;
  perform public.audit('product.review_' || p_decision::text, 'product', p_product_id::text,
    jsonb_build_object('markup_percent', coalesce(p_markup_percent, p.markup_percent), 'note', p_note));
  if p_decision in ('approved', 'rejected') then
    perform public.queue_vendor_message(p.vendor_id, 'vendor_product_reviewed', jsonb_build_object(
      'product_name', p.name, 'decision', p_decision, 'note', nullif(btrim(p_note), ''),
      'price_ghs', (select x.price_ghs from public.products x where x.id = p_product_id)));
  end if;
  return (select jsonb_build_object('id', x.id, 'review_status', x.review_status, 'markup_percent', x.markup_percent,
            'price_ghs', x.price_ghs, 'is_published', x.is_published) from public.products x where x.id = p_product_id);
end;
$$;
