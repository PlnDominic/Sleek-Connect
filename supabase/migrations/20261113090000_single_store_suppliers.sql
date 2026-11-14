-- Sleek Connect is one store that buys its stock from suppliers: sellers, seller stores, yearly fees and seller payouts are gone.
-- ---------------------------------------------------------------------------
--  * A plain supplier register (who we buy from: contact, tax and payment details) and a record of every delivery received from them,
--    tied to the stock batches the inventory already tracks.
--  * The old vendor/marketplace features are switched off by taking away their permissions. Nothing is deleted here: the vendor tables stay
--    (empty or dormant) until a later, separate clean-up that you run after taking a backup.

-- ---------------------------------------------------------------------------
-- The supplier register
-- ---------------------------------------------------------------------------

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 80),
  contact_name text check (contact_name is null or length(contact_name) between 2 and 80),
  phone text check (phone is null or length(phone) <= 30),
  email text check (email is null or length(email) <= 200),
  address text check (address is null or length(address) <= 300),
  business_type text check (business_type is null or business_type in ('individual', 'company')),
  legal_name text check (legal_name is null or length(legal_name) <= 120),
  tin text check (tin is null or length(tin) <= 20),
  business_registration text check (business_registration is null or length(business_registration) <= 40),
  payout_network text check (payout_network is null or payout_network in ('mtn', 'telecel', 'at')),
  payout_wallet text check (payout_wallet is null or length(payout_wallet) between 9 and 20),
  payout_name text check (payout_name is null or length(payout_name) between 2 and 80),
  payment_terms text check (payment_terms is null or length(payment_terms) <= 300),
  notes text check (notes is null or length(notes) <= 1000),
  is_active boolean not null default true,
  -- Where a supplier came from, when it was copied over from the short-lived "supplier" vendors. Removed in the clean-up.
  legacy_vendor_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index suppliers_name_idx on public.suppliers (lower(name));

create trigger suppliers_set_updated_at before update on public.suppliers for each row execute function public.set_updated_at();

-- Reached only through the admin_* functions below.
alter table public.suppliers enable row level security;
revoke all on public.suppliers from anon, authenticated;

-- Every delivery received from a supplier: what, how many, what each unit cost, and the invoice or delivery note.
create table public.stock_receipts (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id),
  product_id uuid not null references public.products (id),
  size_code text not null default '',
  batch_id uuid references public.stock_batches (id) on delete set null,
  quantity integer not null check (quantity > 0),
  unit_cost_ghs numeric(10, 2) check (unit_cost_ghs is null or unit_cost_ghs >= 0),
  reference text check (reference is null or length(reference) <= 200),
  received_at timestamptz not null default now(),
  actor_email text
);

create index stock_receipts_supplier_idx on public.stock_receipts (supplier_id, received_at desc);
create index stock_receipts_product_idx on public.stock_receipts (product_id);

alter table public.stock_receipts enable row level security;
revoke all on public.stock_receipts from anon, authenticated;

-- A product's usual supplier (set from the first delivery; staff can change it).
alter table public.products add column supplier_id uuid references public.suppliers (id) on delete set null;
create index products_supplier_idx on public.products (supplier_id) where supplier_id is not null;

-- Suppliers that were added as "supplier" vendors in the short-lived supplier flow are copied into the register.
insert into public.suppliers (name, contact_name, phone, email, business_type, legal_name, tin, business_registration,
                              payout_network, payout_wallet, payout_name, legacy_vendor_id)
select v.name, pr.owner_name, pr.phone, pr.email, pr.business_type, pr.legal_name, pr.tin, pr.business_registration,
       pr.payout_network, pr.payout_wallet, pr.payout_name, v.id
from public.vendors v left join public.vendor_private pr on pr.vendor_id = v.id
where v.is_supplier
on conflict do nothing;

update public.products p set supplier_id = s.id from public.suppliers s where s.legacy_vendor_id is not null and s.legacy_vendor_id = p.vendor_id;

-- The old vendor-based supplier functions are replaced by the register's.
drop function if exists public.admin_create_supplier(jsonb);
drop function if exists public.admin_update_supplier(uuid, jsonb);
drop function if exists public.admin_list_suppliers();
drop function if exists public.admin_supplier_products(uuid);
drop function if exists public.admin_save_supplier_product(uuid, jsonb);
drop function if exists public.admin_set_supplier_stock(uuid, uuid, text, integer);
drop function if exists public.admin_delete_supplier_product(uuid, uuid);
drop function if exists public.admin_set_vendor_accounts_open(boolean);
drop function if exists public.write_supplier_details(uuid, jsonb);
drop function if exists public.supplier_require(uuid);

-- ---------------------------------------------------------------------------
-- Staff functions
-- ---------------------------------------------------------------------------

-- Names only, for the "received from" menu when stock arrives (operations staff need it; the tax and payment details stay with finance and admins).
create function public.admin_supplier_options()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['operations']::public.staff_role[]);
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name) from public.suppliers s where s.is_active), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_supplier_options() from public, anon;
grant execute on function public.admin_supplier_options() to authenticated;

-- The register, with what each supplier has delivered. Tax and payment details are shown to admins and finance only.
create function public.admin_list_suppliers()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.staff_role := public.require_staff(array['finance', 'operations']::public.staff_role[]);
  v_money boolean := v_role in ('admin', 'finance');
begin
  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', s.id, 'name', s.name, 'contact_name', s.contact_name, 'phone', s.phone, 'email', s.email, 'address', s.address,
        'payment_terms', s.payment_terms, 'notes', s.notes, 'is_active', s.is_active, 'created_at', s.created_at,
        'products', (select count(*) from public.products p where p.supplier_id = s.id),
        'deliveries', (select count(*) from public.stock_receipts r where r.supplier_id = s.id),
        'units_received', (select coalesce(sum(r.quantity), 0) from public.stock_receipts r where r.supplier_id = s.id),
        'total_cost_ghs', (select coalesce(sum(r.quantity * r.unit_cost_ghs), 0) from public.stock_receipts r where r.supplier_id = s.id),
        'last_delivery', (select max(r.received_at) from public.stock_receipts r where r.supplier_id = s.id))
      || case when v_money then jsonb_build_object(
        'business_type', s.business_type, 'legal_name', s.legal_name, 'tin', s.tin, 'business_registration', s.business_registration,
        'payout_network', s.payout_network, 'payout_wallet', s.payout_wallet, 'payout_name', s.payout_name) else '{}'::jsonb end
      order by s.is_active desc, s.name)
    from public.suppliers s), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_list_suppliers() from public, anon;
grant execute on function public.admin_list_suppliers() to authenticated;

-- Adds a supplier (no id) or changes one (id). p: {id?, name, contact_name, phone, email, address, payment_terms, notes,
-- business_type, legal_name, tin, business_registration, payout_network, payout_wallet, payout_name}. Operations staff can change the
-- contact details; the tax and payment details are only written by admins and finance.
create function public.admin_save_supplier(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.staff_role := public.require_staff(array['finance', 'operations']::public.staff_role[]);
  v_money boolean := v_role in ('admin', 'finance');
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_name text := btrim(coalesce(p ->> 'name', ''));
  v_contact text := nullif(btrim(coalesce(p ->> 'contact_name', '')), '');
  v_phone text := nullif(btrim(coalesce(p ->> 'phone', '')), '');
  v_email text := nullif(btrim(coalesce(p ->> 'email', '')), '');
  v_address text := nullif(btrim(coalesce(p ->> 'address', '')), '');
  v_terms text := nullif(btrim(coalesce(p ->> 'payment_terms', '')), '');
  v_notes text := nullif(btrim(coalesce(p ->> 'notes', '')), '');
  v_type text := nullif(btrim(coalesce(p ->> 'business_type', '')), '');
  v_legal text := nullif(btrim(coalesce(p ->> 'legal_name', '')), '');
  v_tin text := upper(nullif(regexp_replace(coalesce(p ->> 'tin', ''), '\s', '', 'g'), ''));
  v_reg text := nullif(btrim(coalesce(p ->> 'business_registration', '')), '');
  v_network text := nullif(btrim(coalesce(p ->> 'payout_network', '')), '');
  v_wallet text := nullif(regexp_replace(coalesce(p ->> 'payout_wallet', ''), '[^0-9+]', '', 'g'), '');
  v_pname text := nullif(btrim(coalesce(p ->> 'payout_name', '')), '');
begin
  if length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'Enter the supplier''s name (2 to 80 characters).' using errcode = '22023';
  end if;
  if v_contact is not null and length(v_contact) not between 2 and 80 then
    raise exception 'The contact person''s name is 2 to 80 characters.' using errcode = '22023';
  end if;
  if v_email is not null and v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;
  if v_phone is not null and regexp_replace(v_phone, '\D', '', 'g') !~ '^\d{9,15}$' then
    raise exception 'Enter a valid phone number.' using errcode = '22023';
  end if;
  if length(coalesce(v_address, '')) > 300 or length(coalesce(v_terms, '')) > 300 or length(coalesce(v_notes, '')) > 1000 then
    raise exception 'The address and payment terms are up to 300 characters, the notes up to 1000.' using errcode = '22023';
  end if;
  if v_money then
    if v_type is not null and v_type not in ('individual', 'company') then
      raise exception 'Choose an individual or a registered business.' using errcode = '22023';
    end if;
    if v_tin is not null and v_tin !~ '^[A-Z0-9-]{6,20}$' then
      raise exception 'The TIN is 6 to 20 letters and numbers.' using errcode = '22023';
    end if;
    if v_wallet is not null then
      if v_network is null or v_network not in ('mtn', 'telecel', 'at') then
        raise exception 'Choose the Mobile Money network for the payment number.' using errcode = '22023';
      end if;
      if length(v_wallet) < 9 or length(v_wallet) > 14 then
        raise exception 'Enter a valid Mobile Money number.' using errcode = '22023';
      end if;
      if v_pname is null or length(v_pname) < 2 then
        raise exception 'Enter the name registered on that wallet.' using errcode = '22023';
      end if;
    end if;
  end if;
  if exists (select 1 from public.suppliers s where lower(s.name) = lower(v_name) and s.id is distinct from v_id) then
    raise exception 'There is already a supplier called %.', v_name using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.suppliers (name, contact_name, phone, email, address, payment_terms, notes)
    values (v_name, v_contact, v_phone, v_email, v_address, v_terms, v_notes)
    returning id into v_id;
    if v_money then
      update public.suppliers s
      set business_type = v_type, legal_name = v_legal, tin = v_tin, business_registration = v_reg,
          payout_network = case when v_wallet is not null then v_network end, payout_wallet = v_wallet, payout_name = case when v_wallet is not null then v_pname end
      where s.id = v_id;
    end if;
    perform public.audit('supplier.created', 'supplier', v_id::text, jsonb_build_object('name', v_name));
  else
    update public.suppliers s
    set name = v_name, contact_name = v_contact, phone = v_phone, email = v_email, address = v_address, payment_terms = v_terms, notes = v_notes
    where s.id = v_id;
    if not found then
      raise exception 'That supplier no longer exists.' using errcode = '22023';
    end if;
    if v_money then
      update public.suppliers s
      set business_type = v_type, legal_name = v_legal, tin = v_tin, business_registration = v_reg,
          payout_network = case when v_wallet is not null then v_network end, payout_wallet = v_wallet, payout_name = case when v_wallet is not null then v_pname end
      where s.id = v_id;
    end if;
    perform public.audit('supplier.updated', 'supplier', v_id::text, jsonb_build_object('name', v_name));
  end if;
  return v_id;
end;
$$;

revoke all on function public.admin_save_supplier(jsonb) from public, anon;
grant execute on function public.admin_save_supplier(jsonb) to authenticated;

-- Stops a supplier appearing in the "received from" menu without losing their history.
create function public.admin_set_supplier_active(p_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['finance', 'operations']::public.staff_role[]);
  update public.suppliers s set is_active = coalesce(p_active, false) where s.id = p_id;
  if not found then
    raise exception 'That supplier no longer exists.' using errcode = '22023';
  end if;
  perform public.audit(case when p_active then 'supplier.switched_on' else 'supplier.switched_off' end, 'supplier', p_id::text, null);
end;
$$;

revoke all on function public.admin_set_supplier_active(uuid, boolean) from public, anon;
grant execute on function public.admin_set_supplier_active(uuid, boolean) to authenticated;

-- Deletes a supplier we have never received anything from. Otherwise they are switched off, and the history stays.
create function public.admin_delete_supplier(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['finance']::public.staff_role[]);
  if exists (select 1 from public.stock_receipts r where r.supplier_id = p_id) then
    raise exception 'We have received stock from this supplier, so it can''t be deleted. Switch it off instead.' using errcode = '22023';
  end if;
  delete from public.suppliers s where s.id = p_id;
  if not found then
    raise exception 'That supplier no longer exists.' using errcode = '22023';
  end if;
  perform public.audit('supplier.deleted', 'supplier', p_id::text, null);
end;
$$;

revoke all on function public.admin_delete_supplier(uuid) from public, anon;
grant execute on function public.admin_delete_supplier(uuid) to authenticated;

-- A supplier's deliveries, newest first.
create function public.admin_supplier_history(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['finance', 'operations']::public.staff_role[]);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'at', r.received_at, 'product', pr.name, 'slug', pr.slug, 'size', nullif(r.size_code, ''), 'quantity', r.quantity,
      'unit_cost_ghs', r.unit_cost_ghs, 'reference', r.reference, 'batch', b.batch_code, 'received_by', r.actor_email) order by r.received_at desc)
    from (select * from public.stock_receipts x where x.supplier_id = p_id order by x.received_at desc limit 200) r
    join public.products pr on pr.id = r.product_id
    left join public.stock_batches b on b.id = r.batch_id), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_supplier_history(uuid) from public, anon;
grant execute on function public.admin_supplier_history(uuid) to authenticated;

-- Receives stock into a batch (as admin_receive_stock does: expiry rules, batch ledger, audit) and records who it came from and what it cost.
alter table public.stock_batches add column supplier_id uuid references public.suppliers (id) on delete set null;
alter table public.stock_batches add column unit_cost_ghs numeric(10, 2) check (unit_cost_ghs is null or unit_cost_ghs >= 0);

create function public.admin_receive_stock_from(
  p_product_id uuid,
  p_size_code text,
  p_batch_code text,
  p_expires_on date,
  p_quantity integer,
  p_supplier_id uuid default null,
  p_unit_cost numeric default null,
  p_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch uuid;
  v_email text;
begin
  perform public.require_staff(array['operations']::public.staff_role[]);
  if p_supplier_id is not null and not exists (select 1 from public.suppliers s where s.id = p_supplier_id and s.is_active) then
    raise exception 'Choose a supplier from the list.' using errcode = '22023';
  end if;
  if p_unit_cost is not null and (p_unit_cost < 0 or p_unit_cost > 1000000) then
    raise exception 'The cost of one unit can''t be negative.' using errcode = '22023';
  end if;
  v_batch := public.admin_receive_stock(p_product_id, p_size_code, p_batch_code, p_expires_on, p_quantity, nullif(btrim(coalesce(p_reference, '')), ''));
  if p_supplier_id is not null then
    select u.email into v_email from auth.users u where u.id = auth.uid();
    insert into public.stock_receipts (supplier_id, product_id, size_code, batch_id, quantity, unit_cost_ghs, reference, actor_email)
    values (p_supplier_id, p_product_id, coalesce(p_size_code, ''), v_batch, p_quantity, p_unit_cost, nullif(btrim(coalesce(p_reference, '')), ''), v_email);
    update public.stock_batches b set supplier_id = p_supplier_id, unit_cost_ghs = coalesce(p_unit_cost, b.unit_cost_ghs) where b.id = v_batch;
    update public.products p set supplier_id = p_supplier_id where p.id = p_product_id and p.supplier_id is null;
  end if;
  return v_batch;
end;
$$;

revoke all on function public.admin_receive_stock_from(uuid, text, text, date, integer, uuid, numeric, text) from public, anon;
grant execute on function public.admin_receive_stock_from(uuid, text, text, date, integer, uuid, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The marketplace is switched off: its functions are no longer callable. (Nothing is deleted; to bring a feature back, grant execute on its
-- function again.) The public brand and store pages are gone from the site, so nothing needs these.
-- ---------------------------------------------------------------------------

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'vendor\_%' or p.proname like 'admin\_%vendor%' or p.proname like 'admin\_%dispute%'
           or p.proname in ('follow_store', 'unfollow_store', 'is_following_store', 'my_followed_stores', 'store_directory', 'store_rating', 'store_reviews',
                            'store_facts', 'record_product_view', 'my_live_vendor_id', 'vendor_is_live'))
  loop
    execute format('revoke execute on function %s from anon, authenticated', f.sig);
  end loop;
end;
$$;
