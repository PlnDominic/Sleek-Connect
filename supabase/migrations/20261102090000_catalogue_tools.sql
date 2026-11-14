-- Catalogue tools: bulk editing, reorder suggestions and size guides.
-- ---------------------------------------------------------------------------
--  * admin_bulk_update_products changes many products at once (show or hide, prices, sales, category, skin types, size guide).
--    Each product succeeds or is skipped with its reason, so one bad product never blocks the rest. Independent stores' products
--    are never touched: their prices come from the vendor and the owner's markup.
--  * admin_reorder_suggestions turns the last 30 days of sales and the stock on hand into "order this many" suggestions, using
--    two settings: how many days a supplier takes (reorder_lead_days) and how many days of sales to cover (reorder_cover_days).
--  * Size guides are tables a product page can show (how to measure, then sizes against measurements).

alter table public.store_settings
  add column reorder_lead_days integer not null default 7 check (reorder_lead_days between 0 and 90),
  add column reorder_cover_days integer not null default 21 check (reorder_cover_days between 1 and 180);

-- ---------------------------------------------------------------------------
-- Size guides
-- ---------------------------------------------------------------------------

create table public.size_guides (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (length(btrim(title)) between 1 and 80),
  -- How to measure, shown above the table.
  intro text check (intro is null or length(intro) <= 1000),
  -- The table: header cells, then one array of cells per row.
  columns text[] not null check (cardinality(columns) between 2 and 8),
  rows jsonb not null check (jsonb_typeof(rows) = 'array' and jsonb_array_length(rows) between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger size_guides_set_updated_at
  before update on public.size_guides
  for each row execute function public.set_updated_at();

alter table public.size_guides enable row level security;
create policy "Anyone can read size guides" on public.size_guides for select to anon, authenticated using (true);
grant select on public.size_guides to anon, authenticated;

alter table public.products add column size_guide_id text references public.size_guides (id) on delete set null;
create index products_size_guide_idx on public.products (size_guide_id) where size_guide_id is not null;

-- Creates or updates a size guide. p: {id?, title, intro?, columns: text[], rows: text[][]}. Returns its id.
create or replace function public.admin_save_size_guide(p jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := btrim(coalesce(p ->> 'title', ''));
  v_id text;
  v_columns text[];
  v_rows jsonb := coalesce(p -> 'rows', '[]'::jsonb);
  v_row jsonb;
begin
  perform public.require_staff(array['catalogue']::public.staff_role[]);
  if v_title = '' or length(v_title) > 80 then
    raise exception 'Enter a title for the size guide (up to 80 characters).' using errcode = '22023';
  end if;
  v_id := lower(btrim(coalesce(nullif(p ->> 'id', ''), v_title)));
  v_id := btrim(regexp_replace(regexp_replace(v_id, '[^a-z0-9]+', '-', 'g'), '-+', '-', 'g'), '-');
  if v_id = '' then
    raise exception 'Enter a title for the size guide.' using errcode = '22023';
  end if;

  if jsonb_typeof(p -> 'columns') is distinct from 'array' then
    raise exception 'Add the table''s column headings.' using errcode = '22023';
  end if;
  v_columns := array(select btrim(x) from jsonb_array_elements_text(p -> 'columns') x);
  if cardinality(v_columns) < 2 or cardinality(v_columns) > 8 or '' = any (v_columns) then
    raise exception 'A size guide needs 2 to 8 columns, each with a heading.' using errcode = '22023';
  end if;

  if jsonb_typeof(v_rows) is distinct from 'array' or jsonb_array_length(v_rows) = 0 or jsonb_array_length(v_rows) > 40 then
    raise exception 'Add 1 to 40 rows of sizes.' using errcode = '22023';
  end if;
  for v_row in select value from jsonb_array_elements(v_rows) loop
    if jsonb_typeof(v_row) is distinct from 'array' or jsonb_array_length(v_row) <> cardinality(v_columns) then
      raise exception 'Every row needs exactly % cells, one for each column.', cardinality(v_columns) using errcode = '22023';
    end if;
  end loop;

  insert into public.size_guides (id, title, intro, columns, rows)
  values (v_id, v_title, nullif(btrim(p ->> 'intro'), ''), v_columns, v_rows)
  on conflict (id) do update
    set title = excluded.title, intro = excluded.intro, columns = excluded.columns, rows = excluded.rows;
  perform public.audit('size_guide.saved', 'size_guide', v_id, jsonb_build_object('title', v_title));
  return v_id;
end;
$$;

revoke all on function public.admin_save_size_guide(jsonb) from public, anon;
grant execute on function public.admin_save_size_guide(jsonb) to authenticated;

-- Deletes a size guide; products that used it simply have none.
create or replace function public.admin_delete_size_guide(p_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['catalogue']::public.staff_role[]);
  delete from public.size_guides g where g.id = p_id;
  if found then
    perform public.audit('size_guide.deleted', 'size_guide', p_id, null);
  end if;
end;
$$;

revoke all on function public.admin_delete_size_guide(text) from public, anon;
grant execute on function public.admin_delete_size_guide(text) to authenticated;

-- Starter charts. Sizes differ between brands: check them against your suppliers' own before relying on them.
insert into public.size_guides (id, title, intro, columns, rows) values
  ('baby-clothing', 'Baby clothing, by age',
   'Measure your baby lying down, from head to heel. If your baby is between sizes, or you want room to grow, choose the larger size.',
   array['Age', 'Height (cm)', 'Weight (kg)'],
   '[["Newborn","up to 56","up to 4"],["0–3 months","56–62","4–6"],["3–6 months","62–68","6–8"],["6–9 months","68–74","8–9.5"],["9–12 months","74–80","9.5–11"],["12–18 months","80–86","11–12.5"],["18–24 months","86–92","12.5–14"]]'::jsonb),
  ('kids-clothing', 'Kids clothing, by age',
   'Measure your child standing, without shoes, and measure around the fullest part of the chest. When in doubt, choose the larger size.',
   array['Age', 'Height (cm)', 'Chest (cm)'],
   '[["2–3 years","92–98","53"],["3–4 years","98–104","54"],["4–5 years","104–110","56"],["5–6 years","110–116","58"],["6–7 years","116–122","60"],["7–8 years","122–128","63"],["8–9 years","128–134","65"],["9–10 years","134–140","68"],["10–11 years","140–146","71"],["11–12 years","146–152","74"]]'::jsonb),
  ('womens-clothing', 'Women''s clothing',
   'Measure over light clothing: around the fullest part of the bust, the narrowest part of the waist, and the widest part of the hips. If you are between sizes, choose the larger one.',
   array['Size', 'Bust (cm)', 'Waist (cm)', 'Hips (cm)'],
   '[["XS","80–84","62–66","86–90"],["S","84–88","66–70","90–94"],["M","88–92","70–74","94–98"],["L","92–98","74–80","98–104"],["XL","98–104","80–86","104–110"],["XXL","104–110","86–92","110–116"]]'::jsonb)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Bulk product editing
-- ---------------------------------------------------------------------------

-- p_changes (any combination):
--   published: true | false
--   price: {mode: 'percent' | 'amount' | 'set' | 'sale_percent' | 'end_sale', value: number}
--   category_id: text
--   skin_types: {mode: 'add' | 'replace' | 'clear', values: text[]}
--   size_guide_id: text | null
-- Returns {updated, skipped: [{id, name, reason}]}.
create or replace function public.admin_bulk_update_products(p_ids uuid[], p_changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_house uuid := public.house_vendor_id();
  v_id uuid;
  v_p public.products%rowtype;
  v_updated integer := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_price jsonb := p_changes -> 'price';
  v_mode text := v_price ->> 'mode';
  v_value numeric;
  v_skin jsonb := p_changes -> 'skin_types';
  v_skin_mode text := v_skin ->> 'mode';
  v_skin_values text[];
  v_sizes integer;
  v_base numeric;
  v_factor numeric;
  v_new_price numeric;
  v_new_was numeric;
  v_default_price numeric;
  v_problems text[];
  v_skin_next text[];
begin
  perform public.require_staff(array['catalogue']::public.staff_role[]);
  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'Select at least one product.' using errcode = '22023';
  end if;
  if cardinality(p_ids) > 200 then
    raise exception 'Change up to 200 products at a time.' using errcode = '22023';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' or p_changes = '{}'::jsonb then
    raise exception 'Choose what to change.' using errcode = '22023';
  end if;

  if p_changes ? 'category_id' and not exists (select 1 from public.categories c where c.id = p_changes ->> 'category_id') then
    raise exception 'That category doesn''t exist.' using errcode = '22023';
  end if;
  if p_changes ? 'size_guide_id' and p_changes ->> 'size_guide_id' is not null
     and not exists (select 1 from public.size_guides g where g.id = p_changes ->> 'size_guide_id') then
    raise exception 'That size guide doesn''t exist.' using errcode = '22023';
  end if;
  if v_price is not null then
    if v_mode is null or v_mode not in ('percent', 'amount', 'set', 'sale_percent', 'end_sale') then
      raise exception 'Choose how to change the prices.' using errcode = '22023';
    end if;
    if v_mode <> 'end_sale' then
      begin
        v_value := (v_price ->> 'value')::numeric;
      exception when others then
        raise exception 'Enter the price change as a number.' using errcode = '22023';
      end;
      if v_value is null then
        raise exception 'Enter the price change as a number.' using errcode = '22023';
      end if;
      if v_mode = 'sale_percent' and (v_value < 1 or v_value > 90) then
        raise exception 'A sale takes between 1%% and 90%% off.' using errcode = '22023';
      end if;
      if v_mode = 'set' and v_value < 0 then
        raise exception 'A price can''t be below zero.' using errcode = '22023';
      end if;
      if v_mode = 'percent' and v_value <= -100 then
        raise exception 'A price can''t drop by 100%% or more.' using errcode = '22023';
      end if;
    end if;
  end if;
  if v_skin is not null then
    if v_skin_mode is null or v_skin_mode not in ('add', 'replace', 'clear') then
      raise exception 'Choose how to change the skin types.' using errcode = '22023';
    end if;
    v_skin_values := array(select btrim(x) from jsonb_array_elements_text(
      case when jsonb_typeof(v_skin -> 'values') = 'array' then v_skin -> 'values' else '[]'::jsonb end) x where btrim(x) <> '');
    if v_skin_mode <> 'clear' and cardinality(v_skin_values) = 0 then
      raise exception 'Enter at least one skin type.' using errcode = '22023';
    end if;
  end if;

  foreach v_id in array (select array_agg(distinct x) from unnest(p_ids) x) loop
    select * into v_p from public.products x where x.id = v_id for update;
    if not found then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('id', v_id, 'name', null, 'reason', 'It no longer exists.'));
      continue;
    end if;
    if v_p.vendor_id is not null and v_p.vendor_id is distinct from v_house then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('id', v_id, 'name', v_p.name,
        'reason', 'Sold by an independent store, which manages its own products.'));
      continue;
    end if;

    -- One product at a time: if any change to it fails, none of its changes are kept and the reason is reported.
    begin
      if v_price is not null then
        select count(*) into v_sizes from public.product_sizes s where s.product_id = v_id;
        v_new_price := v_p.price_ghs;
        v_new_was := v_p.was_price_ghs;

        if v_mode = 'percent' then
          v_factor := 1 + v_value / 100;
          v_new_price := round(v_p.price_ghs * v_factor, 2);
          v_new_was := case when v_p.was_price_ghs is null then null else round(v_p.was_price_ghs * v_factor, 2) end;
          update public.product_sizes s set price_ghs = round(s.price_ghs * v_factor, 2) where s.product_id = v_id;
        elsif v_mode = 'amount' then
          v_new_price := round(v_p.price_ghs + v_value, 2);
          v_new_was := case when v_p.was_price_ghs is null then null else round(v_p.was_price_ghs + v_value, 2) end;
          if v_new_price < 0 or (v_sizes > 0 and exists (select 1 from public.product_sizes s where s.product_id = v_id and s.price_ghs + v_value < 0)) then
            raise exception 'The price would go below zero.' using errcode = '22023';
          end if;
          update public.product_sizes s set price_ghs = round(s.price_ghs + v_value, 2) where s.product_id = v_id;
        elsif v_mode = 'set' then
          if v_sizes > 1 then
            raise exception 'It has several sizes, each with its own price: set them on the product.' using errcode = '22023';
          end if;
          v_new_price := round(v_value, 2);
          v_new_was := case when v_p.was_price_ghs is null or v_p.was_price_ghs <= v_new_price then null else v_p.was_price_ghs end;
          update public.product_sizes s set price_ghs = v_new_price where s.product_id = v_id;
        elsif v_mode = 'sale_percent' then
          if v_p.was_price_ghs is not null then
            raise exception 'It is already on sale: end the sale first.' using errcode = '22023';
          end if;
          v_factor := 1 - v_value / 100;
          v_new_was := v_p.price_ghs;
          v_new_price := round(v_p.price_ghs * v_factor, 2);
          update public.product_sizes s set price_ghs = round(s.price_ghs * v_factor, 2) where s.product_id = v_id;
        else -- end_sale
          if v_p.was_price_ghs is null or v_p.price_ghs <= 0 then
            raise exception 'It is not on sale.' using errcode = '22023';
          end if;
          v_factor := v_p.was_price_ghs / v_p.price_ghs;
          v_new_price := v_p.was_price_ghs;
          v_new_was := null;
          update public.product_sizes s set price_ghs = round(s.price_ghs * v_factor, 2) where s.product_id = v_id;
        end if;

        if v_new_price < 0 then
          raise exception 'The price would go below zero.' using errcode = '22023';
        end if;
        -- With sizes, the product's price is its default size's price.
        select s.price_ghs into v_default_price from public.product_sizes s where s.product_id = v_id and s.is_default;
        if v_default_price is not null then
          v_new_price := v_default_price;
        end if;
        if v_new_was is not null and v_new_was <= v_new_price then
          v_new_was := null;
        end if;

        update public.products x set price_ghs = v_new_price, was_price_ghs = v_new_was where x.id = v_id;
        perform public.audit('product.price_changed', 'product', v_id::text, jsonb_build_object(
          'bulk', true,
          'before', jsonb_build_object('price_ghs', v_p.price_ghs, 'was_price_ghs', v_p.was_price_ghs),
          'after', jsonb_build_object('price_ghs', v_new_price, 'was_price_ghs', v_new_was)));
      end if;

      if p_changes ? 'category_id' then
        update public.products x set category_id = p_changes ->> 'category_id' where x.id = v_id;
      end if;

      if p_changes ? 'size_guide_id' then
        update public.products x set size_guide_id = p_changes ->> 'size_guide_id' where x.id = v_id;
      end if;

      if v_skin is not null then
        v_skin_next := case v_skin_mode
          when 'clear' then '{}'::text[]
          when 'replace' then v_skin_values
          else array(select distinct t from unnest(v_p.skin_types || v_skin_values) t order by t)
        end;
        update public.products x set skin_types = v_skin_next where x.id = v_id;
      end if;

      if p_changes ? 'published' then
        if (p_changes ->> 'published')::boolean then
          if not v_p.is_published then
            v_problems := public.product_publish_problems(v_id);
            if cardinality(v_problems) > 0 then
              raise exception 'Not ready for the store. Missing: %.', array_to_string(v_problems, ', ') using errcode = '22023';
            end if;
            update public.products x set is_published = true where x.id = v_id;
            perform public.audit('product.published', 'product', v_id::text, jsonb_build_object('bulk', true));
          end if;
        elsif v_p.is_published then
          update public.products x set is_published = false where x.id = v_id;
          perform public.audit('product.unpublished', 'product', v_id::text, jsonb_build_object('bulk', true));
        end if;
      end if;

      perform public.audit('product.bulk_updated', 'product', v_id::text, p_changes);
      v_updated := v_updated + 1;
    exception when others then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('id', v_id, 'name', v_p.name, 'reason', sqlerrm));
    end;
  end loop;

  return jsonb_build_object('updated', v_updated, 'skipped', v_skipped);
end;
$$;

revoke all on function public.admin_bulk_update_products(uuid[], jsonb) from public, anon;
grant execute on function public.admin_bulk_update_products(uuid[], jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Reorder suggestions
-- ---------------------------------------------------------------------------

-- Every size of the shop's own products that is running out or selling faster than its stock covers, with how many to order.
--   daily rate     units sold in the last 30 days (or since the product was added, if newer, but at least 7 days) per day
--   days left      sellable stock divided by the daily rate
--   suggested      what covers (supplier lead time + cover days) of sales, less what is available now
-- urgency: out (sold out but selling), now (runs out before a new order could arrive), soon (inside the cover period), low (at or under the low-stock level).
create or replace function public.admin_reorder_suggestions()
returns table (
  product_id uuid,
  slug text,
  product_name text,
  size_code text,
  size_label text,
  category_name text,
  is_published boolean,
  available integer,
  sold_in_window integer,
  window_days integer,
  daily_rate numeric,
  days_left numeric,
  suggested_qty integer,
  urgency text,
  next_expiry date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_house uuid := public.house_vendor_id();
begin
  perform public.require_staff();
  return query
  with cfg as (
    select st.reorder_lead_days as lead, st.reorder_cover_days as cover, st.low_stock_threshold as low from public.store_settings st
  ),
  sold as (
    select m.product_id as pid, m.size_code as sc, sum(-m.sellable_change)::integer as units
    from public.stock_movements m
    where m.reason = 'sold' and m.at >= now() - interval '30 days'
    group by m.product_id, m.size_code
  ),
  base as (
    select p.id as pid, p.slug as pslug, p.name as pname, i.size_code as sc, s.label as slabel, c.name as cname,
           p.is_published as published, (i.on_hand - i.reserved) as avail,
           coalesce(sold.units, 0) as units,
           least(30, greatest(7, (current_date - p.created_at::date)))::integer as win,
           coalesce(c.low_stock_threshold, cfg.low) as low_level,
           cfg.lead, cfg.cover, s.sort_order as so,
           nx.expires_on
    from public.inventory_levels i
    join public.products p on p.id = i.product_id
    left join public.product_sizes s on s.product_id = i.product_id and s.code = i.size_code
    left join public.categories c on c.id = p.category_id
    left join sold on sold.pid = i.product_id and sold.sc = i.size_code
    left join lateral (
      select min(b.expires_on) as expires_on from public.stock_batches b
      where b.product_id = i.product_id and b.size_code = i.size_code and b.status = 'available' and b.quantity > 0
    ) nx on true
    cross join cfg
    where (p.vendor_id is null or p.vendor_id = v_house) and p.recalled_at is null
  ),
  calc as (
    select b.*, round(b.units::numeric / b.win, 2) as rate from base b
  ),
  scored as (
    select k.*,
           case when k.rate > 0 then round(greatest(k.avail, 0) / k.rate, 1) end as left_days,
           greatest(0, ceil(k.rate * (k.lead + k.cover))::integer - greatest(k.avail, 0)) as suggest
    from calc k
  )
  select z.pid, z.pslug, z.pname, z.sc, z.slabel, z.cname, z.published, z.avail, z.units, z.win, z.rate, z.left_days, z.suggest,
         case
           when z.rate > 0 and z.avail <= 0 then 'out'
           when z.left_days is not null and z.left_days < z.lead then 'now'
           when z.left_days is not null and z.left_days < z.lead + z.cover then 'soon'
           when z.avail <= z.low_level then 'low'
           else 'ok'
         end,
         z.expires_on
  from scored z
  where z.suggest > 0 or z.avail <= z.low_level
  order by case
             when z.rate > 0 and z.avail <= 0 then 0
             when z.left_days is not null and z.left_days < z.lead then 1
             when z.left_days is not null and z.left_days < z.lead + z.cover then 2
             else 3
           end,
           z.left_days nulls last, z.pname, z.so nulls first;
end;
$$;

revoke all on function public.admin_reorder_suggestions() from public, anon;
grant execute on function public.admin_reorder_suggestions() to authenticated;

-- Settings: how long suppliers take and how many days of sales to cover.
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
      pay_on_delivery_enabled = coalesce((p ->> 'pay_on_delivery_enabled')::boolean, s.pay_on_delivery_enabled),
      pay_on_delivery_hold_hours = coalesce((p ->> 'pay_on_delivery_hold_hours')::integer, s.pay_on_delivery_hold_hours),
      pay_on_delivery_max_ghs = case when p ? 'pay_on_delivery_max_ghs'
        then nullif(btrim(p ->> 'pay_on_delivery_max_ghs'), '')::numeric else s.pay_on_delivery_max_ghs end,
      reorder_lead_days = coalesce((p ->> 'reorder_lead_days')::integer, s.reorder_lead_days),
      reorder_cover_days = coalesce((p ->> 'reorder_cover_days')::integer, s.reorder_cover_days),
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
