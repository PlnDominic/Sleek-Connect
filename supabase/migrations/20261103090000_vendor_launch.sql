-- Launch pack for vendors: onboarding checks, seller terms record, product approval checks, disputes, support, analytics, tax.
-- ---------------------------------------------------------------------------
--  * Approving a store needs the onboarding checks ticked (ID matches the person, ID valid, phone confirmed, products allowed).
--    Every decision is kept in vendor_decisions, with the checks as they stood and a reason for any rejection or suspension.
--  * Approving a vendor product needs the product checks ticked (photos, description, claims, ingredients, expiry, authenticity,
--    regulatory registration, safety). They are kept on the product.
--  * The seller terms a vendor accepted are recorded by version (vendor_private.terms_version), and can be accepted again when
--    the terms change.
--  * Disputes: staff open one when a shopper reports a counterfeit, damaged or wrong vendor item. The vendor has 48 hours to
--    reply; staff then resolve it (upheld, partly upheld or dismissed), and any refund is charged to the vendor's balance.
--  * Payouts: earnings become payable only vendor_payout_hold_days after delivery (the return window), the amount is at least
--    vendor_min_payout_ghs (unless it clears the whole payable amount), and a payout needs the vendor's tax number on file.
--  * Product views are counted per day (no visitor data) so vendors can see views and conversion.

alter table public.store_settings
  add column vendor_payout_hold_days integer not null default 7 check (vendor_payout_hold_days between 0 and 60),
  add column vendor_min_payout_ghs numeric(10, 2) not null default 50 check (vendor_min_payout_ghs >= 0),
  add column vendor_tin_required boolean not null default true,
  add column vendor_support_reply_hours integer not null default 24 check (vendor_support_reply_hours between 1 and 168);

alter table public.vendor_private
  add column onboarding_checks jsonb not null default '{}'::jsonb,
  add column terms_version text check (terms_version is null or length(terms_version) <= 30),
  add column business_type text check (business_type is null or business_type in ('individual', 'company')),
  add column legal_name text check (legal_name is null or length(legal_name) <= 120),
  add column business_registration text check (business_registration is null or length(business_registration) <= 40),
  add column tin text check (tin is null or tin ~ '^[A-Za-z0-9-]{6,20}$'),
  add column tax_info_at timestamptz;

alter table public.products add column review_checks jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- Onboarding checks and the decision record
-- ---------------------------------------------------------------------------

create table public.vendor_decisions (
  id bigint generated always as identity primary key,
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  decision public.vendor_status not null,
  note text,
  checks jsonb,
  decided_by uuid,
  decided_by_email text,
  decided_at timestamptz not null default now()
);

create index vendor_decisions_vendor_idx on public.vendor_decisions (vendor_id, decided_at desc);

alter table public.vendor_decisions enable row level security;
create policy "Admins can read vendor decisions" on public.vendor_decisions
  for select to authenticated using ((select public.current_staff_role()) = 'admin');
grant select on public.vendor_decisions to authenticated;

-- Saves the ticks on a vendor's onboarding checklist: id_matches, id_valid, phone_confirmed, products_allowed (required to
-- approve), address_confirmed and business_documents (optional).
create or replace function public.admin_save_vendor_checks(p_vendor_id uuid, p_checks jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_checks jsonb := '{}'::jsonb;
begin
  perform public.require_staff(array['admin']::public.staff_role[]);
  if not exists (select 1 from public.vendors v where v.id = p_vendor_id and not v.is_house) then
    raise exception 'That vendor no longer exists.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_checks) is distinct from 'object' then
    raise exception 'Tick the checks that apply.' using errcode = '22023';
  end if;
  foreach v_key in array array['id_matches', 'id_valid', 'phone_confirmed', 'products_allowed', 'address_confirmed', 'business_documents'] loop
    v_checks := v_checks || jsonb_build_object(v_key, coalesce((p_checks ->> v_key)::boolean, false));
  end loop;
  v_checks := v_checks || jsonb_build_object('checked_by', auth.jwt() ->> 'email', 'checked_at', now());
  update public.vendor_private pr set onboarding_checks = v_checks where pr.vendor_id = p_vendor_id;
  perform public.audit('vendor.checks_saved', 'vendor', p_vendor_id::text, v_checks);
  return v_checks;
end;
$$;

revoke all on function public.admin_save_vendor_checks(uuid, jsonb) from public, anon;
grant execute on function public.admin_save_vendor_checks(uuid, jsonb) to authenticated;

-- Approve, reject or suspend a store. Approving a new application needs the required checks; rejecting or suspending needs a
-- reason; every decision is recorded.
create or replace function public.admin_review_vendor(p_vendor_id uuid, p_decision public.vendor_status, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.vendor_status;
  v_checks jsonb;
  v_missing text[];
begin
  perform public.require_staff(array['admin']::public.staff_role[]);
  if p_decision = 'pending' then
    raise exception 'Choose approve, reject or suspend.' using errcode = '22023';
  end if;
  select v.status into v_old from public.vendors v where v.id = p_vendor_id and not v.is_house for update;
  if not found then
    raise exception 'That vendor no longer exists.' using errcode = '22023';
  end if;
  select pr.onboarding_checks into v_checks from public.vendor_private pr where pr.vendor_id = p_vendor_id;
  v_checks := coalesce(v_checks, '{}'::jsonb);

  if p_decision in ('rejected', 'suspended') and coalesce(btrim(p_note), '') = '' then
    raise exception 'Give the reason. The vendor is told, and it is kept on record.' using errcode = '22023';
  end if;
  if p_decision = 'active' and v_old in ('pending', 'rejected') then
    v_missing := array(
      select c.label from (values
        ('id_matches', 'the ID matches the applicant'), ('id_valid', 'the ID is valid and not expired'),
        ('phone_confirmed', 'the phone number is confirmed'), ('products_allowed', 'the products are allowed')
      ) c(key, label) where coalesce((v_checks ->> c.key)::boolean, false) = false);
    if cardinality(v_missing) > 0 then
      raise exception 'Tick these checks before approving: %.', array_to_string(v_missing, '; ') using errcode = '22023';
    end if;
  end if;

  update public.vendors v set status = p_decision where v.id = p_vendor_id;
  update public.vendor_private pr set review_note = nullif(btrim(left(p_note, 1000)), '') where pr.vendor_id = p_vendor_id;
  insert into public.vendor_decisions (vendor_id, decision, note, checks, decided_by, decided_by_email)
  values (p_vendor_id, p_decision, nullif(btrim(left(p_note, 1000)), ''), v_checks, auth.uid(), auth.jwt() ->> 'email');
  perform public.queue_vendor_message(p_vendor_id,
    case p_decision when 'active' then 'vendor_approved' when 'rejected' then 'vendor_rejected' else 'vendor_suspended' end,
    jsonb_build_object('note', nullif(btrim(p_note), '')));
  perform public.audit('vendor.' || p_decision::text, 'vendor', p_vendor_id::text, jsonb_build_object('note', p_note));
end;
$$;

-- The onboarding picture for one vendor: checks, decision history, terms accepted and tax details.
create or replace function public.admin_vendor_onboarding(p_vendor_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['admin', 'finance']::public.staff_role[]);
  return (
    select jsonb_build_object(
      'checks', pr.onboarding_checks,
      'terms_version', pr.terms_version,
      'terms_accepted_at', pr.terms_accepted_at,
      'business_type', pr.business_type,
      'legal_name', pr.legal_name,
      'business_registration', pr.business_registration,
      'tin', pr.tin,
      'tax_info_at', pr.tax_info_at,
      'payout_account_set', pr.payout_wallet is not null,
      'decisions', coalesce((
        select jsonb_agg(jsonb_build_object('decision', d.decision, 'note', d.note, 'by', d.decided_by_email, 'at', d.decided_at)
                         order by d.decided_at desc)
        from public.vendor_decisions d where d.vendor_id = p_vendor_id), '[]'::jsonb))
    from public.vendor_private pr where pr.vendor_id = p_vendor_id);
end;
$$;

revoke all on function public.admin_vendor_onboarding(uuid) from public, anon;
grant execute on function public.admin_vendor_onboarding(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Seller terms: which version a vendor accepted
-- ---------------------------------------------------------------------------

create or replace function public.vendor_record_terms(p_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vendors := public.vendor_require_own();
begin
  if coalesce(btrim(p_version), '') = '' or length(p_version) > 30 then
    raise exception 'Accept the current vendor terms to continue.' using errcode = '22023';
  end if;
  update public.vendor_private pr set terms_version = btrim(p_version), terms_accepted_at = now() where pr.vendor_id = v.id;
  perform public.audit('vendor.terms_accepted', 'vendor', v.id::text, jsonb_build_object('version', btrim(p_version)));
end;
$$;

revoke all on function public.vendor_record_terms(text) from public, anon;
grant execute on function public.vendor_record_terms(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Tax details
-- ---------------------------------------------------------------------------

-- Shared by the vendor's own form and the owner's (who may enter what the vendor sent on paper).
create or replace function public.vendor_write_tax_info(p_vendor_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text := p ->> 'business_type';
  v_name text := btrim(coalesce(p ->> 'legal_name', ''));
  v_tin text := upper(regexp_replace(coalesce(p ->> 'tin', ''), '\s', '', 'g'));
begin
  if v_type is null or v_type not in ('individual', 'company') then
    raise exception 'Choose whether you sell as an individual or a registered business.' using errcode = '22023';
  end if;
  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'Enter the legal name: your name as on your ID, or the registered business name.' using errcode = '22023';
  end if;
  if v_tin !~ '^[A-Z0-9-]{6,20}$' then
    raise exception 'Enter your Tax Identification Number (TIN): 6 to 20 letters and numbers. For an individual it is the Ghana Card number.' using errcode = '22023';
  end if;
  update public.vendor_private pr
  set business_type = v_type, legal_name = v_name, tin = v_tin,
      business_registration = nullif(btrim(left(coalesce(p ->> 'business_registration', ''), 40)), ''),
      tax_info_at = now()
  where pr.vendor_id = p_vendor_id;
  -- The number itself is not written to the audit log.
  perform public.audit('vendor.tax_info_saved', 'vendor', p_vendor_id::text, jsonb_build_object('business_type', v_type));
end;
$$;

revoke all on function public.vendor_write_tax_info(uuid, jsonb) from public, anon, authenticated;

create or replace function public.vendor_save_tax_info(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vendors := public.vendor_require_own();
begin
  perform public.vendor_write_tax_info(v.id, p);
end;
$$;

revoke all on function public.vendor_save_tax_info(jsonb) from public, anon;
grant execute on function public.vendor_save_tax_info(jsonb) to authenticated;

create or replace function public.admin_set_vendor_tax_info(p_vendor_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['admin', 'finance']::public.staff_role[]);
  if not exists (select 1 from public.vendors v where v.id = p_vendor_id and not v.is_house) then
    raise exception 'That vendor no longer exists.' using errcode = '22023';
  end if;
  perform public.vendor_write_tax_info(p_vendor_id, p);
end;
$$;

revoke all on function public.admin_set_vendor_tax_info(uuid, jsonb) from public, anon;
grant execute on function public.admin_set_vendor_tax_info(uuid, jsonb) to authenticated;

-- What the vendor's dashboard needs about the launch rules: terms accepted, tax details, payout account and how to reach us.
create or replace function public.vendor_launch_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.vendors := public.vendor_require_own();
begin
  return (
    select jsonb_build_object(
      'terms_version', pr.terms_version,
      'terms_accepted_at', pr.terms_accepted_at,
      'business_type', pr.business_type,
      'legal_name', pr.legal_name,
      'business_registration', pr.business_registration,
      'tin', pr.tin,
      'payout_account_set', pr.payout_wallet is not null,
      'payout_hold_days', st.vendor_payout_hold_days,
      'min_payout_ghs', st.vendor_min_payout_ghs,
      'tin_required', st.vendor_tin_required,
      'support', jsonb_build_object('phone', st.support_phone, 'whatsapp', st.support_whatsapp, 'email', st.support_email,
                                    'hours', st.support_hours, 'reply_hours', st.vendor_support_reply_hours))
    from public.vendor_private pr cross join public.store_settings st where pr.vendor_id = v.id);
end;
$$;

revoke all on function public.vendor_launch_state() from public, anon;
grant execute on function public.vendor_launch_state() to authenticated;

-- ---------------------------------------------------------------------------
-- Product approval checks
-- ---------------------------------------------------------------------------

drop function public.admin_review_product(uuid, public.product_review_status, numeric, text);

-- p_checks: photos_ok, description_ok, claims_ok, ingredients_ok, expiry_ok, authentic_ok, regulatory_ok, safety_ok. Each
-- is true, or "na" when it doesn't apply to this product. Approving needs all eight.
create or replace function public.admin_review_product(
  p_product_id uuid, p_decision public.product_review_status, p_markup_percent numeric default null, p_note text default null,
  p_checks jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.products%rowtype;
  v_problems text[];
  v_checks jsonb := '{}'::jsonb;
  v_key text;
  v_missing text[];
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
  if p_decision in ('rejected', 'pending') and coalesce(btrim(p_note), '') = '' then
    raise exception 'Tell the vendor why, so they can fix it.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_checks) = 'object' then
    foreach v_key in array array['photos_ok', 'description_ok', 'claims_ok', 'ingredients_ok', 'expiry_ok', 'authentic_ok', 'regulatory_ok', 'safety_ok'] loop
      v_checks := v_checks || jsonb_build_object(v_key, case
        when p_checks ->> v_key = 'na' then to_jsonb('na'::text)
        else to_jsonb(coalesce((p_checks ->> v_key)::boolean, false)) end);
    end loop;
    v_checks := v_checks || jsonb_build_object('checked_by', auth.jwt() ->> 'email', 'checked_at', now());
  end if;

  v_problems := public.product_publish_problems(p_product_id);
  if p_decision = 'approved' then
    if cardinality(v_problems) > 0 then
      raise exception 'This product is missing: %.', array_to_string(v_problems, ', ') using errcode = '22023';
    end if;
    v_missing := array(
      select c.label from (values
        ('photos_ok', 'photos are clear and show the real product'), ('description_ok', 'the description is accurate'),
        ('claims_ok', 'no medical or "cure" claims'), ('ingredients_ok', 'ingredients or materials are listed'),
        ('expiry_ok', 'expiry or batch details are fine'), ('authentic_ok', 'it is genuine and from an authorised source'),
        ('regulatory_ok', 'registration numbers (for example FDA) are present'), ('safety_ok', 'safety warnings are present')
      ) c(key, label) where coalesce(v_checks ->> c.key, 'false') not in ('true', 'na'));
    if cardinality(v_missing) > 0 then
      raise exception 'Tick these checks before approving: %.', array_to_string(v_missing, '; ') using errcode = '22023';
    end if;
  end if;

  update public.products x set
    review_status = p_decision,
    markup_percent = coalesce(p_markup_percent, x.markup_percent),
    review_note = nullif(btrim(left(p_note, 500)), ''),
    review_checks = case when jsonb_typeof(p_checks) = 'object' then v_checks else x.review_checks end,
    review_previous = case when p_decision in ('approved', 'rejected') then null else x.review_previous end
  where x.id = p_product_id;
  perform public.audit('product.review_' || p_decision::text, 'product', p_product_id::text,
    jsonb_build_object('markup_percent', coalesce(p_markup_percent, p.markup_percent), 'note', p_note, 'checks', v_checks));
  if p_decision in ('approved', 'rejected') then
    perform public.queue_vendor_message(p.vendor_id, 'vendor_product_reviewed', jsonb_build_object(
      'product_name', p.name, 'decision', p_decision, 'note', nullif(btrim(p_note), ''),
      'price_ghs', (select x.price_ghs from public.products x where x.id = p_product_id)));
  end if;
  return (select jsonb_build_object('id', x.id, 'review_status', x.review_status, 'markup_percent', x.markup_percent,
            'price_ghs', x.price_ghs, 'is_published', x.is_published) from public.products x where x.id = p_product_id);
end;
$$;

revoke all on function public.admin_review_product(uuid, public.product_review_status, numeric, text, jsonb) from public, anon;
grant execute on function public.admin_review_product(uuid, public.product_review_status, numeric, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Disputes
-- ---------------------------------------------------------------------------

create type public.vendor_dispute_kind as enum ('counterfeit', 'damaged', 'not_as_described', 'wrong_item', 'other');
create type public.vendor_dispute_status as enum ('open', 'vendor_replied', 'resolved');
create type public.vendor_dispute_outcome as enum ('upheld', 'partly_upheld', 'dismissed');

create sequence public.vendor_dispute_seq start 1001;

create table public.vendor_disputes (
  id uuid primary key default gen_random_uuid(),
  case_number text not null unique default ('VD-' || nextval('public.vendor_dispute_seq')),
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  order_id uuid references public.orders (id) on delete set null,
  order_number text not null,
  kind public.vendor_dispute_kind not null,
  status public.vendor_dispute_status not null default 'open',
  -- What was reported, without the shopper's details.
  details text not null check (length(btrim(details)) between 5 and 1500),
  opened_by uuid,
  opened_at timestamptz not null default now(),
  vendor_due_at timestamptz not null default now() + interval '48 hours',
  vendor_response text check (vendor_response is null or length(btrim(vendor_response)) between 5 and 2000),
  vendor_responded_at timestamptz,
  outcome public.vendor_dispute_outcome,
  resolution_note text check (resolution_note is null or length(resolution_note) <= 1500),
  -- Charged to the vendor's balance when the dispute is upheld.
  charge_ghs numeric(10, 2) not null default 0 check (charge_ghs >= 0),
  resolved_by uuid,
  resolved_at timestamptz
);

create index vendor_disputes_vendor_idx on public.vendor_disputes (vendor_id, opened_at desc);
create index vendor_disputes_open_idx on public.vendor_disputes (status) where status <> 'resolved';

-- Reached only through the functions below.
alter table public.vendor_disputes enable row level security;
revoke all on public.vendor_disputes from anon, authenticated;

-- Staff open a dispute from a shopper's report. It must be about an item from that vendor in that order.
create or replace function public.admin_open_vendor_dispute(
  p_order_number text, p_product_id uuid, p_kind public.vendor_dispute_kind, p_details text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_item public.order_items%rowtype;
  v_case text;
begin
  perform public.require_staff(array['admin', 'support']::public.staff_role[]);
  select * into v_order from public.orders o where o.order_number = upper(btrim(coalesce(p_order_number, '')));
  if not found then
    raise exception 'We couldn''t find that order.' using errcode = '22023';
  end if;
  select oi.* into v_item from public.order_items oi
  join public.vendors v on v.id = oi.vendor_id and not v.is_house
  where oi.order_id = v_order.id and oi.product_id = p_product_id limit 1;
  if not found then
    raise exception 'That order has no item from an independent store with that product.' using errcode = '22023';
  end if;
  if coalesce(btrim(p_details), '') = '' or length(btrim(p_details)) < 5 then
    raise exception 'Describe what the shopper reported.' using errcode = '22023';
  end if;
  insert into public.vendor_disputes (vendor_id, product_id, product_name, order_id, order_number, kind, details, opened_by)
  values (v_item.vendor_id, v_item.product_id, v_item.product_name, v_order.id, v_order.order_number, p_kind, btrim(p_details), auth.uid())
  returning case_number into v_case;
  perform public.queue_vendor_message(v_item.vendor_id, 'vendor_dispute_opened', jsonb_build_object(
    'order_number', v_order.order_number, 'product_name', v_item.product_name, 'note', p_kind::text));
  perform public.audit('vendor.dispute_opened', 'vendor', v_item.vendor_id::text,
    jsonb_build_object('case', v_case, 'order', v_order.order_number, 'kind', p_kind));
  return v_case;
end;
$$;

revoke all on function public.admin_open_vendor_dispute(text, uuid, public.vendor_dispute_kind, text) from public, anon;
grant execute on function public.admin_open_vendor_dispute(text, uuid, public.vendor_dispute_kind, text) to authenticated;

-- The vendor's own disputes: nothing about the shopper.
create or replace function public.vendor_disputes_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.vendors := public.vendor_require_own();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', d.id, 'case_number', d.case_number, 'order_number', d.order_number, 'product_name', d.product_name, 'kind', d.kind,
      'status', d.status, 'details', d.details, 'opened_at', d.opened_at, 'due_at', d.vendor_due_at,
      'response', d.vendor_response, 'responded_at', d.vendor_responded_at, 'outcome', d.outcome,
      'resolution_note', d.resolution_note, 'charge_ghs', d.charge_ghs, 'resolved_at', d.resolved_at)
      order by d.opened_at desc)
    from public.vendor_disputes d where d.vendor_id = v.id), '[]'::jsonb);
end;
$$;

revoke all on function public.vendor_disputes_list() from public, anon;
grant execute on function public.vendor_disputes_list() to authenticated;

create or replace function public.vendor_respond_dispute(p_id uuid, p_response text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vendors := public.vendor_require_own();
  d public.vendor_disputes%rowtype;
begin
  select * into d from public.vendor_disputes x where x.id = p_id and x.vendor_id = v.id for update;
  if not found then
    raise exception 'We couldn''t find that case.' using errcode = '22023';
  end if;
  if d.status = 'resolved' then
    raise exception 'This case is already closed.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_response, ''))) < 5 or length(p_response) > 2000 then
    raise exception 'Write your reply (5 to 2000 characters).' using errcode = '22023';
  end if;
  update public.vendor_disputes x
  set vendor_response = btrim(p_response), vendor_responded_at = now(), status = 'vendor_replied'
  where x.id = p_id;
  perform public.audit('vendor.dispute_replied', 'vendor', v.id::text, jsonb_build_object('case', d.case_number));
end;
$$;

revoke all on function public.vendor_respond_dispute(uuid, text) from public, anon;
grant execute on function public.vendor_respond_dispute(uuid, text) to authenticated;

-- All disputes, newest first, with overdue replies flagged and each vendor's upheld counterfeit count.
create or replace function public.admin_vendor_disputes(p_status text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['admin', 'support']::public.staff_role[]);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', d.id, 'case_number', d.case_number, 'vendor_id', d.vendor_id, 'vendor_name', v.name, 'order_number', d.order_number,
      'product_name', d.product_name, 'kind', d.kind, 'status', d.status, 'details', d.details, 'opened_at', d.opened_at,
      'due_at', d.vendor_due_at, 'overdue', d.status = 'open' and d.vendor_due_at < now(),
      'response', d.vendor_response, 'responded_at', d.vendor_responded_at, 'outcome', d.outcome,
      'resolution_note', d.resolution_note, 'charge_ghs', d.charge_ghs, 'resolved_at', d.resolved_at,
      'counterfeit_strikes', (select count(*) from public.vendor_disputes s
                              where s.vendor_id = d.vendor_id and s.kind = 'counterfeit' and s.outcome in ('upheld', 'partly_upheld')))
      order by (d.status = 'resolved'), d.opened_at desc)
    from public.vendor_disputes d join public.vendors v on v.id = d.vendor_id
    where p_status is null or d.status::text = p_status), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_vendor_disputes(text) from public, anon;
grant execute on function public.admin_vendor_disputes(text) to authenticated;

-- Decides a dispute. A charge (at most what the vendor was to earn on that item in that order) comes off the vendor's balance.
-- Returns how many counterfeit disputes have now been upheld against the vendor: the policy is suspension at the second.
create or replace function public.admin_resolve_vendor_dispute(
  p_id uuid, p_outcome public.vendor_dispute_outcome, p_charge_ghs numeric, p_note text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.vendor_disputes%rowtype;
  v_max numeric;
  v_charge numeric := coalesce(p_charge_ghs, 0);
  v_strikes integer;
begin
  perform public.require_staff(array['admin']::public.staff_role[]);
  select * into d from public.vendor_disputes x where x.id = p_id for update;
  if not found then
    raise exception 'We couldn''t find that case.' using errcode = '22023';
  end if;
  if d.status = 'resolved' then
    raise exception 'This case is already closed.' using errcode = '22023';
  end if;
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'Write the decision and why. The vendor is told.' using errcode = '22023';
  end if;
  if p_outcome = 'dismissed' then
    v_charge := 0;
  elsif v_charge < 0 then
    raise exception 'The charge can''t be negative.' using errcode = '22023';
  end if;
  select coalesce(sum(oi.vendor_unit_price_ghs * oi.quantity), 0) into v_max
  from public.order_items oi where oi.order_id = d.order_id and oi.product_id = d.product_id and oi.vendor_id = d.vendor_id;
  if v_charge > v_max then
    raise exception 'The charge can''t be more than the vendor''s share of that item (GH₵%).', to_char(v_max, 'FM999999990.00') using errcode = '22023';
  end if;
  update public.vendor_disputes x
  set status = 'resolved', outcome = p_outcome, resolution_note = btrim(left(p_note, 1500)), charge_ghs = v_charge,
      resolved_by = auth.uid(), resolved_at = now()
  where x.id = p_id;
  select count(*)::integer into v_strikes from public.vendor_disputes s
  where s.vendor_id = d.vendor_id and s.kind = 'counterfeit' and s.outcome in ('upheld', 'partly_upheld');
  perform public.queue_vendor_message(d.vendor_id, 'vendor_dispute_resolved', jsonb_build_object(
    'order_number', d.order_number, 'product_name', d.product_name, 'note', btrim(p_note), 'decision', p_outcome::text,
    'amount_ghs', v_charge));
  perform public.audit('vendor.dispute_resolved', 'vendor', d.vendor_id::text,
    jsonb_build_object('case', d.case_number, 'outcome', p_outcome, 'charge_ghs', v_charge, 'counterfeit_strikes', v_strikes));
  return v_strikes;
end;
$$;

revoke all on function public.admin_resolve_vendor_dispute(uuid, public.vendor_dispute_outcome, numeric, text) from public, anon;
grant execute on function public.admin_resolve_vendor_dispute(uuid, public.vendor_dispute_outcome, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Money: what is payable now, and the payout rules
-- ---------------------------------------------------------------------------

--   earned   = their price x quantity on delivered orders
--   returned = their price x quantity on returns we have received
--   charged  = what upheld disputes took off
--   pending  = paid orders not delivered yet
--   balance  = earned - returned - charged - paid
--   payable  = what can be paid now: only earnings delivered at least vendor_payout_hold_days ago count (so a return can still
--              be asked for first), less returns, charges and payouts already made
create or replace function public.vendor_balance(p_vendor_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'earned', e.earned, 'returned', e.returned, 'charged', e.charged, 'paid', e.paid, 'pending', e.pending,
    'balance', e.earned - e.returned - e.charged - e.paid,
    'payable', greatest(0, e.matured - e.returned - e.charged - e.paid))
  from (
    select
      coalesce((select sum(oi.vendor_unit_price_ghs * oi.quantity) from public.order_items oi
                join public.orders o on o.id = oi.order_id
                where oi.vendor_id = p_vendor_id and o.status = 'delivered'), 0) as earned,
      coalesce((select sum(oi.vendor_unit_price_ghs * oi.quantity) from public.order_items oi
                join public.orders o on o.id = oi.order_id
                where oi.vendor_id = p_vendor_id and o.status = 'delivered'
                  and o.delivered_at <= now() - make_interval(days => (select s.vendor_payout_hold_days from public.store_settings s))), 0) as matured,
      coalesce((select sum(oi.vendor_unit_price_ghs * ri.quantity) from public.return_items ri
                join public.return_requests rr on rr.id = ri.return_id
                join public.order_items oi on oi.id = ri.order_item_id
                where oi.vendor_id = p_vendor_id and rr.status in ('received', 'refunded')), 0) as returned,
      coalesce((select sum(d.charge_ghs) from public.vendor_disputes d where d.vendor_id = p_vendor_id and d.status = 'resolved'), 0) as charged,
      coalesce((select sum(p.amount_ghs) from public.vendor_payouts p where p.vendor_id = p_vendor_id), 0) as paid,
      coalesce((select sum(oi.vendor_unit_price_ghs * oi.quantity) from public.order_items oi
                join public.orders o on o.id = oi.order_id
                where oi.vendor_id = p_vendor_id
                  and o.status in ('paid', 'packing', 'packed', 'out_for_delivery', 'delivery_failed')), 0) as pending
  ) e;
$$;

create or replace function public.admin_record_payout(
  p_vendor_id uuid, p_amount_ghs numeric, p_method text default 'momo', p_reference text default null, p_note text default null
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance jsonb;
  v_payable numeric;
  v_min numeric;
  v_hold integer;
  v_tin_required boolean;
begin
  perform public.require_staff(array['finance']::public.staff_role[]);
  if not exists (select 1 from public.vendors v where v.id = p_vendor_id and not v.is_house) then
    raise exception 'That vendor no longer exists.' using errcode = '22023';
  end if;
  if p_amount_ghs is null or p_amount_ghs <= 0 then
    raise exception 'Enter the amount you paid.' using errcode = '22023';
  end if;
  if coalesce(btrim(p_reference), '') = '' then
    raise exception 'Enter the payment reference (for example the Mobile Money transaction ID).' using errcode = '22023';
  end if;
  select s.vendor_min_payout_ghs, s.vendor_payout_hold_days, s.vendor_tin_required into v_min, v_hold, v_tin_required from public.store_settings s;
  if v_tin_required and not exists (select 1 from public.vendor_private pr where pr.vendor_id = p_vendor_id and pr.tin is not null) then
    raise exception 'This vendor has no tax identification number on file. Ask them to add it (Store → Tax details), or enter it from their paperwork.' using errcode = '22023';
  end if;
  v_balance := public.vendor_balance(p_vendor_id);
  v_payable := (v_balance ->> 'payable')::numeric;
  if p_amount_ghs > v_payable then
    raise exception 'That is more than the GH₵% that can be paid now. Earnings are paid % days after delivery, so a return can still be asked for first.',
      to_char(v_payable, 'FM999999990.00'), v_hold using errcode = '22023';
  end if;
  if p_amount_ghs < v_min and p_amount_ghs < v_payable then
    raise exception 'The smallest payout is GH₵% (unless you are paying everything that is payable).', to_char(v_min, 'FM999999990.00') using errcode = '22023';
  end if;
  insert into public.vendor_payouts (vendor_id, amount_ghs, method, reference, note, paid_by)
  values (p_vendor_id, p_amount_ghs, coalesce(nullif(p_method, ''), 'momo'), btrim(p_reference), nullif(btrim(p_note), ''), auth.uid());
  perform public.queue_vendor_message(p_vendor_id, 'vendor_payout_sent',
    jsonb_build_object('amount_ghs', p_amount_ghs, 'reference', btrim(p_reference)));
  perform public.audit('vendor.payout_recorded', 'vendor', p_vendor_id::text,
    jsonb_build_object('amount_ghs', p_amount_ghs, 'reference', btrim(p_reference)));
  return (v_balance ->> 'balance')::numeric - p_amount_ghs;
end;
$$;

-- The year's payouts per vendor, with their tax details: for the tax return and for what vendors need to file.
create or replace function public.admin_vendor_tax_summary(p_year integer)
returns table (
  vendor_id uuid, vendor_name text, business_type text, legal_name text, business_registration text, tin text,
  payouts integer, total_paid_ghs numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['admin', 'finance']::public.staff_role[]);
  return query
  select v.id, v.name, pr.business_type, pr.legal_name, pr.business_registration, pr.tin,
         count(p.id)::integer, coalesce(sum(p.amount_ghs), 0)
  from public.vendors v
  join public.vendor_private pr on pr.vendor_id = v.id
  left join public.vendor_payouts p on p.vendor_id = v.id and extract(year from p.created_at) = p_year
  where not v.is_house
  group by v.id, v.name, pr.business_type, pr.legal_name, pr.business_registration, pr.tin
  having count(p.id) > 0
  order by v.name;
end;
$$;

revoke all on function public.admin_vendor_tax_summary(integer) from public, anon;
grant execute on function public.admin_vendor_tax_summary(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Product views and vendor analytics
-- ---------------------------------------------------------------------------

-- A count per product per day. No visitor, address or device is kept.
create table public.product_views (
  product_id uuid not null references public.products (id) on delete cascade,
  day date not null default current_date,
  views integer not null default 0,
  primary key (product_id, day)
);

alter table public.product_views enable row level security;
revoke all on public.product_views from anon, authenticated;

create or replace function public.record_product_view(p_slug text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.product_views (product_id, day, views)
  select p.id, current_date, 1 from public.products p where p.slug = p_slug and p.is_published
  on conflict (product_id, day) do update set views = public.product_views.views + 1;
$$;

revoke all on function public.record_product_view(text) from public;
grant execute on function public.record_product_view(text) to anon, authenticated;

-- The vendor's report, now with views and conversion (orders per view) for each product.
create or replace function public.vendor_report(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.vendors := public.vendor_require_own();
  v_from date := current_date - (greatest(7, least(coalesce(p_days, 30), 365)) - 1);
begin
  return (
    with lines as (
      select (o.paid_at at time zone 'UTC')::date as d, o.id as order_id, oi.product_id, oi.product_name, oi.quantity,
             oi.vendor_unit_price_ghs * oi.quantity as amount
      from public.order_items oi join public.orders o on o.id = oi.order_id
      where oi.vendor_id = v.id and o.paid_at is not null
        and (o.paid_at at time zone 'UTC')::date >= v_from
        and o.status not in ('cancelled', 'returned', 'pending_payment')
    ),
    per_day as (
      select d, sum(quantity)::integer as units, sum(amount) as revenue, count(distinct order_id)::integer as orders
      from lines group by d
    ),
    seen as (
      select pv.product_id, sum(pv.views)::integer as views
      from public.product_views pv join public.products p on p.id = pv.product_id
      where p.vendor_id = v.id and pv.day >= v_from group by pv.product_id
    ),
    stats as (
      select p.id, p.name, coalesce(s.views, 0) as views, coalesce(sum(l.quantity), 0)::integer as units,
             coalesce(sum(l.amount), 0) as revenue, count(distinct l.order_id)::integer as orders
      from public.products p
      left join seen s on s.product_id = p.id
      left join lines l on l.product_id = p.id
      where p.vendor_id = v.id and (s.views is not null or l.product_id is not null)
      group by p.id, p.name, s.views
    )
    select jsonb_build_object(
      'days', (select jsonb_agg(jsonb_build_object('date', g.d::date, 'units', coalesce(p.units, 0),
                 'revenue', coalesce(p.revenue, 0), 'orders', coalesce(p.orders, 0)) order by g.d)
               from generate_series(v_from, current_date, interval '1 day') g(d)
               left join per_day p on p.d = g.d::date),
      'totals', jsonb_build_object('units', coalesce((select sum(quantity) from lines), 0),
                'revenue', coalesce((select sum(amount) from lines), 0),
                'orders', (select count(distinct order_id) from lines),
                'views', coalesce((select sum(views) from seen), 0)),
      'top_products', coalesce((
        select jsonb_agg(jsonb_build_object('name', t.product_name, 'units', t.units, 'revenue', t.revenue) order by t.revenue desc)
        from (select product_name, sum(quantity)::integer as units, sum(amount) as revenue
              from lines group by product_name order by sum(amount) desc limit 8) t), '[]'::jsonb),
      'product_stats', coalesce((
        select jsonb_agg(jsonb_build_object('name', t.name, 'views', t.views, 'orders', t.orders, 'units', t.units,
                 'revenue', t.revenue, 'conversion', case when t.views > 0 then round(t.orders::numeric * 100 / t.views, 1) end)
               order by t.views desc, t.revenue desc)
        from (select * from stats order by views desc, revenue desc limit 20) t), '[]'::jsonb)
    )
  );
end;
$$;

-- Marketplace settings: now with the payout rules and the reply time.
create or replace function public.admin_set_marketplace_settings(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['admin']::public.staff_role[]);
  begin
    update public.store_settings s set
      vendor_annual_fee_ghs = coalesce((p ->> 'vendor_annual_fee_ghs')::numeric, s.vendor_annual_fee_ghs),
      vendor_grace_days = coalesce((p ->> 'vendor_grace_days')::integer, s.vendor_grace_days),
      default_markup_percent = coalesce((p ->> 'default_markup_percent')::numeric, s.default_markup_percent),
      vendor_payment_instructions = case when p ? 'vendor_payment_instructions'
        then nullif(btrim(p ->> 'vendor_payment_instructions'), '') else s.vendor_payment_instructions end,
      marketplace_orders_open = coalesce((p ->> 'marketplace_orders_open')::boolean, s.marketplace_orders_open),
      vendor_payout_hold_days = coalesce((p ->> 'vendor_payout_hold_days')::integer, s.vendor_payout_hold_days),
      vendor_min_payout_ghs = coalesce((p ->> 'vendor_min_payout_ghs')::numeric, s.vendor_min_payout_ghs),
      vendor_tin_required = coalesce((p ->> 'vendor_tin_required')::boolean, s.vendor_tin_required),
      vendor_support_reply_hours = coalesce((p ->> 'vendor_support_reply_hours')::integer, s.vendor_support_reply_hours);
  exception
    when invalid_text_representation or check_violation then
      raise exception 'Check the marketplace settings: fee and markup are numbers, grace days up to 60, markup up to 200%%, payout hold up to 60 days, reply time 1 to 168 hours.'
        using errcode = '22023';
  end;
  perform public.refresh_vendor_products(null);
  perform public.audit('marketplace.settings_changed', 'store_settings', 'marketplace', p);
end;
$$;
