-- Catalogue management with publishing rules and recalls (PRD FR-100, FR-101), and inventory by batch with
-- expiry dates, a movement ledger and alerts (FR-102, FR-103).
--
-- Stock model:
--   stock_batches.quantity    physical units of a batch in the warehouse (goes down when an order is packed).
--   inventory_levels.on_hand  units that can still be sold: units in usable batches, minus units already sold but
--                             not yet packed. It can drop below `reserved` (even below zero) when stock is recalled,
--                             quarantined or expires while orders hold it; that shortfall is real and shows up when
--                             those orders are packed.

-- ---------------------------------------------------------------------------
-- Product compliance fields and stock thresholds
-- ---------------------------------------------------------------------------

alter table public.products
  -- INCI ingredient list (beauty, bath) or materials (toys, clothing).
  add column ingredients text,
  add column country_of_origin text,
  -- Regulatory reference, e.g. the Ghana FDA registration number. Required for cosmetics.
  add column regulatory_reference text,
  add column period_after_opening text,
  add column recalled_at timestamptz,
  add column recall_reason text;

alter table public.categories
  add column low_stock_threshold integer check (low_stock_threshold >= 0),
  add column expiry_alert_days integer check (expiry_alert_days > 0);

alter table public.store_settings
  add column low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  add column expiry_alert_days integer not null default 90 check (expiry_alert_days > 0),
  add column max_delivery_attempts integer not null default 2 check (max_delivery_attempts between 1 and 5),
  add column require_delivery_code boolean not null default true;

alter table public.inventory_levels
  drop constraint inventory_reserved_within_on_hand,
  drop constraint inventory_levels_on_hand_check;

-- ---------------------------------------------------------------------------
-- Batches, the movement ledger and batch allocations
-- ---------------------------------------------------------------------------

create type public.batch_status as enum ('available', 'quarantined', 'recalled', 'expired');

create table public.stock_batches (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  size_code text not null default '',
  batch_code text not null check (length(btrim(batch_code)) > 0),
  expires_on date,
  quantity integer not null check (quantity >= 0),
  status public.batch_status not null default 'available',
  received_at timestamptz not null default now(),
  -- Supplier, invoice or delivery note reference.
  note text,
  foreign key (product_id, size_code) references public.inventory_levels (product_id, size_code) on delete cascade,
  unique (product_id, size_code, batch_code)
);

create index stock_batches_expiry_idx on public.stock_batches (expires_on) where status = 'available' and quantity > 0;

create type public.stock_movement_reason as enum (
  'opening', 'received', 'sold', 'picked', 'returned', 'restocked',
  'adjusted', 'damaged', 'lost', 'found',
  'quarantined', 'released', 'recalled', 'expired', 'written_off'
);

create table public.stock_movements (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  -- No cascade: a product with stock history can't be deleted, so the ledger stays complete.
  product_id uuid not null references public.products (id),
  size_code text not null default '',
  batch_id uuid references public.stock_batches (id) on delete set null,
  reason public.stock_movement_reason not null,
  -- Change in physical units of the batch.
  quantity integer not null default 0,
  -- Change in units that can be sold (inventory_levels.on_hand).
  sellable_change integer not null default 0,
  order_id uuid references public.orders (id) on delete set null,
  actor_id uuid,
  actor_email text,
  note text
);

create index stock_movements_sku_idx on public.stock_movements (product_id, size_code, at desc);
create index stock_movements_batch_idx on public.stock_movements (batch_id);
create index stock_movements_order_idx on public.stock_movements (order_id);

-- Which batches each order line was packed from, for recalls and returns.
create table public.order_item_batches (
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  batch_id uuid not null references public.stock_batches (id),
  quantity integer not null check (quantity > 0),
  primary key (order_item_id, batch_id)
);

create index order_item_batches_batch_idx on public.order_item_batches (batch_id);

alter table public.stock_batches enable row level security;
alter table public.stock_movements enable row level security;
alter table public.order_item_batches enable row level security;

-- Stock already on hand becomes an opening batch with no expiry date recorded. Paid orders that are not packed yet
-- still need their units, so those go into the batch too. The ledger then adds up: per unit, the movements'
-- sellable_change sums to on_hand, and per batch their quantity sums to the batch's quantity.
with levels as (
  select i.product_id, i.size_code, i.on_hand,
         i.on_hand + coalesce((
           select sum(oi.quantity)::integer from public.order_items oi join public.orders o on o.id = oi.order_id
           where oi.product_id = i.product_id and coalesce(oi.size_code, '') = i.size_code and o.status = 'paid'
         ), 0) as physical
  from public.inventory_levels i
),
batches as (
  insert into public.stock_batches (product_id, size_code, batch_code, quantity, note)
  select l.product_id, l.size_code, 'OPENING', l.physical, 'Stock on hand when batches were introduced'
  from levels l where l.physical > 0
  returning id, product_id, size_code, quantity, note
)
insert into public.stock_movements (product_id, size_code, batch_id, reason, quantity, sellable_change, note)
select b.product_id, b.size_code, b.id, 'opening', b.quantity, l.on_hand, b.note
from batches b join levels l on l.product_id = b.product_id and l.size_code = b.size_code;

-- Records a movement with the signed-in staff member as the actor.
create function public.log_stock_movement(
  p_product_id uuid,
  p_size_code text,
  p_batch_id uuid,
  p_reason public.stock_movement_reason,
  p_quantity integer,
  p_sellable_change integer,
  p_order_id uuid default null,
  p_note text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.stock_movements
    (product_id, size_code, batch_id, reason, quantity, sellable_change, order_id, actor_id, actor_email, note)
  values (
    p_product_id, p_size_code, p_batch_id, p_reason, p_quantity, p_sellable_change, p_order_id,
    auth.uid(), auth.jwt() ->> 'email', nullif(btrim(p_note), '')
  );
$$;

revoke all on function public.log_stock_movement(uuid, text, uuid, public.stock_movement_reason, integer, integer, uuid, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Payments: a sale now also lands in the stock ledger
-- ---------------------------------------------------------------------------
create or replace function public.confirm_payment(
  p_provider text,
  p_reference text,
  p_status text,
  p_amount_ghs numeric,
  p_event jsonb default null
)
returns table (order_number text, order_status public.order_status, payment_status public.payment_status)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
begin
  if p_status not in ('succeeded', 'failed') then
    raise exception 'Unknown payment status %.', p_status using errcode = '22023';
  end if;

  select * into v_payment from public.payments p
  where p.provider = p_provider and p.provider_reference = p_reference
  for update;
  if not found then
    raise exception 'Unknown payment %.', p_reference using errcode = '22023';
  end if;

  select * into v_order from public.orders o where o.id = v_payment.order_id for update;

  -- Final states are final: repeated or out-of-order notifications change nothing.
  if v_payment.status in ('succeeded', 'failed') then
    return query select v_order.order_number, v_order.status, v_payment.status;
    return;
  end if;

  update public.payments p
  set status = p_status::public.payment_status, last_event = p_event
  where p.id = v_payment.id;

  if p_status = 'failed' then
    perform public.release_order_reservation(v_order.id, 'payment_failed');
  elsif p_amount_ghs is distinct from v_payment.amount_ghs then
    -- Money arrived but not the amount we asked for: leave the order for staff to resolve.
    update public.orders o set needs_review = true where o.id = v_order.id;
  elsif v_order.status = 'pending_payment' then
    -- Turn the reservation into a sale, and log it in the stock ledger.
    with held as (
      select oi.product_id, coalesce(oi.size_code, '') as size_code, sum(oi.quantity)::integer as quantity
      from public.order_items oi
      where oi.order_id = v_order.id and oi.product_id is not null
      group by oi.product_id, coalesce(oi.size_code, '')
    ),
    sold as (
      update public.inventory_levels i
      set on_hand = i.on_hand - held.quantity, reserved = i.reserved - held.quantity
      from held
      where i.product_id = held.product_id and i.size_code = held.size_code
      returning i.product_id, i.size_code, held.quantity
    )
    insert into public.stock_movements (product_id, size_code, reason, quantity, sellable_change, order_id)
    select sold.product_id, sold.size_code, 'sold', 0, -sold.quantity, v_order.id from sold;

    update public.orders o set status = 'paid', paid_at = now() where o.id = v_order.id;
  else
    -- Paid after the reservation expired (or the order was cancelled): needs a refund or manual re-instatement.
    update public.orders o set needs_review = true where o.id = v_order.id;
  end if;

  return query
  select o.order_number, o.status, p.status
  from public.orders o join public.payments p on p.order_id = o.id
  where p.id = v_payment.id;
end;
$$;


-- ---------------------------------------------------------------------------
-- Publishing rules (FR-100)
-- ---------------------------------------------------------------------------

-- What a product still needs before it can be shown on the store. Empty when it can be published.
create function public.product_publish_problems(p_product_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.products%rowtype;
  v_cosmetic boolean;
  v_missing text[] := '{}'::text[];
begin
  select * into p from public.products where id = p_product_id;
  if not found then
    return array['product not found'];
  end if;
  v_cosmetic := p.department = 'beauty' or p.kids_filter = 'bath';

  if coalesce(btrim(p.brand), '') = '' then v_missing := v_missing || 'brand'::text; end if;
  if p.category_id is null then v_missing := v_missing || 'category'::text; end if;
  if coalesce(btrim(p.details ->> 'description'), '') = '' then v_missing := v_missing || 'description'::text; end if;
  if coalesce(btrim(p.ingredients), '') = '' then
    v_missing := v_missing || (case when v_cosmetic then 'ingredients' else 'materials' end)::text;
  end if;
  if coalesce(btrim(p.details ->> 'warnings'), '') = '' then v_missing := v_missing || 'safety notes'::text; end if;
  if coalesce(btrim(p.country_of_origin), '') = '' then v_missing := v_missing || 'country of origin'::text; end if;
  if v_cosmetic and coalesce(btrim(p.regulatory_reference), '') = '' then
    v_missing := v_missing || 'FDA registration number'::text;
  end if;
  if p.department = 'kids' and (
    coalesce(btrim(p.details ->> 'recommendedAge'), '') = ''
    or not exists (select 1 from public.product_age_bands b where b.product_id = p.id)
  ) then
    v_missing := v_missing || 'age range'::text;
  end if;
  if p.recalled_at is not null then v_missing := v_missing || 'recall lifted'::text; end if;
  return v_missing;
end;
$$;

revoke all on function public.product_publish_problems(uuid) from public, anon;
grant execute on function public.product_publish_problems(uuid) to authenticated;

-- Creates or updates a product with its sizes and age bands. Returns {id, slug, published, problems}:
-- a product that asks to be published but is missing required fields is saved as a draft instead.
--
-- p: {id?, slug?, name, brand, department, category_id, kids_filter, kind, price_ghs, was_price_ghs, badge, tag,
--     summary, image_key, tint, description, highlights[], free_from[], recommended_age, warnings, how_to_use,
--     ingredients, country_of_origin, regulatory_reference, period_after_opening,
--     sizes: [{code, label, price_ghs, is_default}], age_bands: [id], publish}
create function public.admin_save_product(p jsonb)
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
      period_after_opening, is_published
    ) values (
      v_slug, v_name, nullif(btrim(p ->> 'brand'), ''), v_department, nullif(p ->> 'category_id', ''), v_kids_filter,
      null, v_price, v_was, nullif(btrim(p ->> 'badge'), ''), coalesce(btrim(p ->> 'tag'), ''),
      coalesce(btrim(p ->> 'summary'), ''), nullif(p ->> 'image_key', ''),
      coalesce(nullif(p ->> 'tint', ''), case when v_department = 'beauty' then '#F4E3D7' else '#E3F0EC' end),
      v_kind, v_details, nullif(btrim(p ->> 'ingredients'), ''), nullif(btrim(p ->> 'country_of_origin'), ''),
      nullif(btrim(p ->> 'regulatory_reference'), ''), nullif(btrim(p ->> 'period_after_opening'), ''), false
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
      period_after_opening = nullif(btrim(p ->> 'period_after_opening'), '')
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

revoke all on function public.admin_save_product(jsonb) from public, anon;
grant execute on function public.admin_save_product(jsonb) to authenticated;

-- Shows or hides a product on the store. Returns what is still missing when it can't be published.
create function public.admin_set_product_published(p_product_id uuid, p_published boolean)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_problems text[] := '{}'::text[];
begin
  perform public.require_staff(array['catalogue']::public.staff_role[]);
  if p_published then
    v_problems := public.product_publish_problems(p_product_id);
    if cardinality(v_problems) > 0 then
      return v_problems;
    end if;
  end if;
  update public.products x set is_published = p_published where x.id = p_product_id and x.is_published <> p_published;
  if found then
    perform public.audit(case when p_published then 'product.published' else 'product.unpublished' end,
      'product', p_product_id::text, null);
  end if;
  return v_problems;
end;
$$;

revoke all on function public.admin_set_product_published(uuid, boolean) from public, anon;
grant execute on function public.admin_set_product_published(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Batch status changes (shared by recalls, quarantine and expiry)
-- ---------------------------------------------------------------------------

create function public.change_batch_status(
  p_batch_id uuid,
  p_status public.batch_status,
  p_reason public.stock_movement_reason,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.stock_batches%rowtype;
  v_sellable integer := 0;
begin
  select * into b from public.stock_batches x where x.id = p_batch_id for update;
  if not found then
    raise exception 'That batch no longer exists.' using errcode = '22023';
  end if;
  if b.status = p_status then
    return;
  end if;
  if b.status in ('recalled', 'expired') then
    raise exception 'Batch % is %; it can only be written off.', b.batch_code, b.status using errcode = '22023';
  end if;
  if p_status = 'available' and b.expires_on < current_date then
    raise exception 'Batch % is past its expiry date.', b.batch_code using errcode = '22023';
  end if;

  if b.status = 'available' then
    v_sellable := -b.quantity;
  elsif p_status = 'available' then
    v_sellable := b.quantity;
  end if;

  update public.stock_batches x set status = p_status where x.id = b.id;
  update public.inventory_levels i set on_hand = i.on_hand + v_sellable
  where i.product_id = b.product_id and i.size_code = b.size_code;
  perform public.log_stock_movement(b.product_id, b.size_code, b.id, p_reason, 0, v_sellable, null, p_note);

  -- Packed orders carrying a recalled batch must be stopped before they reach a customer.
  if p_status = 'recalled' then
    update public.orders o set needs_review = true
    where o.status in ('packing', 'packed', 'out_for_delivery', 'delivery_failed')
      and exists (select 1 from public.order_item_batches ab join public.order_items oi on oi.id = ab.order_item_id
                  where ab.batch_id = b.id and oi.order_id = o.id);
  end if;
end;
$$;

revoke all on function public.change_batch_status(uuid, public.batch_status, public.stock_movement_reason, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Recalls (FR-101)
-- ---------------------------------------------------------------------------

create function public.admin_recall_product(p_product_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch uuid;
begin
  perform public.require_staff(array['catalogue', 'operations']::public.staff_role[]);
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Give a reason for the recall.' using errcode = '22023';
  end if;
  update public.products x set is_published = false, recalled_at = now(), recall_reason = btrim(p_reason)
  where x.id = p_product_id;
  if not found then
    raise exception 'That product no longer exists.' using errcode = '22023';
  end if;

  for v_batch in
    select b.id from public.stock_batches b where b.product_id = p_product_id and b.status in ('available', 'quarantined')
  loop
    perform public.change_batch_status(v_batch, 'recalled', 'recalled', p_reason);
  end loop;

  -- Paid orders that haven't gone out yet need a decision from staff.
  update public.orders o set needs_review = true
  where o.status in ('paid', 'packing', 'packed', 'out_for_delivery', 'delivery_failed')
    and exists (select 1 from public.order_items oi where oi.order_id = o.id and oi.product_id = p_product_id);

  perform public.audit('product.recalled', 'product', p_product_id::text, jsonb_build_object('reason', btrim(p_reason)));
end;
$$;

revoke all on function public.admin_recall_product(uuid, text) from public, anon;
grant execute on function public.admin_recall_product(uuid, text) to authenticated;

-- Lifts a product recall so it can be published again. Its recalled batches stay recalled.
create function public.admin_lift_recall(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['admin']::public.staff_role[]);
  update public.products x set recalled_at = null, recall_reason = null where x.id = p_product_id;
  perform public.audit('product.recall_lifted', 'product', p_product_id::text, null);
end;
$$;

revoke all on function public.admin_lift_recall(uuid) from public, anon;
grant execute on function public.admin_lift_recall(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Stock changes (FR-102). Every one is logged with who, when and why.
-- ---------------------------------------------------------------------------

-- Receives stock into a batch. Cosmetics need an expiry date.
create function public.admin_receive_stock(
  p_product_id uuid,
  p_size_code text,
  p_batch_code text,
  p_expires_on date,
  p_quantity integer,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_code text := upper(btrim(coalesce(p_batch_code, '')));
  v_size text := coalesce(p_size_code, '');
  v_batch public.stock_batches%rowtype;
begin
  perform public.require_staff(array['operations']::public.staff_role[]);
  select * into v_product from public.products x where x.id = p_product_id;
  if not found or not exists (select 1 from public.inventory_levels i where i.product_id = p_product_id and i.size_code = v_size) then
    raise exception 'Choose a product and size.' using errcode = '22023';
  end if;
  if v_code = '' then
    raise exception 'Enter the batch number printed on the pack.' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 100000 then
    raise exception 'Enter how many units arrived.' using errcode = '22023';
  end if;
  if p_expires_on is null and (v_product.department = 'beauty' or v_product.kids_filter = 'bath') then
    raise exception 'Enter the expiry date; it''s required for beauty and bath products.' using errcode = '22023';
  end if;
  if p_expires_on <= current_date then
    raise exception 'That expiry date has already passed.' using errcode = '22023';
  end if;

  select * into v_batch from public.stock_batches b
  where b.product_id = p_product_id and b.size_code = v_size and b.batch_code = v_code for update;
  if found then
    if v_batch.status <> 'available' then
      raise exception 'Batch % is %, so new stock can''t be added to it.', v_code, v_batch.status using errcode = '22023';
    end if;
    if v_batch.expires_on is distinct from p_expires_on then
      raise exception 'Batch % is already recorded with expiry %.', v_code, coalesce(v_batch.expires_on::text, 'not set')
        using errcode = '22023';
    end if;
    update public.stock_batches b set quantity = b.quantity + p_quantity where b.id = v_batch.id;
  else
    insert into public.stock_batches (product_id, size_code, batch_code, expires_on, quantity, note)
    values (p_product_id, v_size, v_code, p_expires_on, p_quantity, nullif(btrim(p_note), ''))
    returning * into v_batch;
  end if;

  update public.inventory_levels i set on_hand = i.on_hand + p_quantity
  where i.product_id = p_product_id and i.size_code = v_size;
  perform public.log_stock_movement(p_product_id, v_size, v_batch.id, 'received', p_quantity, p_quantity, null, p_note);
  perform public.audit('stock.received', 'batch', v_batch.id::text,
    jsonb_build_object('batch_code', v_code, 'quantity', p_quantity, 'expires_on', p_expires_on));
  return v_batch.id;
end;
$$;

revoke all on function public.admin_receive_stock(uuid, text, text, date, integer, text) from public, anon;
grant execute on function public.admin_receive_stock(uuid, text, text, date, integer, text) to authenticated;

-- Corrects a batch count: damage, loss, a recount. A note is required.
create function public.admin_adjust_batch(
  p_batch_id uuid,
  p_change integer,
  p_reason public.stock_movement_reason,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.stock_batches%rowtype;
  v_sellable integer;
begin
  perform public.require_staff(array['operations']::public.staff_role[]);
  if p_reason not in ('adjusted', 'damaged', 'lost', 'found') then
    raise exception 'Choose why the count changed.' using errcode = '22023';
  end if;
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'Add a note explaining the change.' using errcode = '22023';
  end if;
  if p_change is null or p_change = 0 then
    raise exception 'Enter how many units to add or remove.' using errcode = '22023';
  end if;
  select * into b from public.stock_batches x where x.id = p_batch_id for update;
  if not found then
    raise exception 'That batch no longer exists.' using errcode = '22023';
  end if;
  if b.quantity + p_change < 0 then
    raise exception 'Batch % only has % units.', b.batch_code, b.quantity using errcode = '22023';
  end if;

  v_sellable := case when b.status = 'available' then p_change else 0 end;
  update public.stock_batches x set quantity = x.quantity + p_change where x.id = b.id;
  update public.inventory_levels i set on_hand = i.on_hand + v_sellable
  where i.product_id = b.product_id and i.size_code = b.size_code;
  perform public.log_stock_movement(b.product_id, b.size_code, b.id, p_reason, p_change, v_sellable, null, p_note);
  perform public.audit('stock.adjusted', 'batch', b.id::text,
    jsonb_build_object('batch_code', b.batch_code, 'change', p_change, 'reason', p_reason, 'note', btrim(p_note)));
end;
$$;

revoke all on function public.admin_adjust_batch(uuid, integer, public.stock_movement_reason, text) from public, anon;
grant execute on function public.admin_adjust_batch(uuid, integer, public.stock_movement_reason, text) to authenticated;

-- Quarantines, releases or recalls a batch.
create function public.admin_set_batch_status(p_batch_id uuid, p_status public.batch_status, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status = 'recalled' then
    perform public.require_staff(array['catalogue', 'operations']::public.staff_role[]);
  elsif p_status in ('quarantined', 'available') then
    perform public.require_staff(array['operations']::public.staff_role[]);
  else
    raise exception 'Batches expire on their own; choose quarantine, release or recall.' using errcode = '22023';
  end if;
  if p_status <> 'available' and coalesce(btrim(p_note), '') = '' then
    raise exception 'Add a note explaining why.' using errcode = '22023';
  end if;
  perform public.change_batch_status(p_batch_id, p_status,
    (case p_status when 'available' then 'released' else p_status::text end)::public.stock_movement_reason, p_note);
  perform public.audit('batch.' || p_status::text, 'batch', p_batch_id::text, jsonb_build_object('note', btrim(p_note)));
end;
$$;

revoke all on function public.admin_set_batch_status(uuid, public.batch_status, text) from public, anon;
grant execute on function public.admin_set_batch_status(uuid, public.batch_status, text) to authenticated;

-- Disposes of a batch that is out of sale (quarantined, recalled or expired).
create function public.admin_write_off_batch(p_batch_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.stock_batches%rowtype;
begin
  perform public.require_staff(array['operations']::public.staff_role[]);
  select * into b from public.stock_batches x where x.id = p_batch_id for update;
  if not found then
    raise exception 'That batch no longer exists.' using errcode = '22023';
  end if;
  if b.status = 'available' then
    raise exception 'Quarantine batch % before writing it off.', b.batch_code using errcode = '22023';
  end if;
  if b.quantity = 0 then
    return;
  end if;
  update public.stock_batches x set quantity = 0 where x.id = b.id;
  perform public.log_stock_movement(b.product_id, b.size_code, b.id, 'written_off', -b.quantity, 0, null, p_note);
  perform public.audit('batch.written_off', 'batch', b.id::text,
    jsonb_build_object('batch_code', b.batch_code, 'quantity', b.quantity, 'note', btrim(p_note)));
end;
$$;

revoke all on function public.admin_write_off_batch(uuid, text) from public, anon;
grant execute on function public.admin_write_off_batch(uuid, text) to authenticated;

-- Takes batches past their expiry date off sale. Runs daily.
create function public.expire_batches()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch uuid;
  v_count integer := 0;
begin
  for v_batch in
    select b.id from public.stock_batches b
    where b.status = 'available' and b.expires_on < current_date
    for update skip locked
  loop
    perform public.change_batch_status(v_batch, 'expired', 'expired', 'Past its expiry date');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.expire_batches() from public, anon, authenticated;

select cron.schedule('expire-batches', '5 0 * * *', 'select public.expire_batches()');

-- ---------------------------------------------------------------------------
-- Stock overview and alerts (FR-103)
-- ---------------------------------------------------------------------------

create function public.admin_stock_overview()
returns table (
  product_id uuid,
  slug text,
  product_name text,
  is_published boolean,
  size_code text,
  size_label text,
  category_name text,
  on_hand integer,
  reserved integer,
  available integer,
  low_stock_threshold integer,
  is_low boolean,
  next_expiry date,
  expiring_soon boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff();
  return query
  select p.id, p.slug, p.name, p.is_published, i.size_code, s.label, c.name,
         i.on_hand, i.reserved, i.on_hand - i.reserved,
         coalesce(c.low_stock_threshold, st.low_stock_threshold),
         i.on_hand - i.reserved <= coalesce(c.low_stock_threshold, st.low_stock_threshold),
         nx.expires_on,
         nx.expires_on <= current_date + coalesce(c.expiry_alert_days, st.expiry_alert_days)
  from public.inventory_levels i
  join public.products p on p.id = i.product_id
  left join public.product_sizes s on s.product_id = i.product_id and s.code = i.size_code
  left join public.categories c on c.id = p.category_id
  cross join public.store_settings st
  left join lateral (
    select min(b.expires_on) as expires_on from public.stock_batches b
    where b.product_id = i.product_id and b.size_code = i.size_code and b.status = 'available' and b.quantity > 0
  ) nx on true
  order by p.name, s.sort_order nulls first;
end;
$$;

revoke all on function public.admin_stock_overview() from public, anon;
grant execute on function public.admin_stock_overview() to authenticated;

-- Batches to act on: expiring within the alert window, or already expired and still holding units.
create function public.admin_expiring_batches()
returns table (
  batch_id uuid,
  product_id uuid,
  product_name text,
  size_code text,
  size_label text,
  batch_code text,
  expires_on date,
  quantity integer,
  status public.batch_status,
  days_left integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff();
  return query
  select b.id, p.id, p.name, b.size_code, s.label, b.batch_code, b.expires_on, b.quantity, b.status,
         b.expires_on - current_date
  from public.stock_batches b
  join public.products p on p.id = b.product_id
  left join public.product_sizes s on s.product_id = b.product_id and s.code = b.size_code
  left join public.categories c on c.id = p.category_id
  cross join public.store_settings st
  where b.quantity > 0 and b.expires_on is not null and (
    b.status = 'expired'
    or (b.status = 'available' and b.expires_on <= current_date + coalesce(c.expiry_alert_days, st.expiry_alert_days))
  )
  order by b.expires_on, p.name;
end;
$$;

revoke all on function public.admin_expiring_batches() from public, anon;
grant execute on function public.admin_expiring_batches() to authenticated;

-- ---------------------------------------------------------------------------
-- Staff can read the whole catalogue (including drafts) and the stock ledger.
-- ---------------------------------------------------------------------------

create policy "Staff can read all products" on public.products
  for select to authenticated using ((select public.current_staff_role()) is not null);

create policy "Staff can read all sizes" on public.product_sizes
  for select to authenticated using ((select public.current_staff_role()) is not null);

create policy "Staff can read all age bands of products" on public.product_age_bands
  for select to authenticated using ((select public.current_staff_role()) is not null);

create policy "Staff can read batches" on public.stock_batches
  for select to authenticated using ((select public.current_staff_role()) is not null);

create policy "Staff can read stock movements" on public.stock_movements
  for select to authenticated using ((select public.current_staff_role()) is not null);

create policy "Staff can read batch allocations" on public.order_item_batches
  for select to authenticated using ((select public.current_staff_role()) is not null);

grant select on public.stock_batches, public.stock_movements, public.order_item_batches to authenticated;

-- The catalogue for the admin console: every product with what it still needs before it can be published.
create function public.admin_products()
returns table (
  id uuid,
  slug text,
  name text,
  brand text,
  department public.department,
  category_name text,
  price_ghs numeric,
  is_published boolean,
  recalled_at timestamptz,
  available integer,
  problems text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff();
  return query
  select p.id, p.slug, p.name, p.brand, p.department, c.name, p.price_ghs, p.is_published, p.recalled_at,
         coalesce((select sum(i.on_hand - i.reserved)::integer from public.inventory_levels i where i.product_id = p.id), 0),
         public.product_publish_problems(p.id)
  from public.products p
  left join public.categories c on c.id = p.category_id
  order by p.name;
end;
$$;

revoke all on function public.admin_products() from public, anon;
grant execute on function public.admin_products() to authenticated;
