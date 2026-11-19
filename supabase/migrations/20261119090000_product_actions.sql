-- Product actions in Admin → Products: delete and duplicate. (Edit, publish/unpublish and recall already exist.)

-- Deletes a product that has never been ordered and has no stock left, with its sizes, photos, reviews and stock history.
-- Returns the paths of its photo files so the website can remove them from Storage (files are never removed by SQL).
-- A product that is on a customer's order is kept (hidden from the shop instead), so receipts and returns keep working.
create function public.admin_delete_product(p_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_orders integer;
  v_units bigint;
  v_paths text[];
begin
  perform public.require_staff(array['catalogue']::public.staff_role[]);
  select p.name into v_name from public.products p where p.id = p_id;
  if not found then
    raise exception 'That product no longer exists.' using errcode = '22023';
  end if;
  select count(distinct oi.order_id) into v_orders from public.order_items oi where oi.product_id = p_id;
  if v_orders > 0 then
    raise exception '% is on % customer order%, so it can''t be deleted (receipts and returns need it). Take it off the store instead.',
      v_name, v_orders, case when v_orders = 1 then '' else 's' end using errcode = '22023';
  end if;
  select coalesce(sum(b.quantity), 0) into v_units from public.stock_batches b where b.product_id = p_id;
  select v_units + coalesce(sum(greatest(i.on_hand, 0)), 0) into v_units from public.inventory_levels i where i.product_id = p_id;
  if v_units > 0 then
    raise exception '% still has stock. Sell it, or write it off under Inventory, then delete the product.', v_name using errcode = '22023';
  end if;

  select coalesce(array_agg(i.path), '{}') into v_paths from public.product_images i where i.product_id = p_id;
  delete from public.stock_receipts where product_id = p_id;
  delete from public.stock_movements where product_id = p_id;
  delete from public.stock_batches where product_id = p_id;
  delete from public.products where id = p_id;
  perform public.audit('product.deleted', 'product', p_id::text, jsonb_build_object('name', v_name));
  return v_paths;
end;
$$;

revoke all on function public.admin_delete_product(uuid) from public, anon;
grant execute on function public.admin_delete_product(uuid) to authenticated;

-- Copies a product as a new draft (name + " (copy)", its sizes, age groups and details). Photos and stock are not copied.
-- Returns the new product's id.
create function public.admin_duplicate_product(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
  insert into public.product_age_bands (product_id, age_band_id)
  select v_new, a.age_band_id from public.product_age_bands a where a.product_id = p_id;
  insert into public.inventory_levels (product_id, size_code)
  select v_new, i.size_code from public.inventory_levels i where i.product_id = p_id;

  perform public.audit('product.duplicated', 'product', v_new::text, jsonb_build_object('from', p_id));
  return v_new;
end;
$$;

revoke all on function public.admin_duplicate_product(uuid) from public, anon;
grant execute on function public.admin_duplicate_product(uuid) to authenticated;
