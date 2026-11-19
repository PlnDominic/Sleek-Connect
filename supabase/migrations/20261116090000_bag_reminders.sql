-- Abandoned bag reminders: one email and/or SMS to a signed-in shopper who left items in their bag, but only if they agreed to offers
-- (Account → Details: "Offers by SMS / email"), at most once per bag and once a week, in daytime hours, and only while something in the
-- bag can still be bought. The message links to the bag and never contains an order link or a delivery code.
--
-- Messages are queued here and sent by the same dispatcher as order messages. The schedule runs every hour (pg_cron).

create table public.bag_reminders (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_sent_at timestamptz not null default now(),
  -- The bag's last change the reminder was about, so the same bag is never reminded twice.
  bag_updated_at timestamptz not null
);

alter table public.bag_reminders enable row level security;
revoke all on public.bag_reminders from anon, authenticated;

-- `p_now` is only there so the rules can be tested at any time of day.
create function public.queue_bag_reminders(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  u record;
  v_count integer := 0;
  v_hour integer := extract(hour from (p_now at time zone 'Africa/Accra'));
  v_email_ok boolean;
  v_sms_ok boolean;
  v_payload jsonb;
begin
  -- Daytime in Accra only.
  if v_hour < 8 or v_hour >= 20 then
    return 0;
  end if;

  for r in
    select b.user_id,
           max(b.updated_at) as bag_at,
           sum(b.quantity)::integer as item_count,
           (array_agg(p.name order by b.updated_at desc))[1] as first_item,
           sum(coalesce(s.price_ghs, p.price_ghs) * b.quantity) as total_ghs
    from public.bag_items b
    join public.products p on p.id = b.product_id and p.is_published
    left join public.product_sizes s on s.product_id = b.product_id and s.code = b.size_code
    where exists (
      select 1 from public.inventory_levels il
      where il.product_id = b.product_id and il.size_code = b.size_code and il.in_stock
    )
    group by b.user_id
    having max(b.updated_at) <= p_now - interval '3 hours'
       and max(b.updated_at) >= p_now - interval '3 days'
  loop
    -- They ordered since: nothing to remind about.
    if exists (select 1 from public.orders o where o.user_id = r.user_id and o.created_at > r.bag_at) then
      continue;
    end if;
    -- Already reminded about this bag, or about any bag in the last week.
    if exists (
      select 1 from public.bag_reminders br
      where br.user_id = r.user_id and (br.bag_updated_at = r.bag_at or br.last_sent_at > p_now - interval '7 days')
    ) then
      continue;
    end if;

    select au.email, au.email_confirmed_at, au.phone, au.raw_user_meta_data as meta into u
    from auth.users au where au.id = r.user_id;
    if not found then
      continue;
    end if;
    v_email_ok := coalesce((u.meta ->> 'marketing_email_opted_in')::boolean, false)
                  and coalesce(u.email, '') <> '' and u.email_confirmed_at is not null;
    v_sms_ok := coalesce((u.meta ->> 'marketing_sms_opted_in')::boolean, false) and coalesce(u.phone, '') <> '';
    if not v_email_ok and not v_sms_ok then
      continue;
    end if;

    v_payload := jsonb_build_object(
      'order_number', '',
      'customer_name', coalesce(nullif(btrim(coalesce(u.meta ->> 'full_name', u.meta ->> 'name', '')), ''), 'there'),
      'total_ghs', r.total_ghs,
      'delivery_code', '',
      'item_count', r.item_count,
      'first_item', r.first_item
    );
    if v_email_ok then
      insert into public.notifications (template, channel, recipient, payload) values ('bag_reminder', 'email', u.email, v_payload);
    end if;
    if v_sms_ok then
      insert into public.notifications (template, channel, recipient, payload) values ('bag_reminder', 'sms', u.phone, v_payload);
    end if;
    insert into public.bag_reminders (user_id, last_sent_at, bag_updated_at) values (r.user_id, p_now, r.bag_at)
    on conflict (user_id) do update set last_sent_at = excluded.last_sent_at, bag_updated_at = excluded.bag_updated_at;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.queue_bag_reminders(timestamptz) from public, anon, authenticated;

select cron.schedule('bag-reminders', '17 * * * *', 'select public.queue_bag_reminders()');
