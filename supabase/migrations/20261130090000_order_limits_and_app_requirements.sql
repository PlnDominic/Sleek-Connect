-- 1. Limits on placing orders. place_order can be called by anyone holding the public key, so without limits a script could reserve
--    most of the stock, fill the order queue, or trigger "order received" emails at scale. The limits live on the orders tables
--    themselves, so they apply however an order is placed (website, app, or a direct call).
-- 2. A minimum app version, so an old Android/iOS build can be asked to update instead of failing silently after a database change.
-- 3. Removes the scheduled jobs of the removed marketplace, which would otherwise fail every day.

alter table public.store_settings
  add column if not exists max_open_orders_per_phone integer not null default 3 check (max_open_orders_per_phone between 1 and 1000),
  add column if not exists max_orders_per_phone_per_hour integer not null default 10 check (max_orders_per_phone_per_hour between 1 and 1000),
  add column if not exists max_units_per_order integer not null default 100 check (max_units_per_order between 1 and 1000),
  add column if not exists min_app_build integer not null default 0 check (min_app_build >= 0);

-- Finds a phone number's other orders quickly, whatever way it was typed (024…, +23324…): the last nine digits are compared.
create index if not exists orders_phone_tail_idx
  on public.orders (right(regexp_replace(phone, '\D', '', 'g'), 9), created_at);

create or replace function public.orders_throttle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  v_tail text := right(regexp_replace(coalesce(new.phone, ''), '\D', '', 'g'), 9);
  v_open integer;
  v_hour integer;
begin
  select st.max_open_orders_per_phone as open_max, st.max_orders_per_phone_per_hour as hour_max
    into s from public.store_settings st limit 1;
  if s is null then
    return new;
  end if;

  if length(v_tail) = 9 then
    select count(*) filter (where x.status = 'pending_payment'),
           count(*) filter (where x.created_at > now() - interval '1 hour')
      into v_open, v_hour
    from public.orders x
    where right(regexp_replace(x.phone, '\D', '', 'g'), 9) = v_tail
      and x.created_at > now() - interval '1 day';
    if v_open >= s.open_max then
      raise exception 'You already have orders waiting for payment. Pay for them, or wait a few minutes for them to expire, then try again.' using errcode = '22023';
    end if;
    if v_hour >= s.hour_max then
      raise exception 'There have been too many orders from this number in the last hour. Please try again later, or contact us.' using errcode = '22023';
    end if;
  end if;

  if new.user_id is not null then
    select count(*) into v_open from public.orders x where x.user_id = new.user_id and x.status = 'pending_payment';
    if v_open >= s.open_max then
      raise exception 'You already have orders waiting for payment. Pay for them, or wait a few minutes for them to expire, then try again.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.orders_throttle() from public, anon, authenticated;

drop trigger if exists orders_throttle_before_insert on public.orders;
create trigger orders_throttle_before_insert
  before insert on public.orders
  for each row execute function public.orders_throttle();

create or replace function public.order_items_limit_units()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max integer;
  v_units integer;
begin
  select st.max_units_per_order into v_max from public.store_settings st limit 1;
  select coalesce(sum(i.quantity), 0) into v_units from public.order_items i where i.order_id = new.order_id;
  if v_max is not null and v_units > v_max then
    raise exception 'That is a lot of items for one order (the limit is % units). Please split it into smaller orders or contact us.', v_max using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.order_items_limit_units() from public, anon, authenticated;

drop trigger if exists order_items_limit_units_after_insert on public.order_items;
create trigger order_items_limit_units_after_insert
  after insert on public.order_items
  for each row execute function public.order_items_limit_units();

-- The newest app build number allowed to run. Raise it (with `update public.store_settings set min_app_build = <build number>`)
-- when a database change would break older builds; the app then shows a "please update" screen. 0 allows every build.
create or replace function public.get_app_requirements()
returns table (min_app_build integer)
language sql
stable
security definer
set search_path = ''
as $$
  select st.min_app_build from public.store_settings st limit 1;
$$;
revoke all on function public.get_app_requirements() from public;
grant execute on function public.get_app_requirements() to anon, authenticated;

-- The removed marketplace's scheduled jobs (their functions no longer exist).
do $$
begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule(j.jobid) from cron.job j where j.jobname in ('refresh-vendor-products', 'vendor-renewal-reminders');
  end if;
end;
$$;
