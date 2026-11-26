-- Promo code management for staff (Admin → Promotions). The promotions table is still not readable or writable directly: staff go through
-- these functions, which check the role (admin or finance) and write the audit log. How a code is applied at checkout is unchanged
-- (apply_order_promotion).

-- Every promotion, with what it has cost: orders that used the code (not cancelled) and the discount given.
create function public.admin_list_promotions()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['finance']::public.staff_role[]);
  return coalesce((
    select jsonb_agg(to_jsonb(p) || jsonb_build_object(
        'orders', (select count(*) from public.orders o where o.promo_code = p.code and o.status not in ('cancelled', 'pending_payment')),
        'discount_given_ghs', (select coalesce(sum(o.discount_ghs), 0) from public.orders o where o.promo_code = p.code and o.status not in ('cancelled', 'pending_payment')))
      order by p.active desc, p.created_at desc)
    from public.promotions p), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_list_promotions() from public, anon;
grant execute on function public.admin_list_promotions() to authenticated;

-- Creates a promotion (no id) or changes one (id). The code can't be changed once it exists: orders refer to it.
-- p: {id?, code, label, kind, value, minimum_spend_ghs, starts_at, ends_at, max_uses, first_order_only, active, allowed_slugs[], allowed_categories[]}
create function public.admin_save_promotion(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.staff_role := public.require_staff(array['finance']::public.staff_role[]);
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_old public.promotions%rowtype;
  v_code text := upper(btrim(coalesce(p ->> 'code', '')));
  v_label text := btrim(coalesce(p ->> 'label', ''));
  v_kind text := p ->> 'kind';
  v_value numeric := coalesce(nullif(p ->> 'value', '')::numeric, 0);
  v_min numeric := coalesce(nullif(p ->> 'minimum_spend_ghs', '')::numeric, 0);
  v_starts timestamptz := coalesce(nullif(p ->> 'starts_at', '')::timestamptz, now());
  v_ends timestamptz := nullif(p ->> 'ends_at', '')::timestamptz;
  v_max integer := nullif(p ->> 'max_uses', '')::integer;
  v_first boolean := coalesce((p ->> 'first_order_only')::boolean, false);
  v_active boolean := coalesce((p ->> 'active')::boolean, true);
  v_slugs text[] := (select array_agg(btrim(x)) from jsonb_array_elements_text(coalesce(p -> 'allowed_slugs', '[]'::jsonb)) x where btrim(x) <> '');
  v_cats text[] := (select array_agg(btrim(x)) from jsonb_array_elements_text(coalesce(p -> 'allowed_categories', '[]'::jsonb)) x where btrim(x) <> '');
begin
  if v_id is not null then
    select * into v_old from public.promotions x where x.id = v_id for update;
    if not found then raise exception 'That promo code no longer exists.' using errcode = '22023'; end if;
    v_code := v_old.code;
  elsif v_code !~ '^[A-Z0-9-]{3,30}$' then
    raise exception 'The code is 3 to 30 letters, numbers or dashes, for example WELCOME10.' using errcode = '22023';
  elsif exists (select 1 from public.promotions x where x.code = v_code) then
    raise exception 'There is already a promo code called %.', v_code using errcode = '22023';
  end if;
  if length(v_label) < 3 or length(v_label) > 80 then
    raise exception 'Describe the offer in 3 to 80 characters. Shoppers see this.' using errcode = '22023';
  end if;
  if v_kind not in ('percent', 'fixed', 'free_delivery') then
    raise exception 'Choose percent off, an amount off, or free delivery.' using errcode = '22023';
  end if;
  if v_kind = 'percent' and (v_value < 1 or v_value > 90) then
    raise exception 'A percentage is between 1 and 90.' using errcode = '22023';
  end if;
  if v_kind = 'fixed' and (v_value <= 0 or v_value > 100000) then
    raise exception 'Enter the amount off in GH₵.' using errcode = '22023';
  end if;
  if v_kind = 'free_delivery' then v_value := 0; end if;
  if v_min < 0 or v_min > 1000000 then
    raise exception 'The minimum spend can''t be negative.' using errcode = '22023';
  end if;
  if v_ends is not null and v_ends <= v_starts then
    raise exception 'The end date has to be after the start.' using errcode = '22023';
  end if;
  if v_max is not null and v_max < 1 then
    raise exception 'The most uses has to be 1 or more, or empty for no limit.' using errcode = '22023';
  end if;
  if v_id is not null and v_max is not null and v_max < v_old.used_count then
    raise exception 'It has already been used % times; the limit can''t be lower than that.', v_old.used_count using errcode = '22023';
  end if;
  if v_slugs is not null and exists (select 1 from unnest(v_slugs) s where not exists (select 1 from public.products pr where pr.slug = s)) then
    raise exception 'One of the product addresses doesn''t match a product.' using errcode = '22023';
  end if;
  if v_cats is not null and exists (select 1 from unnest(v_cats) c where not exists (select 1 from public.categories ca where ca.id = c)) then
    raise exception 'One of the categories doesn''t exist.' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.promotions (code, label, kind, value, minimum_spend_ghs, starts_at, ends_at, max_uses, first_order_only, active, allowed_slugs, allowed_categories)
    values (v_code, v_label, v_kind, v_value, v_min, v_starts, v_ends, v_max, v_first, v_active, v_slugs, v_cats)
    returning id into v_id;
    perform public.audit('promotion.created', 'promotion', v_id::text, jsonb_build_object('code', v_code, 'kind', v_kind, 'value', v_value));
  else
    update public.promotions x
    set label = v_label, kind = v_kind, value = v_value, minimum_spend_ghs = v_min, starts_at = v_starts, ends_at = v_ends, max_uses = v_max,
        first_order_only = v_first, active = v_active, allowed_slugs = v_slugs, allowed_categories = v_cats
    where x.id = v_id;
    perform public.audit('promotion.updated', 'promotion', v_id::text, jsonb_build_object('code', v_code, 'kind', v_kind, 'value', v_value, 'active', v_active));
  end if;
  return v_id;
end;
$$;

revoke all on function public.admin_save_promotion(jsonb) from public, anon;
grant execute on function public.admin_save_promotion(jsonb) to authenticated;

-- Switches a code off or on without losing it.
create function public.admin_set_promotion_active(p_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  perform public.require_staff(array['finance']::public.staff_role[]);
  update public.promotions x set active = coalesce(p_active, false) where x.id = p_id returning x.code into v_code;
  if not found then raise exception 'That promo code no longer exists.' using errcode = '22023'; end if;
  perform public.audit(case when p_active then 'promotion.switched_on' else 'promotion.switched_off' end, 'promotion', p_id::text, jsonb_build_object('code', v_code));
end;
$$;

revoke all on function public.admin_set_promotion_active(uuid, boolean) from public, anon;
grant execute on function public.admin_set_promotion_active(uuid, boolean) to authenticated;

-- Deletes a code nobody has used. A code that has been used is switched off instead, so past orders keep their record.
create function public.admin_delete_promotion(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.promotions%rowtype;
begin
  perform public.require_staff(array['finance']::public.staff_role[]);
  select * into v from public.promotions x where x.id = p_id for update;
  if not found then raise exception 'That promo code no longer exists.' using errcode = '22023'; end if;
  if v.used_count > 0 or exists (select 1 from public.orders o where o.promo_code = v.code) then
    raise exception 'This code has been used, so it can''t be deleted. Switch it off instead.' using errcode = '22023';
  end if;
  delete from public.promotions x where x.id = p_id;
  perform public.audit('promotion.deleted', 'promotion', p_id::text, jsonb_build_object('code', v.code));
end;
$$;

revoke all on function public.admin_delete_promotion(uuid) from public, anon;
grant execute on function public.admin_delete_promotion(uuid) to authenticated;
