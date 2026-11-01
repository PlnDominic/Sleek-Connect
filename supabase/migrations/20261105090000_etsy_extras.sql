-- More of what makes Etsy work for buyers and sellers, adapted to this marketplace:
--  * Follow a store (Etsy's "favourite shops"): shoppers follow stores and see them on their Saved page; sellers see how many follow.
--  * Seller replies to reviews: a store can answer a published review on its own products, in public. The owner can remove a reply.
--  * Star Seller: a badge for stores with enough delivered orders, a high rating and no recent upheld disputes. Sellers see their progress.
--  * Store facts (orders delivered, year joined, followers) for the public store page.
-- Nothing here changes prices, orders or payments.

-- ---------------------------------------------------------------------------
-- Following stores
-- ---------------------------------------------------------------------------

create table public.store_follows (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, vendor_id)
);

create index store_follows_vendor_idx on public.store_follows (vendor_id);

-- Reached only through the functions below.
alter table public.store_follows enable row level security;
revoke all on public.store_follows from anon, authenticated;

create function public.follow_store(p_slug text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vendors%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in to follow a store.' using errcode = '42501';
  end if;
  select * into v from public.vendors x where x.slug = p_slug and public.vendor_is_live(x.id);
  if not found then
    raise exception 'That store isn''t open.' using errcode = '22023';
  end if;
  if v.owner_id = auth.uid() then
    raise exception 'You can''t follow your own store.' using errcode = '22023';
  end if;
  if (select count(*) from public.store_follows f where f.user_id = auth.uid()) >= 200 then
    raise exception 'You can follow up to 200 stores.' using errcode = '22023';
  end if;
  insert into public.store_follows (user_id, vendor_id) values (auth.uid(), v.id) on conflict do nothing;
end;
$$;

revoke all on function public.follow_store(text) from public, anon;
grant execute on function public.follow_store(text) to authenticated;

create function public.unfollow_store(p_slug text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  delete from public.store_follows f using public.vendors v
  where f.vendor_id = v.id and v.slug = p_slug and f.user_id = auth.uid();
end;
$$;

revoke all on function public.unfollow_store(text) from public, anon;
grant execute on function public.unfollow_store(text) to authenticated;

create function public.is_following_store(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.store_follows f join public.vendors v on v.id = f.vendor_id
    where f.user_id = auth.uid() and v.slug = p_slug
  );
$$;

revoke all on function public.is_following_store(text) from public, anon;
grant execute on function public.is_following_store(text) to authenticated;

-- The stores the signed-in shopper follows that are open right now, newest follow first.
create function public.my_followed_stores()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug', v.slug, 'name', v.name, 'tagline', v.tagline, 'logo_path', v.logo_path)
                            order by f.created_at desc), '[]'::jsonb)
  from public.store_follows f join public.vendors v on v.id = f.vendor_id
  where f.user_id = auth.uid() and public.vendor_is_live(v.id);
$$;

revoke all on function public.my_followed_stores() from public, anon;
grant execute on function public.my_followed_stores() to authenticated;

-- ---------------------------------------------------------------------------
-- Star Seller
-- ---------------------------------------------------------------------------

-- How a store measures up to the Star Seller rules. The rules are fixed here so every store is judged the same way:
--   10 or more delivered orders, 5 or more reviews averaging 4.7 or better, and in the last 90 days no dispute decided against
--   the store and none left unanswered past its 48 hours.
create function public.vendor_star_check(p_vendor_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with o as (
    select count(distinct od.id)::integer as n
    from public.orders od join public.order_items oi on oi.order_id = od.id
    where oi.vendor_id = p_vendor_id and od.status = 'delivered'
  ), r as (
    select count(*)::integer as n, coalesce(round(avg(rv.rating), 2), 0) as avg
    from public.product_reviews rv join public.products p on p.id = rv.product_id
    where p.vendor_id = p_vendor_id and rv.status = 'published'
  ), d as (
    select count(*)::integer as n
    from public.vendor_disputes x
    where x.vendor_id = p_vendor_id
      and ((x.status = 'resolved' and x.outcome in ('upheld', 'partly_upheld') and x.opened_at > now() - interval '90 days')
           or (x.vendor_responded_at is null and x.status <> 'resolved' and x.vendor_due_at < now()))
  )
  select jsonb_build_object(
    'orders', jsonb_build_object('value', o.n, 'needed', 10, 'met', o.n >= 10),
    'rating', jsonb_build_object('value', r.avg, 'reviews', r.n, 'needed', 4.7, 'reviews_needed', 5, 'met', r.n >= 5 and r.avg >= 4.7),
    'disputes', jsonb_build_object('value', d.n, 'met', d.n = 0),
    'star', (o.n >= 10 and r.n >= 5 and r.avg >= 4.7 and d.n = 0)
  )
  from o, r, d;
$$;

revoke all on function public.vendor_star_check(uuid) from public, anon, authenticated;

-- What the seller sees on their dashboard.
create function public.vendor_star_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.vendors := public.vendor_require_own();
begin
  return public.vendor_star_check(v.id) || jsonb_build_object(
    'followers', (select count(*) from public.store_follows f where f.vendor_id = v.id)::integer);
end;
$$;

revoke all on function public.vendor_star_status() from public, anon;
grant execute on function public.vendor_star_status() to authenticated;

-- What shoppers see on a store page: orders delivered, the year it joined, followers and the badge. Counts only.
create function public.store_facts(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'orders_delivered', (select count(distinct od.id) from public.orders od join public.order_items oi on oi.order_id = od.id
                         where oi.vendor_id = v.id and od.status = 'delivered')::integer,
    'joined_year', extract(year from v.created_at)::integer,
    'followers', (select count(*) from public.store_follows f where f.vendor_id = v.id)::integer,
    'star_seller', case when v.is_house then false else (public.vendor_star_check(v.id) ->> 'star')::boolean end)
  from public.vendors v
  where v.slug = p_slug and public.vendor_is_live(v.id);
$$;

revoke all on function public.store_facts(text) from public;
grant execute on function public.store_facts(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Seller replies to reviews
-- ---------------------------------------------------------------------------

alter table public.product_reviews
  add column seller_reply text check (seller_reply is null or length(seller_reply) between 2 and 1000),
  add column seller_replied_at timestamptz;

-- The published reviews on the caller's own products, with any reply already given.
create function public.vendor_reviews()
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
    select jsonb_agg(jsonb_build_object('id', rv.id, 'product_name', p.name, 'product_slug', p.slug, 'rating', rv.rating,
      'title', rv.title, 'body', rv.body, 'display_name', rv.display_name, 'created_at', rv.created_at,
      'seller_reply', rv.seller_reply, 'seller_replied_at', rv.seller_replied_at) order by (rv.seller_reply is null) desc, rv.created_at desc)
    from public.product_reviews rv join public.products p on p.id = rv.product_id
    where p.vendor_id = v.id and rv.status = 'published'), '[]'::jsonb);
end;
$$;

revoke all on function public.vendor_reviews() from public, anon;
grant execute on function public.vendor_reviews() to authenticated;

-- Replies to a published review of the caller's own product. An empty reply removes it.
create function public.vendor_reply_to_review(p_review_id uuid, p_reply text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vendors := public.vendor_require_approved();
  v_reply text := nullif(btrim(coalesce(p_reply, '')), '');
begin
  if v_reply is not null and (length(v_reply) < 2 or length(v_reply) > 1000) then
    raise exception 'Keep your reply between 2 and 1000 characters.' using errcode = '22023';
  end if;
  update public.product_reviews rv
  set seller_reply = v_reply, seller_replied_at = case when v_reply is null then null else now() end
  from public.products p
  where rv.id = p_review_id and p.id = rv.product_id and p.vendor_id = v.id and rv.status = 'published';
  if not found then
    raise exception 'That review isn''t on one of your products.' using errcode = '22023';
  end if;
  perform public.audit(case when v_reply is null then 'review.reply_removed' else 'review.replied' end, 'review', p_review_id::text, null);
end;
$$;

revoke all on function public.vendor_reply_to_review(uuid, text) from public, anon;
grant execute on function public.vendor_reply_to_review(uuid, text) to authenticated;

-- Staff: the replies sellers have written, and removing one that breaks the rules.
create function public.admin_review_replies()
returns table (review_id uuid, store_name text, seller_reply text, seller_replied_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['catalogue', 'support']::public.staff_role[]);
  return query
    select rv.id, vn.name, rv.seller_reply, rv.seller_replied_at
    from public.product_reviews rv join public.products p on p.id = rv.product_id join public.vendors vn on vn.id = p.vendor_id
    where rv.seller_reply is not null;
end;
$$;

revoke all on function public.admin_review_replies() from public, anon;
grant execute on function public.admin_review_replies() to authenticated;

create function public.admin_remove_review_reply(p_review_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['catalogue', 'support']::public.staff_role[]);
  update public.product_reviews rv set seller_reply = null, seller_replied_at = null where rv.id = p_review_id and rv.seller_reply is not null;
  if not found then
    raise exception 'That review has no seller reply.' using errcode = '22023';
  end if;
  perform public.audit('review.reply_removed_by_staff', 'review', p_review_id::text, null);
end;
$$;

revoke all on function public.admin_remove_review_reply(uuid) from public, anon;
grant execute on function public.admin_remove_review_reply(uuid) to authenticated;

-- The public review list now carries the seller's reply.
drop function public.get_product_reviews_page(text, integer, integer, integer);
create function public.get_product_reviews_page(p_slug text, p_limit integer default 10, p_offset integer default 0, p_min_rating integer default 0)
returns table (id uuid, rating smallint, title text, body text, display_name text, created_at timestamptz, seller_reply text, seller_replied_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.rating, r.title, r.body, r.display_name, r.created_at, r.seller_reply, r.seller_replied_at
  from public.product_reviews r join public.products p on p.id = r.product_id
  where p.slug = p_slug and p.is_published and r.status = 'published' and r.rating >= greatest(0, least(p_min_rating, 5))
  order by r.created_at desc
  limit greatest(1, least(p_limit, 50)) offset greatest(0, p_offset);
$$;

revoke all on function public.get_product_reviews_page(text, integer, integer, integer) from public;
grant execute on function public.get_product_reviews_page(text, integer, integer, integer) to anon, authenticated;

create or replace function public.store_reviews(p_slug text, p_limit integer default 6)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'rating', t.rating, 'title', t.title, 'body', t.body, 'display_name', t.display_name, 'created_at', t.created_at,
    'product_name', t.name, 'product_slug', t.slug, 'seller_reply', t.seller_reply) order by t.created_at desc), '[]'::jsonb)
  from (
    select rv.rating, rv.title, rv.body, rv.display_name, rv.created_at, p.name, p.slug, rv.seller_reply
    from public.product_reviews rv
    join public.products p on p.id = rv.product_id
    join public.vendors v on v.id = p.vendor_id
    where v.slug = p_slug and public.vendor_is_live(v.id) and p.is_published and rv.status = 'published'
    order by rv.created_at desc
    limit greatest(1, least(coalesce(p_limit, 6), 30))
  ) t;
$$;

-- ---------------------------------------------------------------------------
-- A shopper's data export includes the stores they follow and the replies to their reviews.
-- ---------------------------------------------------------------------------

create or replace function public.export_my_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'exported_at', now(),
    'account', (
      select jsonb_build_object('email', u.email, 'created_at', u.created_at, 'confirmed_adult_at', pr.confirmed_adult_at,
                                'accepted_terms_at', pr.accepted_terms_at)
      from auth.users u left join public.profiles pr on pr.id = u.id where u.id = v_user
    ),
    'addresses', coalesce((
      select jsonb_agg(jsonb_build_object('label', a.label, 'recipient_name', a.recipient_name, 'phone', a.phone,
        'area', a.area, 'ghanapost_gps', a.ghanapost_gps, 'directions', a.directions, 'is_default', a.is_default,
        'saved_at', a.created_at) order by a.created_at)
      from public.customer_addresses a where a.user_id = v_user), '[]'),
    'payment_methods', coalesce((
      select jsonb_agg(jsonb_build_object('network', m.network, 'wallet_number', m.wallet_number, 'label', m.label,
        'is_default', m.is_default, 'saved_at', m.created_at) order by m.created_at)
      from public.saved_payment_methods m where m.user_id = v_user), '[]'),
    'saved_products', coalesce((
      select jsonb_agg(jsonb_build_object('product', p.name, 'slug', p.slug, 'saved_at', w.created_at) order by w.created_at)
      from public.wishlist_items w join public.products p on p.id = w.product_id where w.user_id = v_user), '[]'),
    'bag', coalesce((
      select jsonb_agg(jsonb_build_object('product', p.name, 'slug', p.slug, 'size', nullif(b.size_code, ''),
        'quantity', b.quantity, 'updated_at', b.updated_at))
      from public.bag_items b join public.products p on p.id = b.product_id where b.user_id = v_user), '[]'),
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'order_number', o.order_number, 'status', o.status, 'placed_at', o.created_at, 'delivered_at', o.delivered_at,
        'customer_name', o.customer_name, 'phone', o.phone, 'email', o.contact_email, 'area', o.area, 'ghanapost_gps', o.ghanapost_gps,
        'directions', o.rider_directions, 'is_gift', o.is_gift, 'adult_and_terms_confirmed_at', o.adult_confirmed_at, 'payment_method', o.payment_method,
        'momo_network', o.momo_network, 'wallet_number', o.wallet_number, 'subtotal_ghs', o.subtotal_ghs,
        'delivery_fee_ghs', o.delivery_fee_ghs, 'total_ghs', o.total_ghs,
        'items', coalesce((select jsonb_agg(jsonb_build_object('product', i.product_name, 'size', i.size_label,
            'unit_price_ghs', i.unit_price_ghs, 'quantity', i.quantity, 'line_total_ghs', i.line_total_ghs))
          from public.order_items i where i.order_id = o.id), '[]'),
        'history', coalesce((select jsonb_agg(jsonb_build_object('status', e.status, 'at', e.at) order by e.at)
          from public.order_events e where e.order_id = o.id), '[]')
      ) order by o.created_at desc)
      from public.orders o where o.user_id = v_user), '[]'),
    'returns', coalesce((
      select jsonb_agg(jsonb_build_object('case_number', r.case_number, 'order_number', o.order_number, 'status', r.status,
        'reason', r.reason, 'details', r.details, 'requested_at', r.created_at) order by r.created_at)
      from public.return_requests r join public.orders o on o.id = r.order_id where o.user_id = v_user), '[]'),
    'support_cases', coalesce((
      select jsonb_agg(jsonb_build_object('case_number', s.case_number, 'order_number', o.order_number, 'topic', s.topic,
        'name', s.name, 'phone', s.phone, 'email', s.email, 'message', s.message, 'status', s.status,
        'reply', s.staff_reply, 'opened_at', s.created_at) order by s.created_at)
      from public.support_cases s join public.orders o on o.id = s.order_id where o.user_id = v_user), '[]'),
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object('product', p.name, 'rating', r.rating, 'title', r.title, 'review', r.body,
        'status', r.status, 'seller_reply', r.seller_reply, 'written_at', r.created_at) order by r.created_at)
      from public.product_reviews r join public.products p on p.id = r.product_id where r.user_id = v_user), '[]'),
    'followed_stores', coalesce((
      select jsonb_agg(jsonb_build_object('store', v.name, 'web_address', v.slug, 'followed_at', f.created_at) order by f.created_at)
      from public.store_follows f join public.vendors v on v.id = f.vendor_id where f.user_id = v_user), '[]'),
    'devices', coalesce((
      select jsonb_agg(jsonb_build_object('platform', d.platform, 'registered_at', d.created_at) order by d.created_at)
      from public.push_devices d where d.user_id = v_user), '[]'),
    'vendor_store', (
      select jsonb_build_object('name', v.name, 'web_address', v.slug, 'tagline', v.tagline, 'description', v.description,
        'status', v.status, 'applied_at', v.created_at, 'phone', pr.phone, 'email', pr.email,
        'owner_name', pr.owner_name, 'id_type', pr.id_type, 'id_number', pr.id_number,
        'subscriptions', coalesce((select jsonb_agg(jsonb_build_object('starts_on', s.starts_on, 'ends_on', s.ends_on,
            'amount_ghs', s.amount_ghs, 'method', s.method, 'reference', s.reference) order by s.starts_on)
          from public.vendor_subscriptions s where s.vendor_id = v.id), '[]'),
        'products', coalesce((select jsonb_agg(jsonb_build_object('name', p.name, 'your_price_ghs', p.vendor_price_ghs,
            'review_status', p.review_status) order by p.created_at)
          from public.products p where p.vendor_id = v.id), '[]'))
      from public.vendors v left join public.vendor_private pr on pr.vendor_id = v.id
      where v.owner_id = v_user and not v.is_house)
  ) into v_result;
  return v_result;
end;
$function$;
