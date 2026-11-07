-- Launch schema verification (P0 items 1 and 2)
-- ---------------------------------------------------------------------------
-- One repeatable check that the schema a project actually has matches the one the
-- application expects: the tables, the RPCs the web app calls, row level security,
-- the indexes behind the busy queries, the storage buckets, and the grants that keep
-- order secrets and server-only functions away from public roles.
--
-- It is called by `npm run db:verify` (scripts/verify-schema.ts), and it reports only the names of
-- anything that is missing or wrongly granted.

create or replace function public.verify_fn_privilege(p_role text, p_function text, p_privilege text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_roles r where r.rolname = p_role) then
    return false;
  end if;
  -- Every overload counts. The privilege is checked by OID: a signature built from
  -- pg_get_function_identity_arguments includes parameter names and can't be parsed back.
  return exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = p_function
      and has_function_privilege(p_role, p.oid, p_privilege)
  );
end;
$$;

create or replace function public.verify_launch_schema()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
    'age_bands', 'categories', 'products', 'product_sizes', 'product_age_bands',
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
$$;

revoke all on function public.verify_launch_schema() from public;
revoke all on function public.verify_fn_privilege(text, text, text) from public;
grant execute on function public.verify_launch_schema() to anon, authenticated, service_role;
grant execute on function public.verify_fn_privilege(text, text, text) to anon, authenticated, service_role;
