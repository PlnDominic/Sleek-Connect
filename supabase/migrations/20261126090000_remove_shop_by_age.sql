-- Removes "Shop by age". The pages, the filter, the product form field and the app screen are gone from the code; this removes the two tables
-- behind them (age_bands and product_age_bands) and the three functions that touched them. BACK UP FIRST (Supabase → Database → Backups):
-- dropping the tables deletes which age bands each product was tagged with. Nothing else changes: products, sizes, stock and orders are untouched.

CREATE OR REPLACE FUNCTION public.admin_save_product(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if jsonb_typeof(v_sizes) <> 'array' then
    raise exception 'Invalid sizes.' using errcode = '22023';
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_duplicate_product(p_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_src public.products%rowtype;
  v_new uuid;
  v_slug text;
  v_n integer := 1;
begin
  perform public.require_staff(array['catalogue']::public.staff_role[]);
  select * into v_src from public.products p where p.id = p_id;
  if not found then
    raise exception 'That product no longer exists.' using errcode = '22023';
  end if;
  v_slug := left(v_src.slug, 90) || '-copy';
  while exists (select 1 from public.products p where p.slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := left(v_src.slug, 90) || '-copy-' || v_n;
  end loop;

  insert into public.products (
    slug, name, brand, department, category_id, kids_filter, collection, price_ghs, was_price_ghs, badge, tag, summary,
    image_key, tint, kind, details, is_published, ingredients, country_of_origin, regulatory_reference, period_after_opening,
    skin_types, shades, warning_label, returnable, return_note, size_guide_id, supplier_id
  )
  values (
    v_slug, left(v_src.name, 112) || ' (copy)', v_src.brand, v_src.department, v_src.category_id, v_src.kids_filter, v_src.collection,
    v_src.price_ghs, v_src.was_price_ghs, v_src.badge, v_src.tag, v_src.summary,
    v_src.image_key, v_src.tint, v_src.kind, v_src.details, false, v_src.ingredients, v_src.country_of_origin,
    v_src.regulatory_reference, v_src.period_after_opening, v_src.skin_types, v_src.shades, v_src.warning_label,
    v_src.returnable, v_src.return_note, v_src.size_guide_id, v_src.supplier_id
  )
  returning id into v_new;

  insert into public.product_sizes (product_id, code, label, price_ghs, is_default, sort_order)
  select v_new, s.code, s.label, s.price_ghs, s.is_default, s.sort_order from public.product_sizes s where s.product_id = p_id;
  insert into public.inventory_levels (product_id, size_code)
  select v_new, i.size_code from public.inventory_levels i where i.product_id = p_id;

  perform public.audit('product.duplicated', 'product', v_new::text, jsonb_build_object('from', p_id));
  return v_new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.verify_launch_schema()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tables_without_rls text[] := '{}';
  v_missing_tables text[] := '{}';
  v_missing_functions text[] := '{}';
  v_missing_indexes text[] := '{}';
  v_missing_buckets text[] := '{}';
  v_grant_problems text[] := '{}';
  v_exposed_columns text[] := '{}';
  v_name text;
  v_role text;
  v_rel oid;
begin
  -- 1. Tables -------------------------------------------------------------------------------
  for v_name in select * from unnest(array[
    'categories', 'products', 'product_sizes',
    'merchandising_slots', 'delivery_areas', 'delivery_options', 'delivery_zones', 'delivery_rates',
    'orders', 'order_items', 'order_events', 'order_item_batches', 'order_lookup_failures',
    'store_settings', 'inventory_levels', 'stock_batches', 'stock_movements', 'payments',
    'notifications', 'riders', 'banners', 'return_requests', 'return_items', 'support_cases',
    'staff_members', 'audit_log', 'profiles', 'bag_items', 'customer_addresses',
    'saved_payment_methods', 'wishlist_items', 'product_images', 'product_reviews',
    'product_questions', 'review_reports', 'stock_alerts', 'promotions'
  ])
  loop
    v_rel := to_regclass('public.' || v_name);
    if v_rel is null then
      v_missing_tables := array_append(v_missing_tables, v_name);
    elsif not (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = v_rel) then
      v_tables_without_rls := array_append(v_tables_without_rls, v_name);
    end if;
  end loop;

  -- 2. Functions the application calls ------------------------------------------------------
  for v_name in select * from unnest(array[
    'place_order', 'get_order', 'get_order_status', 'find_order', 'cancel_my_order',
    'start_payment', 'confirm_payment', 'expire_unpaid_orders', 'release_order_reservation',
    'my_orders', 'get_bag', 'set_bag', 'get_wishlist', 'set_wishlist',
    'save_address', 'delete_address', 'save_payment_method', 'delete_payment_method',
    'search_products', 'search_suggestions', 'request_return', 'create_support_case',
    'get_product_reviews', 'get_review_summary', 'get_product_reviews_page', 'submit_review',
    'delete_my_review', 'my_review_status', 'subscribe_stock_alert', 'get_product_questions',
    'submit_product_question', 'report_product_review', 'export_my_data', 'delete_my_account',
    'account_deletion_blocker', 'product_publish_problems', 'product_current_batches',
    'apply_order_promotion', 'set_order_gift_details', 'validate_order_delivery',
    'record_signup_consent', 'return_photo_folder', 'can_upload_return_photo',
    'owns_return_photo', 'my_return_photo_paths', 'require_staff', 'current_staff_role',
    'my_staff_access', 'audit', 'claim_notifications', 'finish_notification',
    'queue_order_notifications', 'queue_customer_message', 'queue_return_message',
    'log_stock_movement', 'change_batch_status', 'expire_batches', 'allocate_order_batches',
    'return_order_batches', 'lock_order_for', 'admin_set_staff', 'admin_save_product',
    'admin_set_product_published', 'admin_save_rider', 'admin_receive_stock',
    'admin_adjust_batch', 'admin_set_batch_status', 'admin_write_off_batch',
    'admin_stock_overview', 'admin_products', 'admin_pick_list', 'admin_start_packing',
    'admin_pack_orders', 'admin_dispatch_order', 'admin_mark_delivered',
    'admin_mark_delivery_failed', 'admin_return_to_stock', 'admin_cancel_order',
    'admin_resolve_order_flag', 'admin_save_delivery_area', 'admin_save_delivery_zone',
    'admin_delete_delivery_zone', 'admin_set_delivery_rate', 'admin_save_delivery_option',
    'admin_update_settings', 'admin_save_banner', 'admin_delete_banner',
    'admin_set_collection', 'admin_decide_return', 'admin_receive_return',
    'admin_mark_return_refunded', 'admin_reply_support_case', 'admin_list_reviews',
    'admin_review_counts', 'admin_moderate_review', 'admin_recall_product',
    'admin_lift_recall', 'admin_add_product_image', 'admin_arrange_product_images',
    'admin_remove_product_image'
  ])
  loop
    if not exists (
      select 1 from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_name
    ) then
      v_missing_functions := array_append(v_missing_functions, v_name);
    end if;
  end loop;

  -- 3. Indexes behind the busy queries ------------------------------------------------------
  for v_name in select * from unnest(array[
    'orders_public_token_idx', 'orders_pending_expiry_idx', 'orders_status_created_idx',
    'notifications_due_idx', 'notifications_order_id_idx', 'audit_log_entity_idx',
    'stock_batches_expiry_idx', 'order_lookup_failures_key_idx', 'return_requests_status_idx',
    'support_cases_status_idx', 'customer_addresses_one_default_idx', 'product_reviews_status_idx',
    'product_images_product_idx', 'payments_order_id_idx'
  ])
  loop
    if not exists (
      select 1 from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_name and c.relkind = 'i'
    ) then
      v_missing_indexes := array_append(v_missing_indexes, v_name);
    end if;
  end loop;

  -- 4. Storage buckets ----------------------------------------------------------------------
  for v_name in select * from unnest(array['product-images', 'return-photos'])
  loop
    if not exists (select 1 from storage.buckets b where b.id = v_name) then
      v_missing_buckets := array_append(v_missing_buckets, v_name);
    end if;
  end loop;

  -- 5. Order secrets are unreadable by public roles -----------------------------------------
  if to_regclass('public.orders') is not null then
    for v_role in select * from unnest(array['anon', 'authenticated'])
    loop
      if exists (select 1 from pg_catalog.pg_roles r where r.rolname = v_role) then
        if has_column_privilege(v_role, 'public.orders', 'delivery_code', 'SELECT') then
          v_exposed_columns := array_append(v_exposed_columns, v_role || ':orders.delivery_code');
        end if;
        if has_column_privilege(v_role, 'public.orders', 'public_token', 'SELECT') then
          v_exposed_columns := array_append(v_exposed_columns, v_role || ':orders.public_token');
        end if;
      end if;
    end loop;
  end if;

  -- 6. Grants: what each public role may run ------------------------------------------------
  -- Server-only functions: neither anon nor authenticated may execute them.
  for v_name in select * from unnest(array[
    'confirm_payment', 'start_payment', 'claim_notifications', 'finish_notification',
    'expire_unpaid_orders', 'release_order_reservation', 'require_staff', 'audit',
    'set_order_event_context', 'queue_customer_message', 'queue_return_message',
    'log_stock_movement', 'return_photo_folder', 'validate_order_delivery'
  ])
  loop
    if public.verify_fn_privilege('anon', v_name, 'EXECUTE') then
      v_grant_problems := array_append(v_grant_problems, 'anon may run ' || v_name);
    end if;
    if public.verify_fn_privilege('authenticated', v_name, 'EXECUTE') then
      v_grant_problems := array_append(v_grant_problems, 'authenticated may run ' || v_name);
    end if;
  end loop;

  -- Storefront functions the public and signed-in shopper must be able to run.
  for v_name in select * from unnest(array[
    'place_order', 'find_order', 'create_support_case', 'search_products', 'search_suggestions',
    'request_return', 'get_order', 'get_order_status', 'cancel_my_order', 'get_product_reviews',
    'get_review_summary', 'get_product_reviews_page', 'get_product_questions',
    'subscribe_stock_alert'
  ])
  loop
    if not public.verify_fn_privilege('anon', v_name, 'EXECUTE') then
      v_grant_problems := array_append(v_grant_problems, 'anon cannot run ' || v_name);
    end if;
    if not public.verify_fn_privilege('authenticated', v_name, 'EXECUTE') then
      v_grant_problems := array_append(v_grant_problems, 'authenticated cannot run ' || v_name);
    end if;
  end loop;

  return jsonb_build_object(
    'ok', array_length(v_missing_tables, 1) is null
      and array_length(v_tables_without_rls, 1) is null
      and array_length(v_missing_functions, 1) is null
      and array_length(v_missing_indexes, 1) is null
      and array_length(v_missing_buckets, 1) is null
      and array_length(v_grant_problems, 1) is null
      and array_length(v_exposed_columns, 1) is null,
    'missing_tables', to_jsonb(v_missing_tables),
    'tables_without_rls', to_jsonb(v_tables_without_rls),
    'missing_functions', to_jsonb(v_missing_functions),
    'missing_indexes', to_jsonb(v_missing_indexes),
    'missing_buckets', to_jsonb(v_missing_buckets),
    'grant_problems', to_jsonb(v_grant_problems),
    'exposed_secret_columns', to_jsonb(v_exposed_columns)
  );
end;
$function$;

drop table if exists public.product_age_bands;
drop table if exists public.age_bands;
