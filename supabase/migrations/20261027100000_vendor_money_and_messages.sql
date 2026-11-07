-- Vendor money, messages and notifications:
--  * a payout ledger: what each vendor has earned from delivered orders, minus returns, minus what we've paid them
--  * vendors keep a Mobile Money account for payouts
--  * returns on vendor products come off the vendor's earnings, and the goods go back into the vendor's own stock
--  * texts and emails to vendors (application, approval, payment, new orders, payouts, renewals), queued like customer ones
--  * a message thread between each vendor and the owner

-- ---------------------------------------------------------------------------
-- Notifications to vendors
-- ---------------------------------------------------------------------------

alter table public.notifications
  add column vendor_id uuid references public.vendors (id) on delete cascade;

create index notifications_vendor_idx on public.notifications (vendor_id) where vendor_id is not null;

-- Queues a text and an email to the vendor's saved contact details.
create function public.queue_vendor_message(p_vendor_id uuid, p_template text, p_payload jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vendors%rowtype;
  pr public.vendor_private%rowtype;
  v_payload jsonb;
begin
  select * into v from public.vendors x where x.id = p_vendor_id;
  select * into pr from public.vendor_private x where x.vendor_id = p_vendor_id;
  if v.id is null or pr.vendor_id is null then
    return;
  end if;
  v_payload := coalesce(p_payload, '{}'::jsonb)
    || jsonb_build_object('vendor_name', v.name, 'owner_name', coalesce(pr.owner_name, v.name), 'vendor_slug', v.slug);
  if coalesce(pr.phone, '') <> '' then
    insert into public.notifications (vendor_id, template, channel, recipient, payload)
    values (p_vendor_id, p_template, 'sms', pr.phone, v_payload);
  end if;
  if coalesce(pr.email, '') <> '' then
    insert into public.notifications (vendor_id, template, channel, recipient, payload)
    values (p_vendor_id, p_template, 'email', pr.email, v_payload);
  end if;
end;
$$;

revoke all on function public.queue_vendor_message(uuid, text, jsonb) from public, anon, authenticated;

-- A paid order with a vendor's items, or one cancelled after payment, is news for that vendor.
create function public.queue_vendor_order_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_vendor record;
  v_template text;
begin
  v_template := case new.status
    when 'paid' then 'vendor_new_order'
    when 'cancelled' then 'vendor_order_cancelled'
  end;
  if v_template is null then
    return null;
  end if;
  select * into v_order from public.orders o where o.id = new.order_id;
  if new.status = 'cancelled' and v_order.paid_at is null then
    return null;
  end if;
  for v_vendor in
    select sh.vendor_id, (select coalesce(sum(oi.quantity), 0) from public.order_items oi
                          where oi.order_id = sh.order_id and oi.vendor_id = sh.vendor_id) as items
    from public.order_shipments sh where sh.order_id = new.order_id
  loop
    perform public.queue_vendor_message(v_vendor.vendor_id, v_template,
      jsonb_build_object('order_number', v_order.order_number, 'item_count', v_vendor.items));
  end loop;
  return null;
end;
$$;

create trigger order_events_vendor_notifications after insert on public.order_events
  for each row execute function public.queue_vendor_order_notifications();

-- Reminders before a vendor's year ends: 30, 7 and 1 days ahead, on the day, and the day after. Run daily.
create function public.queue_vendor_renewal_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_count integer := 0;
  v_fee numeric;
begin
  select st.vendor_annual_fee_ghs into v_fee from public.store_settings st;
  for r in
    select v.id, max(s.ends_on) as ends_on
    from public.vendors v join public.vendor_subscriptions s on s.vendor_id = v.id
    where v.status = 'active' and not v.is_house
    group by v.id
    having (max(s.ends_on) - current_date) in (30, 7, 1, 0, -1)
  loop
    perform public.queue_vendor_message(r.id, 'vendor_renewal_reminder',
      jsonb_build_object('ends_on', r.ends_on, 'days_left', r.ends_on - current_date, 'fee_ghs', v_fee));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.queue_vendor_renewal_reminders() from public, anon, authenticated;

select cron.schedule('vendor-renewal-reminders', '0 8 * * *', 'select public.queue_vendor_renewal_reminders()');

-- ---------------------------------------------------------------------------
-- Payout account and ledger
-- ---------------------------------------------------------------------------

alter table public.vendor_private
  add column payout_network text check (payout_network is null or payout_network in ('mtn', 'telecel', 'at')),
  add column payout_wallet text check (payout_wallet is null or length(btrim(payout_wallet)) between 9 and 20),
  add column payout_name text check (payout_name is null or length(btrim(payout_name)) between 2 and 80);

create table public.vendor_payouts (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors (id),
  amount_ghs numeric(10, 2) not null check (amount_ghs > 0),
  method text not null default 'momo' check (method in ('momo', 'bank', 'cash')),
  reference text check (reference is null or length(reference) <= 100),
  note text check (note is null or length(note) <= 500),
  paid_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index vendor_payouts_vendor_idx on public.vendor_payouts (vendor_id, created_at desc);

alter table public.vendor_payouts enable row level security;
create policy "Vendors can read their own payouts" on public.vendor_payouts
  for select to authenticated
  using (exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = (select auth.uid())));
create policy "Admins can read payouts" on public.vendor_payouts
  for select to authenticated using ((select public.current_staff_role()) in ('admin', 'finance'));
grant select on public.vendor_payouts to authenticated;

-- What a vendor has earned and what is still owed.
--   earned   = their price x quantity on delivered orders
--   returned = their price x quantity on returns we have received (the goods are back with them, or at fault)
--   pending  = paid orders not delivered yet
--   balance  = earned - returned - paid
create function public.vendor_balance(p_vendor_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'earned', e.earned, 'returned', e.returned, 'paid', e.paid, 'pending', e.pending,
    'balance', e.earned - e.returned - e.paid)
  from (
    select
      coalesce((select sum(oi.vendor_unit_price_ghs * oi.quantity) from public.order_items oi
                join public.orders o on o.id = oi.order_id
                where oi.vendor_id = p_vendor_id and o.status = 'delivered'), 0) as earned,
      coalesce((select sum(oi.vendor_unit_price_ghs * ri.quantity) from public.return_items ri
                join public.return_requests rr on rr.id = ri.return_id
                join public.order_items oi on oi.id = ri.order_item_id
                where oi.vendor_id = p_vendor_id and rr.status in ('received', 'refunded')), 0) as returned,
      coalesce((select sum(p.amount_ghs) from public.vendor_payouts p where p.vendor_id = p_vendor_id), 0) as paid,
      coalesce((select sum(oi.vendor_unit_price_ghs * oi.quantity) from public.order_items oi
                join public.orders o on o.id = oi.order_id
                where oi.vendor_id = p_vendor_id
                  and o.status in ('paid', 'packing', 'packed', 'out_for_delivery', 'delivery_failed')), 0) as pending
  ) e;
$$;

revoke all on function public.vendor_balance(uuid) from public, anon, authenticated;

create function public.vendor_set_payout_account(p_network text, p_wallet text, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vendors := public.vendor_require_own();
  v_wallet text := regexp_replace(coalesce(p_wallet, ''), '[^0-9+]', '', 'g');
begin
  if p_network is null or p_network not in ('mtn', 'telecel', 'at') then
    raise exception 'Choose your Mobile Money network.' using errcode = '22023';
  end if;
  if length(v_wallet) < 9 or length(v_wallet) > 14 then
    raise exception 'Enter a valid Mobile Money number.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_name, ''))) < 2 then
    raise exception 'Enter the name registered on that wallet.' using errcode = '22023';
  end if;
  update public.vendor_private pr
  set payout_network = p_network, payout_wallet = v_wallet, payout_name = btrim(left(p_name, 80))
  where pr.vendor_id = v.id;
  perform public.audit('vendor.payout_account_set', 'vendor', v.id::text, jsonb_build_object('network', p_network));
end;
$$;

revoke all on function public.vendor_set_payout_account(text, text, text) from public, anon;
grant execute on function public.vendor_set_payout_account(text, text, text) to authenticated;

-- The vendor's own statement: balance, delivered orders, returns and payouts.
create function public.vendor_statement()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.vendors := public.vendor_require_own();
begin
  return public.vendor_balance(v.id) || jsonb_build_object(
    'payout_account', (select jsonb_build_object('network', pr.payout_network, 'wallet', pr.payout_wallet, 'name', pr.payout_name)
                       from public.vendor_private pr where pr.vendor_id = v.id),
    'deliveries', coalesce((
      select jsonb_agg(jsonb_build_object('order_number', t.order_number, 'delivered_at', t.delivered_at, 'amount_ghs', t.amount)
                       order by t.delivered_at desc)
      from (
        select o.order_number, o.delivered_at, sum(oi.vendor_unit_price_ghs * oi.quantity) as amount
        from public.order_items oi join public.orders o on o.id = oi.order_id
        where oi.vendor_id = v.id and o.status = 'delivered'
        group by o.order_number, o.delivered_at
        order by o.delivered_at desc limit 100
      ) t), '[]'::jsonb),
    'returns', coalesce((
      select jsonb_agg(jsonb_build_object('case_number', t.case_number, 'order_number', t.order_number, 'status', t.status,
               'reason', t.reason, 'amount_ghs', t.amount) order by t.created_at desc)
      from (
        select rr.case_number, o.order_number, rr.status, rr.reason, rr.created_at,
               sum(oi.vendor_unit_price_ghs * ri.quantity) as amount
        from public.return_items ri
        join public.return_requests rr on rr.id = ri.return_id
        join public.order_items oi on oi.id = ri.order_item_id
        join public.orders o on o.id = rr.order_id
        where oi.vendor_id = v.id
        group by rr.case_number, o.order_number, rr.status, rr.reason, rr.created_at
        order by rr.created_at desc limit 50
      ) t), '[]'::jsonb),
    'payouts', coalesce((
      select jsonb_agg(jsonb_build_object('amount_ghs', p.amount_ghs, 'method', p.method, 'reference', p.reference,
               'created_at', p.created_at) order by p.created_at desc)
      from public.vendor_payouts p where p.vendor_id = v.id), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.vendor_statement() from public, anon;
grant execute on function public.vendor_statement() to authenticated;

-- The owner's view: every vendor with what they are owed, and where to send it.
create function public.admin_vendor_balances()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['finance']::public.staff_role[]);
  return coalesce((
    select jsonb_agg((public.vendor_balance(v.id)) || jsonb_build_object(
      'vendor_id', v.id, 'name', v.name, 'slug', v.slug,
      'payout_network', pr.payout_network, 'payout_wallet', pr.payout_wallet, 'payout_name', pr.payout_name,
      'last_payout_at', (select max(p.created_at) from public.vendor_payouts p where p.vendor_id = v.id))
      order by (public.vendor_balance(v.id) ->> 'balance')::numeric desc)
    from public.vendors v
    left join public.vendor_private pr on pr.vendor_id = v.id
    where not v.is_house
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_vendor_balances() from public, anon;
grant execute on function public.admin_vendor_balances() to authenticated;

create function public.admin_vendor_payouts(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['finance']::public.staff_role[]);
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'vendor_name', v.name, 'amount_ghs', p.amount_ghs, 'method', p.method,
             'reference', p.reference, 'note', p.note, 'created_at', p.created_at) order by p.created_at desc)
    from (select * from public.vendor_payouts order by created_at desc limit least(coalesce(p_limit, 50), 200)) p
    join public.vendors v on v.id = p.vendor_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_vendor_payouts(integer) from public, anon;
grant execute on function public.admin_vendor_payouts(integer) to authenticated;

-- Records a payout we have made. It can't be more than the vendor is owed.
create function public.admin_record_payout(
  p_vendor_id uuid, p_amount_ghs numeric, p_method text default 'momo', p_reference text default null, p_note text default null
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance numeric;
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
  v_balance := (public.vendor_balance(p_vendor_id) ->> 'balance')::numeric;
  if p_amount_ghs > v_balance then
    raise exception 'That is more than the GH₵% this vendor is owed.', to_char(v_balance, 'FM999999990.00') using errcode = '22023';
  end if;
  insert into public.vendor_payouts (vendor_id, amount_ghs, method, reference, note, paid_by)
  values (p_vendor_id, p_amount_ghs, coalesce(nullif(p_method, ''), 'momo'), btrim(p_reference), nullif(btrim(p_note), ''), auth.uid());
  perform public.queue_vendor_message(p_vendor_id, 'vendor_payout_sent',
    jsonb_build_object('amount_ghs', p_amount_ghs, 'reference', btrim(p_reference)));
  perform public.audit('vendor.payout_recorded', 'vendor', p_vendor_id::text,
    jsonb_build_object('amount_ghs', p_amount_ghs, 'reference', btrim(p_reference)));
  return v_balance - p_amount_ghs;
end;
$$;

revoke all on function public.admin_record_payout(uuid, numeric, text, text, text) from public, anon;
grant execute on function public.admin_record_payout(uuid, numeric, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Messages between a vendor and the owner
-- ---------------------------------------------------------------------------

create table public.vendor_messages (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  sender text not null check (sender in ('vendor', 'owner')),
  body text not null check (length(btrim(body)) between 1 and 2000),
  -- When the other side opened it.
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index vendor_messages_vendor_idx on public.vendor_messages (vendor_id, created_at);

alter table public.vendor_messages enable row level security;
create policy "Vendors can read their own messages" on public.vendor_messages
  for select to authenticated
  using (exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = (select auth.uid())));
create policy "Admins can read vendor messages" on public.vendor_messages
  for select to authenticated using ((select public.current_staff_role()) = 'admin');
grant select on public.vendor_messages to authenticated;

create function public.vendor_send_message(p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vendors := public.vendor_require_own();
begin
  if length(btrim(coalesce(p_body, ''))) < 1 or length(p_body) > 2000 then
    raise exception 'Write a message (up to 2,000 characters).' using errcode = '22023';
  end if;
  if (select count(*) from public.vendor_messages m
      where m.vendor_id = v.id and m.sender = 'vendor' and m.created_at > now() - interval '1 day') >= 30 then
    raise exception 'You have sent a lot of messages today. We will reply soon.' using errcode = '22023';
  end if;
  insert into public.vendor_messages (vendor_id, sender, body) values (v.id, 'vendor', btrim(p_body));
end;
$$;

revoke all on function public.vendor_send_message(text) from public, anon;
grant execute on function public.vendor_send_message(text) to authenticated;

-- The thread, oldest first. Opening it marks the owner's messages as read.
create function public.vendor_messages()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vendors := public.vendor_require_own();
begin
  update public.vendor_messages m set read_at = now() where m.vendor_id = v.id and m.sender = 'owner' and m.read_at is null;
  return coalesce((
    select jsonb_agg(jsonb_build_object('sender', m.sender, 'body', m.body, 'created_at', m.created_at) order by m.created_at)
    from (select * from public.vendor_messages where vendor_id = v.id order by created_at desc limit 200) m
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.vendor_messages() from public, anon;
grant execute on function public.vendor_messages() to authenticated;

create function public.vendor_unread_messages()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.vendor_messages m
  join public.vendors v on v.id = m.vendor_id
  where v.owner_id = auth.uid() and m.sender = 'owner' and m.read_at is null;
$$;

revoke all on function public.vendor_unread_messages() from public, anon;
grant execute on function public.vendor_unread_messages() to authenticated;

-- The owner's inbox: one row per vendor who has written, newest first.
create function public.admin_vendor_threads()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['admin']::public.staff_role[]);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'vendor_id', v.id, 'vendor_name', v.name,
      'last_body', t.last_body, 'last_sender', t.last_sender, 'last_at', t.last_at, 'unread', t.unread)
      order by t.unread desc, t.last_at desc)
    from (
      select m.vendor_id,
             max(m.created_at) as last_at,
             (array_agg(m.body order by m.created_at desc))[1] as last_body,
             (array_agg(m.sender order by m.created_at desc))[1] as last_sender,
             count(*) filter (where m.sender = 'vendor' and m.read_at is null)::integer as unread
      from public.vendor_messages m group by m.vendor_id
    ) t join public.vendors v on v.id = t.vendor_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_vendor_threads() from public, anon;
grant execute on function public.admin_vendor_threads() to authenticated;

create function public.admin_vendor_thread(p_vendor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['admin']::public.staff_role[]);
  update public.vendor_messages m set read_at = now() where m.vendor_id = p_vendor_id and m.sender = 'vendor' and m.read_at is null;
  return coalesce((
    select jsonb_agg(jsonb_build_object('sender', m.sender, 'body', m.body, 'created_at', m.created_at) order by m.created_at)
    from (select * from public.vendor_messages where vendor_id = p_vendor_id order by created_at desc limit 200) m
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_vendor_thread(uuid) from public, anon;
grant execute on function public.admin_vendor_thread(uuid) to authenticated;

create function public.admin_reply_vendor(p_vendor_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['admin']::public.staff_role[]);
  if length(btrim(coalesce(p_body, ''))) < 1 or length(p_body) > 2000 then
    raise exception 'Write a reply (up to 2,000 characters).' using errcode = '22023';
  end if;
  if not exists (select 1 from public.vendors v where v.id = p_vendor_id and not v.is_house) then
    raise exception 'That vendor no longer exists.' using errcode = '22023';
  end if;
  insert into public.vendor_messages (vendor_id, sender, body) values (p_vendor_id, 'owner', btrim(p_body));
  perform public.queue_vendor_message(p_vendor_id, 'vendor_message_reply', '{}'::jsonb);
end;
$$;

revoke all on function public.admin_reply_vendor(uuid, text) from public, anon;
grant execute on function public.admin_reply_vendor(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Existing vendor functions now send their messages.
-- ---------------------------------------------------------------------------

create or replace function public.vendor_apply(p_name text, p_owner_name text, p_email text, p_phone text, p_id_type text, p_id_number text, p_id_path text, p_tagline text DEFAULT NULL::text, p_accept_terms boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v_user uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_owner text := btrim(coalesce(p_owner_name, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_base text;
  v_slug text;
  v_try integer := 1;
  v_id uuid;
begin
  if v_user is null or auth.jwt() ->> 'email' is null then
    raise exception 'Sign in to apply for a store.' using errcode = '42501';
  end if;
  if public.current_staff_role() is not null then
    raise exception 'Staff accounts can''t open vendor stores. Use another email address.' using errcode = '42501';
  end if;
  if exists (select 1 from public.vendors v where v.owner_id = v_user) then
    raise exception 'You have already applied.' using errcode = '22023';
  end if;
  if length(v_name) < 2 or length(v_name) > 60 then
    raise exception 'Enter your store name (2 to 60 characters).' using errcode = '22023';
  end if;
  if length(v_owner) < 2 or length(v_owner) > 80 then
    raise exception 'Enter your full name as it appears on your ID.' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 200 then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_phone, ''))) < 7 then
    raise exception 'Enter a phone number we can reach you on.' using errcode = '22023';
  end if;
  if p_id_type is null or p_id_type not in ('ghana_card', 'passport', 'voters_id', 'drivers_license') then
    raise exception 'Choose the type of ID you are submitting.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_id_number, ''))) < 5 or length(btrim(p_id_number)) > 30 then
    raise exception 'Enter your ID number.' using errcode = '22023';
  end if;
  if split_part(coalesce(p_id_path, ''), '/', 1) <> v_user::text
     or not exists (select 1 from storage.objects o where o.bucket_id = 'vendor-ids' and o.name = p_id_path) then
    raise exception 'Upload a photo or scan of your ID.' using errcode = '22023';
  end if;
  if not coalesce(p_accept_terms, false) then
    raise exception 'Accept the vendor terms to continue.' using errcode = '22023';
  end if;

  v_base := left(public.vendor_slugify(v_name), 34);
  if length(v_base) < 3 then
    v_base := 'store-' || v_base;
  end if;
  v_slug := v_base;
  while exists (select 1 from public.vendors v where v.slug = v_slug) loop
    v_try := v_try + 1;
    v_slug := v_base || '-' || v_try;
  end loop;

  insert into public.vendors (owner_id, slug, name, tagline)
  values (v_user, v_slug, v_name, nullif(btrim(p_tagline), ''))
  returning id into v_id;
  insert into public.vendor_private (vendor_id, phone, email, terms_accepted_at, owner_name, id_type, id_number, id_document_path)
  values (v_id, btrim(p_phone), v_email, now(), v_owner, p_id_type, btrim(p_id_number), p_id_path);
  perform public.audit('vendor.applied', 'vendor', v_id::text, jsonb_build_object('slug', v_slug));
  perform public.queue_vendor_message(v_id, 'vendor_application_received', '{}'::jsonb);
  return v_id;
end;
$$;

create or replace function public.admin_review_vendor(p_vendor_id uuid, p_decision vendor_status, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
begin
  perform public.require_staff(array['admin']::public.staff_role[]);
  if p_decision = 'pending' then
    raise exception 'Choose approve, reject or suspend.' using errcode = '22023';
  end if;
  update public.vendors v set status = p_decision where v.id = p_vendor_id and not v.is_house;
  if not found then
    raise exception 'That vendor no longer exists.' using errcode = '22023';
  end if;
  update public.vendor_private pr set review_note = nullif(btrim(left(p_note, 1000)), '') where pr.vendor_id = p_vendor_id;
  perform public.queue_vendor_message(p_vendor_id,
    case p_decision when 'active' then 'vendor_approved' when 'rejected' then 'vendor_rejected' else 'vendor_suspended' end,
    jsonb_build_object('note', nullif(btrim(p_note), '')));
  perform public.audit('vendor.' || p_decision::text, 'vendor', p_vendor_id::text, jsonb_build_object('note', p_note));
end;
$$;

create or replace function public.admin_record_subscription(p_vendor_id uuid, p_amount_ghs numeric, p_method text DEFAULT 'manual'::text, p_reference text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS date
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v_start date;
  v_end date;
begin
  perform public.require_staff(array['admin']::public.staff_role[]);
  if not exists (select 1 from public.vendors v where v.id = p_vendor_id and not v.is_house) then
    raise exception 'That vendor no longer exists.' using errcode = '22023';
  end if;
  if p_amount_ghs is null or p_amount_ghs < 0 then
    raise exception 'Enter the amount paid.' using errcode = '22023';
  end if;
  v_start := greatest(current_date, coalesce((select max(s.ends_on) + 1 from public.vendor_subscriptions s where s.vendor_id = p_vendor_id), current_date));
  v_end := (v_start + interval '1 year')::date - 1;
  insert into public.vendor_subscriptions (vendor_id, starts_on, ends_on, amount_ghs, method, reference, note, recorded_by)
  values (p_vendor_id, v_start, v_end, p_amount_ghs, p_method, nullif(btrim(p_reference), ''), nullif(btrim(p_note), ''), auth.uid());
  perform public.queue_vendor_message(p_vendor_id, 'vendor_subscription_paid',
    jsonb_build_object('ends_on', v_end, 'amount_ghs', p_amount_ghs));
  perform public.audit('vendor.subscription_recorded', 'vendor', p_vendor_id::text,
    jsonb_build_object('amount_ghs', p_amount_ghs, 'starts_on', v_start, 'ends_on', v_end, 'method', p_method));
  return v_end;
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
    review_note = nullif(btrim(left(p_note, 500)), '')
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
