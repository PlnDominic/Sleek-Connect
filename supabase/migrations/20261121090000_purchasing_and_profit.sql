-- Purchasing and profit: purchase orders to suppliers (received into stock with batch, expiry and cost), stock counts, profit and margin
-- reports, and what the store owes each supplier. All reached only through admin_* functions; the tables have no direct grants.
--   Purchase orders and stock counts: operations (and admin). Profit and money owed: finance (and admin).

-- ---------------------------------------------------------------------------
-- Purchase orders
-- ---------------------------------------------------------------------------

create sequence public.purchase_order_seq start 1001;

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default ('PO-' || nextval('public.purchase_order_seq')),
  supplier_id uuid not null references public.suppliers (id),
  status text not null default 'draft' check (status in ('draft', 'ordered', 'part_received', 'received', 'cancelled')),
  expected_on date,
  note text check (note is null or length(note) <= 500),
  ordered_at timestamptz,
  created_by text,
  created_at timestamptz not null default now()
);

create table public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders (id) on delete cascade,
  product_id uuid not null references public.products (id),
  size_code text not null default '',
  quantity_ordered integer not null check (quantity_ordered between 1 and 100000),
  quantity_received integer not null default 0 check (quantity_received >= 0),
  unit_cost_ghs numeric(10, 2) not null check (unit_cost_ghs >= 0),
  foreign key (product_id, size_code) references public.inventory_levels (product_id, size_code)
);

create index purchase_order_lines_po_idx on public.purchase_order_lines (po_id);
create index purchase_orders_supplier_idx on public.purchase_orders (supplier_id);

alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
revoke all on public.purchase_orders, public.purchase_order_lines from anon, authenticated;

-- Creates a draft purchase order, or replaces the lines of an existing draft.
-- p: { id?, supplier_id, expected_on?, note?, lines: [{ product_id, size_code, quantity, unit_cost_ghs }] }
create function public.admin_save_purchase_order(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_supplier uuid := nullif(p ->> 'supplier_id', '')::uuid;
  v_expected date := nullif(p ->> 'expected_on', '')::date;
  v_note text := nullif(btrim(coalesce(p ->> 'note', '')), '');
  v_email text;
  l jsonb;
  v_lines integer := 0;
begin
  perform public.require_staff(array['operations']::public.staff_role[]);
  select u.email into v_email from auth.users u where u.id = auth.uid();
  if v_supplier is null or not exists (select 1 from public.suppliers s where s.id = v_supplier and s.is_active) then
    raise exception 'Choose a supplier from the list.' using errcode = '22023';
  end if;
  if jsonb_typeof(p -> 'lines') is distinct from 'array' or jsonb_array_length(p -> 'lines') = 0 then
    raise exception 'Add at least one product to the order.' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.purchase_orders (supplier_id, expected_on, note, created_by) values (v_supplier, v_expected, v_note, v_email) returning id into v_id;
  else
    update public.purchase_orders o set supplier_id = v_supplier, expected_on = v_expected, note = v_note
    where o.id = v_id and o.status = 'draft';
    if not found then
      raise exception 'Only a draft order can be changed.' using errcode = '22023';
    end if;
    delete from public.purchase_order_lines where po_id = v_id;
  end if;

  for l in select * from jsonb_array_elements(p -> 'lines') loop
    if coalesce(l ->> 'quantity', '') !~ '^\d{1,6}$' or (l ->> 'quantity')::integer < 1 then
      raise exception 'Every line needs a quantity of at least 1.' using errcode = '22023';
    end if;
    if coalesce(l ->> 'unit_cost_ghs', '') !~ '^\d+(\.\d{1,2})?$' then
      raise exception 'Every line needs the cost per unit.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.inventory_levels i where i.product_id = (l ->> 'product_id')::uuid and i.size_code = coalesce(l ->> 'size_code', '')) then
      raise exception 'A product on the order no longer exists.' using errcode = '22023';
    end if;
    insert into public.purchase_order_lines (po_id, product_id, size_code, quantity_ordered, unit_cost_ghs)
    values (v_id, (l ->> 'product_id')::uuid, coalesce(l ->> 'size_code', ''), (l ->> 'quantity')::integer, (l ->> 'unit_cost_ghs')::numeric);
    v_lines := v_lines + 1;
  end loop;
  perform public.audit('purchase_order.saved', 'purchase_order', v_id::text, jsonb_build_object('lines', v_lines));
  return v_id;
end;
$$;

revoke all on function public.admin_save_purchase_order(jsonb) from public, anon;
grant execute on function public.admin_save_purchase_order(jsonb) to authenticated;

create function public.admin_list_purchase_orders(p_status text default null)
returns table (
  id uuid, number text, status text, supplier_id uuid, supplier_name text, expected_on date, ordered_at timestamptz,
  lines bigint, units_ordered bigint, units_received bigint, total_cost_ghs numeric, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['operations', 'finance']::public.staff_role[]);
  return query
    select o.id, o.number, o.status, o.supplier_id, s.name, o.expected_on, o.ordered_at,
           count(l.id), coalesce(sum(l.quantity_ordered), 0)::bigint, coalesce(sum(l.quantity_received), 0)::bigint,
           coalesce(sum(l.quantity_ordered * l.unit_cost_ghs), 0), o.created_at
    from public.purchase_orders o
    join public.suppliers s on s.id = o.supplier_id
    left join public.purchase_order_lines l on l.po_id = o.id
    where p_status is null or o.status = p_status
    group by o.id, s.name
    order by o.created_at desc
    limit 300;
end;
$$;

revoke all on function public.admin_list_purchase_orders(text) from public, anon;
grant execute on function public.admin_list_purchase_orders(text) to authenticated;

create function public.admin_get_purchase_order(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform public.require_staff(array['operations', 'finance']::public.staff_role[]);
  select jsonb_build_object(
    'id', o.id, 'number', o.number, 'status', o.status, 'supplier_id', o.supplier_id, 'supplier_name', s.name,
    'expected_on', o.expected_on, 'ordered_at', o.ordered_at, 'note', o.note, 'created_by', o.created_by, 'created_at', o.created_at,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'product_id', l.product_id, 'product_name', p.name, 'size_code', l.size_code,
        'size_label', coalesce((select ps.label from public.product_sizes ps where ps.product_id = l.product_id and ps.code = l.size_code), ''),
        'quantity_ordered', l.quantity_ordered, 'quantity_received', l.quantity_received, 'unit_cost_ghs', l.unit_cost_ghs,
        'needs_expiry', (p.department = 'beauty' or p.kids_filter = 'bath')
      ) order by p.name, l.size_code)
      from public.purchase_order_lines l join public.products p on p.id = l.product_id where l.po_id = o.id
    ), '[]'::jsonb)
  ) into v_result
  from public.purchase_orders o join public.suppliers s on s.id = o.supplier_id where o.id = p_id;
  if v_result is null then
    raise exception 'That order no longer exists.' using errcode = '22023';
  end if;
  return v_result;
end;
$$;

revoke all on function public.admin_get_purchase_order(uuid) from public, anon;
grant execute on function public.admin_get_purchase_order(uuid) to authenticated;

-- Sends a draft to the supplier (the order is marked as placed; the supplier is contacted outside the system).
create function public.admin_place_purchase_order(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['operations']::public.staff_role[]);
  update public.purchase_orders o set status = 'ordered', ordered_at = now() where o.id = p_id and o.status = 'draft';
  if not found then
    raise exception 'Only a draft order can be placed.' using errcode = '22023';
  end if;
  perform public.audit('purchase_order.placed', 'purchase_order', p_id::text, null);
end;
$$;

revoke all on function public.admin_place_purchase_order(uuid) from public, anon;
grant execute on function public.admin_place_purchase_order(uuid) to authenticated;

-- Cancels an order nothing has been received on.
create function public.admin_cancel_purchase_order(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['operations']::public.staff_role[]);
  if exists (select 1 from public.purchase_order_lines l where l.po_id = p_id and l.quantity_received > 0) then
    raise exception 'Stock was already received on this order. Mark it as complete instead.' using errcode = '22023';
  end if;
  update public.purchase_orders o set status = 'cancelled' where o.id = p_id and o.status in ('draft', 'ordered');
  if not found then
    raise exception 'This order can''t be cancelled.' using errcode = '22023';
  end if;
  perform public.audit('purchase_order.cancelled', 'purchase_order', p_id::text, null);
end;
$$;

revoke all on function public.admin_cancel_purchase_order(uuid) from public, anon;
grant execute on function public.admin_cancel_purchase_order(uuid) to authenticated;

-- Marks a partly received order as complete (the supplier won't send the rest).
create function public.admin_complete_purchase_order(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['operations']::public.staff_role[]);
  update public.purchase_orders o set status = 'received' where o.id = p_id and o.status = 'part_received';
  if not found then
    raise exception 'Only a partly received order can be marked complete.' using errcode = '22023';
  end if;
  perform public.audit('purchase_order.completed', 'purchase_order', p_id::text, null);
end;
$$;

revoke all on function public.admin_complete_purchase_order(uuid) from public, anon;
grant execute on function public.admin_complete_purchase_order(uuid) to authenticated;

-- Receives what arrived into stock, with the supplier, cost per unit and the order number as the reference.
-- p_lines: [{ line_id, quantity, batch_code, expires_on? }] (lines with quantity 0 are skipped).
create function public.admin_receive_purchase_order(p_id uuid, p_lines jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.purchase_orders%rowtype;
  r jsonb;
  l public.purchase_order_lines%rowtype;
  v_qty integer;
  v_received integer := 0;
  v_open integer;
begin
  perform public.require_staff(array['operations']::public.staff_role[]);
  select * into o from public.purchase_orders x where x.id = p_id for update;
  if not found or o.status not in ('ordered', 'part_received') then
    raise exception 'Stock can only be received on a placed order.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception 'Enter what arrived.' using errcode = '22023';
  end if;
  for r in select * from jsonb_array_elements(p_lines) loop
    v_qty := coalesce(nullif(r ->> 'quantity', ''), '0')::integer;
    continue when v_qty = 0;
    select * into l from public.purchase_order_lines x where x.id = (r ->> 'line_id')::uuid and x.po_id = p_id for update;
    if not found then
      raise exception 'A line is not on this order.' using errcode = '22023';
    end if;
    if v_qty < 0 or v_qty > l.quantity_ordered - l.quantity_received then
      raise exception 'You can receive up to % more of this line.', l.quantity_ordered - l.quantity_received using errcode = '22023';
    end if;
    perform public.admin_receive_stock_from(
      l.product_id, l.size_code, coalesce(r ->> 'batch_code', ''), nullif(r ->> 'expires_on', '')::date, v_qty, o.supplier_id, l.unit_cost_ghs, o.number);
    update public.purchase_order_lines x set quantity_received = x.quantity_received + v_qty where x.id = l.id;
    v_received := v_received + v_qty;
  end loop;
  if v_received = 0 then
    raise exception 'Enter how many arrived on at least one line.' using errcode = '22023';
  end if;
  select count(*) into v_open from public.purchase_order_lines x where x.po_id = p_id and x.quantity_received < x.quantity_ordered;
  update public.purchase_orders x set status = case when v_open = 0 then 'received' else 'part_received' end where x.id = p_id;
  perform public.audit('purchase_order.received', 'purchase_order', p_id::text, jsonb_build_object('units', v_received));
  return jsonb_build_object('units', v_received, 'status', case when v_open = 0 then 'received' else 'part_received' end);
end;
$$;

revoke all on function public.admin_receive_purchase_order(uuid, jsonb) from public, anon;
grant execute on function public.admin_receive_purchase_order(uuid, jsonb) to authenticated;

-- A draft order from the reorder suggestions, for the products whose usual supplier is p_supplier_id. The cost per unit is the last one paid.
create function public.admin_reorder_to_po(p_supplier_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lines jsonb;
begin
  perform public.require_staff(array['operations']::public.staff_role[]);
  select coalesce(jsonb_agg(jsonb_build_object(
      'product_id', r.product_id, 'size_code', r.size_code, 'quantity', r.suggested_qty,
      'unit_cost_ghs', coalesce((
        select sr.unit_cost_ghs from public.stock_receipts sr
        where sr.product_id = r.product_id and sr.size_code = r.size_code and sr.unit_cost_ghs is not null
        order by sr.received_at desc limit 1), 0))), '[]'::jsonb)
  into v_lines
  from public.admin_reorder_suggestions() r
  join public.products p on p.id = r.product_id
  where p.supplier_id = p_supplier_id and r.suggested_qty > 0;
  if jsonb_array_length(v_lines) = 0 then
    raise exception 'Nothing to reorder from this supplier right now.' using errcode = '22023';
  end if;
  return public.admin_save_purchase_order(jsonb_build_object('supplier_id', p_supplier_id, 'lines', v_lines, 'note', 'From the reorder suggestions'));
end;
$$;

revoke all on function public.admin_reorder_to_po(uuid) from public, anon;
grant execute on function public.admin_reorder_to_po(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Stock counts: the counted quantity for each batch; differences become "found" or "lost" movements with the note.
-- p_counts: [{ batch_id, counted }]
-- ---------------------------------------------------------------------------

create function public.admin_apply_stock_count(p_counts jsonb, p_note text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  c jsonb;
  b public.stock_batches%rowtype;
  v_counted integer;
  v_adjusted integer := 0;
begin
  perform public.require_staff(array['operations']::public.staff_role[]);
  if jsonb_typeof(p_counts) is distinct from 'array' then
    raise exception 'Enter the counts.' using errcode = '22023';
  end if;
  for c in select * from jsonb_array_elements(p_counts) loop
    continue when coalesce(c ->> 'counted', '') = '';
    v_counted := (c ->> 'counted')::integer;
    select * into b from public.stock_batches x where x.id = (c ->> 'batch_id')::uuid;
    continue when not found;
    if v_counted < 0 then
      raise exception 'A count can''t be negative.' using errcode = '22023';
    end if;
    if v_counted <> b.quantity then
      perform public.admin_adjust_batch(b.id, v_counted - b.quantity,
        (case when v_counted > b.quantity then 'found' else 'lost' end)::public.stock_movement_reason,
        'Stock count: ' || coalesce(nullif(btrim(p_note), ''), 'shelf count'));
      v_adjusted := v_adjusted + 1;
    end if;
  end loop;
  perform public.audit('stock.counted', 'inventory', null, jsonb_build_object('batches_adjusted', v_adjusted));
  return v_adjusted;
end;
$$;

revoke all on function public.admin_apply_stock_count(jsonb, text) from public, anon;
grant execute on function public.admin_apply_stock_count(jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Profit and margin (finance). Revenue is the items on paid orders in the period (before discounts and delivery fees); cost is what the
-- batches the items were packed from cost. Items packed from batches received before costs were recorded count as "cost unknown",
-- and the margin is worked out only on units whose cost is known.
-- ---------------------------------------------------------------------------

create function public.admin_profit_by_product(p_from date, p_to date)
returns table (product_id uuid, product_name text, units bigint, revenue_ghs numeric, cost_ghs numeric, margin_ghs numeric, margin_pct numeric, units_cost_known bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['finance']::public.staff_role[]);
  return query
  with items as (
    select oi.id, oi.product_id as pid, oi.product_name as pname, oi.quantity, oi.line_total_ghs,
           coalesce(sum(ob.quantity) filter (where b.unit_cost_ghs is not null), 0)::integer as known_units,
           coalesce(sum(ob.quantity * b.unit_cost_ghs) filter (where b.unit_cost_ghs is not null), 0) as cost
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join public.order_item_batches ob on ob.order_item_id = oi.id
    left join public.stock_batches b on b.id = ob.batch_id
    where o.paid_at >= p_from::timestamptz and o.paid_at < (p_to + 1)::timestamptz and o.status not in ('cancelled', 'returned')
    group by oi.id
  )
  select i.pid, max(i.pname), sum(i.quantity)::bigint, sum(i.line_total_ghs), sum(i.cost),
         sum(i.line_total_ghs * least(i.known_units, i.quantity)::numeric / i.quantity) - sum(i.cost),
         case when sum(i.line_total_ghs * least(i.known_units, i.quantity)::numeric / i.quantity) > 0
              then round(((sum(i.line_total_ghs * least(i.known_units, i.quantity)::numeric / i.quantity) - sum(i.cost))
                          / sum(i.line_total_ghs * least(i.known_units, i.quantity)::numeric / i.quantity)) * 100, 1) end,
         sum(least(i.known_units, i.quantity))::bigint
  from items i
  group by i.pid
  order by sum(i.line_total_ghs) desc;
end;
$$;

revoke all on function public.admin_profit_by_product(date, date) from public, anon;
grant execute on function public.admin_profit_by_product(date, date) to authenticated;

-- The value of the stock on the shelves at cost (batches with a recorded cost) and how many units have no cost recorded.
create function public.admin_stock_value()
returns table (value_ghs numeric, units bigint, units_without_cost bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['finance']::public.staff_role[]);
  return query
    select coalesce(sum(b.quantity * b.unit_cost_ghs) filter (where b.unit_cost_ghs is not null), 0),
           coalesce(sum(b.quantity), 0)::bigint,
           coalesce(sum(b.quantity) filter (where b.unit_cost_ghs is null), 0)::bigint
    from public.stock_batches b where b.status in ('available', 'quarantined') and b.quantity > 0;
end;
$$;

revoke all on function public.admin_stock_value() from public, anon;
grant execute on function public.admin_stock_value() to authenticated;

-- ---------------------------------------------------------------------------
-- What the store owes each supplier: the cost of what was received minus what has been paid.
-- ---------------------------------------------------------------------------

create table public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id),
  amount_ghs numeric(12, 2) not null check (amount_ghs > 0),
  paid_on date not null default current_date,
  method text not null check (method in ('momo', 'bank', 'cash', 'other')),
  reference text check (reference is null or length(reference) <= 120),
  note text check (note is null or length(note) <= 300),
  recorded_by text,
  created_at timestamptz not null default now()
);

alter table public.supplier_payments enable row level security;
revoke all on public.supplier_payments from anon, authenticated;

create function public.admin_record_supplier_payment(p_supplier_id uuid, p_amount numeric, p_paid_on date, p_method text, p_reference text, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_email text;
begin
  perform public.require_staff(array['finance']::public.staff_role[]);
  if not exists (select 1 from public.suppliers s where s.id = p_supplier_id) then
    raise exception 'Choose a supplier from the list.' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter the amount paid.' using errcode = '22023';
  end if;
  if p_method is null or p_method not in ('momo', 'bank', 'cash', 'other') then
    raise exception 'Choose how it was paid.' using errcode = '22023';
  end if;
  select u.email into v_email from auth.users u where u.id = auth.uid();
  insert into public.supplier_payments (supplier_id, amount_ghs, paid_on, method, reference, note, recorded_by)
  values (p_supplier_id, round(p_amount, 2), coalesce(p_paid_on, current_date), p_method, nullif(btrim(p_reference), ''), nullif(btrim(p_note), ''), v_email)
  returning id into v_id;
  perform public.audit('supplier.payment_recorded', 'supplier', p_supplier_id::text, jsonb_build_object('amount_ghs', round(p_amount, 2), 'method', p_method));
  return v_id;
end;
$$;

revoke all on function public.admin_record_supplier_payment(uuid, numeric, date, text, text, text) from public, anon;
grant execute on function public.admin_record_supplier_payment(uuid, numeric, date, text, text, text) to authenticated;

create function public.admin_delete_supplier_payment(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_supplier uuid;
begin
  perform public.require_staff(array['finance']::public.staff_role[]);
  delete from public.supplier_payments x where x.id = p_id returning x.supplier_id into v_supplier;
  if not found then
    raise exception 'That payment no longer exists.' using errcode = '22023';
  end if;
  perform public.audit('supplier.payment_deleted', 'supplier', v_supplier::text, null);
end;
$$;

revoke all on function public.admin_delete_supplier_payment(uuid) from public, anon;
grant execute on function public.admin_delete_supplier_payment(uuid) to authenticated;

create function public.admin_supplier_balances()
returns table (supplier_id uuid, name text, received_cost_ghs numeric, units_without_cost bigint, paid_ghs numeric, owed_ghs numeric, last_payment date)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['finance']::public.staff_role[]);
  return query
    select s.id, s.name,
           coalesce((select sum(r.quantity * r.unit_cost_ghs) from public.stock_receipts r where r.supplier_id = s.id and r.unit_cost_ghs is not null), 0),
           coalesce((select sum(r.quantity) from public.stock_receipts r where r.supplier_id = s.id and r.unit_cost_ghs is null), 0)::bigint,
           coalesce((select sum(p.amount_ghs) from public.supplier_payments p where p.supplier_id = s.id), 0),
           coalesce((select sum(r.quantity * r.unit_cost_ghs) from public.stock_receipts r where r.supplier_id = s.id and r.unit_cost_ghs is not null), 0)
             - coalesce((select sum(p.amount_ghs) from public.supplier_payments p where p.supplier_id = s.id), 0),
           (select max(p.paid_on) from public.supplier_payments p where p.supplier_id = s.id)
    from public.suppliers s
    order by 6 desc, s.name;
end;
$$;

revoke all on function public.admin_supplier_balances() from public, anon;
grant execute on function public.admin_supplier_balances() to authenticated;

create function public.admin_supplier_payments(p_supplier_id uuid)
returns table (id uuid, amount_ghs numeric, paid_on date, method text, reference text, note text, recorded_by text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['finance']::public.staff_role[]);
  return query
    select p.id, p.amount_ghs, p.paid_on, p.method, p.reference, p.note, p.recorded_by
    from public.supplier_payments p where p.supplier_id = p_supplier_id order by p.paid_on desc, p.created_at desc limit 200;
end;
$$;

revoke all on function public.admin_supplier_payments(uuid) from public, anon;
grant execute on function public.admin_supplier_payments(uuid) to authenticated;
