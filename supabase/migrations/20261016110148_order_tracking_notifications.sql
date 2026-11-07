-- Order tracking: status history (FR-042), delivery details (FR-043 to FR-045), the customer's order page and
-- receipt (FR-028, FR-050) and transactional notifications (FR-060).

-- ---------------------------------------------------------------------------
-- Riders and delivery details on orders
-- ---------------------------------------------------------------------------

create table public.riders (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  phone text not null check (length(btrim(phone)) > 0),
  vehicle text not null default 'Motorbike',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.riders enable row level security;

alter table public.orders
  -- Shown to the customer; the rider must get it from them to complete the delivery (proof of delivery, FR-044).
  add column delivery_code text not null default lpad(floor(random() * 10000)::integer::text, 4, '0'),
  add column rider_id uuid references public.riders (id) on delete set null,
  -- A courier partner's tracking reference, when a courier delivers instead of an in-house rider.
  add column courier_reference text,
  add column delivery_attempts integer not null default 0,
  add column delivered_at timestamptz,
  add column delivered_to text,
  -- Money was taken but the order won't be fulfilled: staff must refund it.
  add column refund_due boolean not null default false;

create index orders_rider_id_idx on public.orders (rider_id);
create index orders_status_created_idx on public.orders (status, created_at desc);

-- ---------------------------------------------------------------------------
-- Status history
-- ---------------------------------------------------------------------------

create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  status public.order_status not null,
  at timestamptz not null default now(),
  -- The staff member who made the change; NULL for the shopper, payments and scheduled jobs.
  actor_id uuid references auth.users (id) on delete set null,
  actor_email text,
  -- Staff-facing note and structured details such as a failed-delivery reason.
  note text,
  details jsonb
);

create index order_events_order_id_idx on public.order_events (order_id, at);

alter table public.order_events enable row level security;

-- Functions that change an order's status can attach a note and details to the history entry.
create function public.set_order_event_context(p_note text, p_details jsonb default null)
returns void
language sql
set search_path = ''
as $$
  select set_config('sleek.event_note', coalesce(p_note, ''), true),
         set_config('sleek.event_details', coalesce(p_details::text, ''), true);
$$;

revoke all on function public.set_order_event_context(text, jsonb) from public, anon, authenticated;

create function public.record_order_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.order_events (order_id, status, actor_id, actor_email, note, details)
    values (
      new.id, new.status,
      case when (select public.current_staff_role()) is not null then auth.uid() end,
      case when (select public.current_staff_role()) is not null then auth.jwt() ->> 'email' end,
      nullif(current_setting('sleek.event_note', true), ''),
      nullif(current_setting('sleek.event_details', true), '')::jsonb
    );
    perform public.set_order_event_context(null, null);
  end if;
  return null;
end;
$$;

create trigger orders_record_event
  after insert or update of status on public.orders
  for each row execute function public.record_order_event();

-- History for orders placed before this migration.
insert into public.order_events (order_id, status, at)
select o.id, 'pending_payment', o.created_at from public.orders o;
insert into public.order_events (order_id, status, at)
select o.id, o.status, coalesce(o.paid_at, o.updated_at) from public.orders o where o.status <> 'pending_payment';

-- ---------------------------------------------------------------------------
-- Notifications outbox
-- ---------------------------------------------------------------------------

create type public.notification_channel as enum ('sms', 'email');
create type public.notification_status as enum ('queued', 'sending', 'sent', 'failed', 'not_sent');

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders (id) on delete cascade,
  template text not null,
  channel public.notification_channel not null,
  recipient text not null,
  -- Snapshot of the values the message needs, taken when it was queued.
  payload jsonb not null default '{}',
  status public.notification_status not null default 'queued',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  provider text,
  provider_reference text,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index notifications_due_idx on public.notifications (next_attempt_at) where status in ('queued', 'sending');
create index notifications_order_id_idx on public.notifications (order_id);

alter table public.notifications enable row level security;

-- Queues the customer messages for a status change (PRD FR-060).
create function public.queue_order_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_template text;
  v_email text;
  v_payload jsonb;
begin
  select * into v_order from public.orders o where o.id = new.order_id;

  v_template := case new.status
    when 'paid' then 'order_confirmed'
    when 'packed' then 'order_packed'
    when 'out_for_delivery' then 'out_for_delivery'
    when 'delivered' then 'order_delivered'
    when 'delivery_failed' then 'delivery_failed'
    when 'returned' then 'order_returned'
    -- Unpaid orders that lapse are not worth a message; cancelled paid orders are.
    when 'cancelled' then case when v_order.paid_at is not null then 'order_cancelled' end
  end;
  if v_template is null then
    return null;
  end if;

  v_payload := jsonb_build_object(
    'order_number', v_order.order_number,
    'customer_name', v_order.customer_name,
    'total_ghs', v_order.total_ghs,
    'order_token', v_order.public_token,
    'delivery_code', v_order.delivery_code,
    'rider_name', (select r.name from public.riders r where r.id = v_order.rider_id),
    'courier_reference', v_order.courier_reference,
    'reason', new.details ->> 'reason',
    'refund_due', v_order.refund_due
  );

  insert into public.notifications (order_id, template, channel, recipient, payload)
  values (v_order.id, v_template, 'sms', v_order.phone, v_payload);

  select u.email into v_email from auth.users u where u.id = v_order.user_id;
  if v_email is not null then
    insert into public.notifications (order_id, template, channel, recipient, payload)
    values (v_order.id, v_template, 'email', v_email, v_payload);
  end if;
  return null;
end;
$$;

create trigger order_events_queue_notifications
  after insert on public.order_events
  for each row execute function public.queue_order_notifications();

-- Hands due messages to the sender. Messages stuck in "sending" (a crashed sender) are picked up again later.
create function public.claim_notifications(p_limit integer default 20)
returns table (
  id uuid,
  template text,
  channel public.notification_channel,
  recipient text,
  payload jsonb,
  attempts integer
)
language sql
security definer
set search_path = ''
as $$
  with due as (
    select n.id from public.notifications n
    where n.status in ('queued', 'sending') and n.next_attempt_at <= now()
    order by n.created_at
    limit greatest(1, least(p_limit, 100))
    for update skip locked
  )
  update public.notifications n
  set status = 'sending', attempts = n.attempts + 1, next_attempt_at = now() + interval '10 minutes'
  from due
  where n.id = due.id
  returning n.id, n.template, n.channel, n.recipient, n.payload, n.attempts;
$$;

revoke all on function public.claim_notifications(integer) from public, anon, authenticated;

-- Records the result of a send. Failures are retried with growing gaps, five attempts in all.
create function public.finish_notification(
  p_id uuid,
  p_outcome text,
  p_provider text default null,
  p_reference text default null,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_outcome not in ('sent', 'failed', 'not_sent') then
    raise exception 'Unknown outcome %.', p_outcome using errcode = '22023';
  end if;
  update public.notifications n
  set status = case
        when p_outcome = 'failed' and n.attempts < 5 then 'queued'
        else p_outcome::public.notification_status
      end,
      next_attempt_at = case when p_outcome = 'failed' then now() + make_interval(mins => power(2, n.attempts)::integer) else n.next_attempt_at end,
      provider = p_provider,
      provider_reference = p_reference,
      last_error = p_error,
      sent_at = case when p_outcome = 'sent' then now() end
  where n.id = p_id and n.status = 'sending';
end;
$$;

revoke all on function public.finish_notification(uuid, text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Staff can read orders, payments and their history; all changes go through the admin_* functions.
-- ---------------------------------------------------------------------------

create policy "Staff can read all orders" on public.orders
  for select to authenticated using ((select public.current_staff_role()) is not null);

create policy "Staff can read all order items" on public.order_items
  for select to authenticated using ((select public.current_staff_role()) is not null);

create policy "Staff can read payments" on public.payments
  for select to authenticated using ((select public.current_staff_role()) is not null);

create policy "Staff can read order history" on public.order_events
  for select to authenticated using ((select public.current_staff_role()) is not null);

create policy "Staff can read notifications" on public.notifications
  for select to authenticated using ((select public.current_staff_role()) is not null);

create policy "Staff can read riders" on public.riders
  for select to authenticated using ((select public.current_staff_role()) is not null);

grant select on public.payments, public.order_events, public.notifications, public.riders to authenticated;

-- ---------------------------------------------------------------------------
-- Keep the delivery code secret from staff (FR-044)
-- ---------------------------------------------------------------------------
-- The delivery code proves the customer received the order, so nobody but the customer may read it: not through
-- the orders table, not through the order-page token (get_order shows it), and not through message payloads.
-- Column grants list every other column; give new orders columns a grant when you add them.

revoke select on public.orders from authenticated;
grant select (
  id, order_number, status, user_id, customer_name, phone, area, ghanapost_gps, rider_directions, delivery_option_id,
  is_gift, payment_method, momo_network, wallet_number, subtotal_ghs, delivery_fee_ghs, total_ghs, created_at,
  updated_at, reservation_expires_at, paid_at, cancel_reason, needs_review, rider_id, courier_reference,
  delivery_attempts, delivered_at, delivered_to, refund_due
) on public.orders to authenticated;

revoke select on public.notifications from authenticated;
grant select (
  id, order_id, template, channel, recipient, status, attempts, next_attempt_at, provider, provider_reference,
  last_error, created_at, sent_at
) on public.notifications to authenticated;

-- A signed-in shopper's own orders, newest first, with the links to their order pages.
create function public.my_orders()
returns table (
  order_number text,
  status public.order_status,
  created_at timestamptz,
  total_ghs numeric,
  item_count integer,
  order_token uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.order_number, o.status, o.created_at, o.total_ghs,
         (select coalesce(sum(i.quantity), 0)::integer from public.order_items i where i.order_id = o.id),
         o.public_token
  from public.orders o
  where o.user_id = auth.uid()
  order by o.created_at desc;
$$;

revoke all on function public.my_orders() from public, anon;
grant execute on function public.my_orders() to authenticated;
