-- Saved Mobile Money numbers, product reviews with moderation, and the shopper's right to export and delete their data
-- (PRD FR-057).

-- ---------------------------------------------------------------------------
-- Saved Mobile Money numbers
-- ---------------------------------------------------------------------------
-- Only the network and wallet number are kept, never a PIN or card details (the store never sees those).

create table public.saved_payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  network public.momo_network not null,
  wallet_number text not null check (wallet_number ~ '^\+?[0-9 ]{9,18}$'),
  label text check (label is null or length(label) <= 40),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index saved_payment_methods_user_idx on public.saved_payment_methods (user_id);
create unique index saved_payment_methods_one_default_idx on public.saved_payment_methods (user_id) where is_default;
create unique index saved_payment_methods_unique_wallet_idx
  on public.saved_payment_methods (user_id, network, (regexp_replace(wallet_number, '\D', '', 'g')));

create trigger saved_payment_methods_set_updated_at
  before update on public.saved_payment_methods
  for each row execute function public.set_updated_at();

alter table public.saved_payment_methods enable row level security;
create policy "Shoppers read their own payment methods" on public.saved_payment_methods
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.saved_payment_methods to authenticated;

-- Saves a Mobile Money number (up to 5). p: {network, wallet_number, label?, is_default?}. Saving a number that is
-- already saved updates it. The first number becomes the default. Returns the id.
create function public.save_payment_method(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_network public.momo_network;
  v_wallet text := nullif(btrim(p ->> 'wallet_number'), '');
  v_digits text;
  v_default boolean := coalesce((p ->> 'is_default')::boolean, false);
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Sign in to save a payment method.' using errcode = '42501';
  end if;
  begin
    v_network := (p ->> 'network')::public.momo_network;
  exception when invalid_text_representation then
    v_network := null;
  end;
  if v_network is null then
    raise exception 'Choose a Mobile Money network.' using errcode = '22023';
  end if;
  v_digits := regexp_replace(coalesce(v_wallet, ''), '\D', '', 'g');
  if v_wallet is null or v_wallet !~ '^\+?[0-9 ]{9,18}$' or length(v_digits) < 9 then
    raise exception 'Enter a valid Mobile Money number.' using errcode = '22023';
  end if;
  if length(coalesce(p ->> 'label', '')) > 40 then
    raise exception 'Keep the name under 40 characters.' using errcode = '22023';
  end if;

  select m.id into v_id from public.saved_payment_methods m
  where m.user_id = v_user and m.network = v_network and regexp_replace(m.wallet_number, '\D', '', 'g') = v_digits;

  if v_id is null then
    if (select count(*) from public.saved_payment_methods m where m.user_id = v_user) >= 5 then
      raise exception 'You can save up to 5 numbers. Remove one first.' using errcode = '22023';
    end if;
    v_default := v_default or not exists (select 1 from public.saved_payment_methods m where m.user_id = v_user);
    if v_default then
      update public.saved_payment_methods m set is_default = false where m.user_id = v_user and m.is_default;
    end if;
    insert into public.saved_payment_methods (user_id, network, wallet_number, label, is_default)
    values (v_user, v_network, v_wallet, nullif(btrim(p ->> 'label'), ''), v_default)
    returning id into v_id;
  else
    if v_default then
      update public.saved_payment_methods m set is_default = false where m.user_id = v_user and m.is_default and m.id <> v_id;
    end if;
    update public.saved_payment_methods m
    set wallet_number = v_wallet,
        label = case when p ? 'label' then nullif(btrim(p ->> 'label'), '') else m.label end,
        is_default = v_default or m.is_default
    where m.id = v_id;
  end if;
  return v_id;
end;
$$;

revoke all on function public.save_payment_method(jsonb) from public, anon;
grant execute on function public.save_payment_method(jsonb) to authenticated;

-- Removes a saved number; if it was the default, the newest remaining one takes over.
create function public.delete_payment_method(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_was_default boolean;
begin
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  delete from public.saved_payment_methods m where m.id = p_id and m.user_id = v_user returning m.is_default into v_was_default;
  if v_was_default then
    update public.saved_payment_methods m set is_default = true
    where m.id = (select x.id from public.saved_payment_methods x where x.user_id = v_user order by x.updated_at desc limit 1);
  end if;
end;
$$;

revoke all on function public.delete_payment_method(uuid) from public, anon;
grant execute on function public.delete_payment_method(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Product reviews with moderation
-- ---------------------------------------------------------------------------
-- Only shoppers who received the product can review it (one review per product). New and edited reviews wait for
-- staff approval before anyone else sees them.

create type public.review_status as enum ('pending', 'published', 'rejected');

create table public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The delivered order that qualified the shopper to review.
  order_id uuid references public.orders (id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  title text check (title is null or length(title) <= 80),
  body text not null check (length(body) between 10 and 2000),
  -- First name and last initial, so reviews don't expose full names.
  display_name text not null check (length(display_name) between 1 and 60),
  status public.review_status not null default 'pending',
  -- Why a review was rejected; shown to its author.
  moderation_note text check (moderation_note is null or length(moderation_note) <= 300),
  moderated_at timestamptz,
  moderated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, user_id)
);

create index product_reviews_product_idx on public.product_reviews (product_id, status, created_at desc);
create index product_reviews_user_idx on public.product_reviews (user_id);
create index product_reviews_order_idx on public.product_reviews (order_id);
create index product_reviews_status_idx on public.product_reviews (status, created_at);

create trigger product_reviews_set_updated_at
  before update on public.product_reviews
  for each row execute function public.set_updated_at();

alter table public.product_reviews enable row level security;
revoke all on public.product_reviews from anon, authenticated;
-- Shoppers read their own reviews (with the moderation outcome). Everyone else gets reviews only through the
-- functions below, which return published ones without the author's account.
create policy "Shoppers read their own reviews" on public.product_reviews
  for select to authenticated using (user_id = (select auth.uid()));
grant select (id, product_id, rating, title, body, display_name, status, moderation_note, created_at, updated_at)
  on public.product_reviews to authenticated;

-- Published reviews for a product, newest first.
create function public.get_product_reviews(p_slug text, p_limit integer default 20)
returns table (id uuid, rating smallint, title text, body text, display_name text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.rating, r.title, r.body, r.display_name, r.created_at
  from public.product_reviews r join public.products p on p.id = r.product_id
  where p.slug = p_slug and p.is_published and r.status = 'published'
  order by r.created_at desc
  limit greatest(1, least(p_limit, 100));
$$;

revoke all on function public.get_product_reviews(text, integer) from public;
grant execute on function public.get_product_reviews(text, integer) to anon, authenticated;

-- Review count, average and how many reviews gave each star rating.
create function public.get_review_summary(p_slug text)
returns table (review_count integer, average numeric, stars_1 integer, stars_2 integer, stars_3 integer, stars_4 integer, stars_5 integer)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer, coalesce(round(avg(r.rating), 1), 0),
    (count(*) filter (where r.rating = 1))::integer, (count(*) filter (where r.rating = 2))::integer,
    (count(*) filter (where r.rating = 3))::integer, (count(*) filter (where r.rating = 4))::integer,
    (count(*) filter (where r.rating = 5))::integer
  from public.product_reviews r join public.products p on p.id = r.product_id
  where p.slug = p_slug and p.is_published and r.status = 'published';
$$;

revoke all on function public.get_review_summary(text) from public;
grant execute on function public.get_review_summary(text) to anon, authenticated;

-- Whether the signed-in shopper may review this product (they received it), and their existing review if any.
create function public.my_review_status(p_slug text)
returns table (can_review boolean, review_id uuid, rating smallint, title text, body text, status public.review_status, moderation_note text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1 from public.orders o join public.order_items i on i.order_id = o.id join public.products p on p.id = i.product_id
      where o.user_id = auth.uid() and o.status = 'delivered' and p.slug = p_slug
    ),
    r.id, r.rating, r.title, r.body, r.status, r.moderation_note
  from (select 1) x
  left join public.products p on p.slug = p_slug
  left join public.product_reviews r on r.product_id = p.id and r.user_id = auth.uid()
  where auth.uid() is not null;
$$;

revoke all on function public.my_review_status(text) from public, anon;
grant execute on function public.my_review_status(text) to authenticated;

-- Adds or replaces the shopper's review of a product. It waits for staff approval again after every change.
create function public.submit_review(p_slug text, p_rating integer, p_title text, p_body text)
returns public.review_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_product uuid;
  v_order uuid;
  v_customer text;
  v_first text;
  v_last text;
  v_name text;
  v_title text := nullif(btrim(p_title), '');
  v_body text := btrim(coalesce(p_body, ''));
begin
  if v_user is null then
    raise exception 'Sign in to review a product.' using errcode = '42501';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'Choose a rating from 1 to 5 stars.' using errcode = '22023';
  end if;
  if length(v_body) < 10 or length(v_body) > 2000 then
    raise exception 'Write between 10 and 2000 characters about the product.' using errcode = '22023';
  end if;
  if length(coalesce(v_title, '')) > 80 then
    raise exception 'Keep the title under 80 characters.' using errcode = '22023';
  end if;

  select p.id into v_product from public.products p where p.slug = p_slug and p.is_published;
  if v_product is null then
    raise exception 'That product isn’t available.' using errcode = '22023';
  end if;

  select o.id, o.customer_name into v_order, v_customer
  from public.orders o join public.order_items i on i.order_id = o.id
  where o.user_id = v_user and o.status = 'delivered' and i.product_id = v_product
  order by o.delivered_at desc nulls last
  limit 1;
  if v_order is null then
    raise exception 'Only customers who received this product can review it.' using errcode = '22023';
  end if;

  v_first := split_part(btrim(v_customer), ' ', 1);
  v_last := regexp_replace(btrim(v_customer), '^.*\s', '');
  v_name := case
    when v_first = '' then 'Verified customer'
    when v_last = v_first or v_last = '' then v_first
    else v_first || ' ' || upper(left(v_last, 1)) || '.'
  end;

  insert into public.product_reviews (product_id, user_id, order_id, rating, title, body, display_name)
  values (v_product, v_user, v_order, p_rating, v_title, v_body, left(v_name, 60))
  on conflict (product_id, user_id) do update
  set rating = excluded.rating, title = excluded.title, body = excluded.body, order_id = excluded.order_id,
      display_name = excluded.display_name, status = 'pending', moderation_note = null, moderated_at = null,
      moderated_by = null;
  return 'pending';
end;
$$;

revoke all on function public.submit_review(text, integer, text, text) from public, anon;
grant execute on function public.submit_review(text, integer, text, text) to authenticated;

create function public.delete_my_review(p_slug text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.product_reviews r
  using public.products p
  where r.product_id = p.id and p.slug = p_slug and r.user_id = auth.uid();
$$;

revoke all on function public.delete_my_review(text) from public, anon;
grant execute on function public.delete_my_review(text) to authenticated;

-- Staff: reviews waiting for a decision (or already decided), oldest first for the queue. Staff see the shopper's
-- display name and the product, not their account.
create function public.admin_list_reviews(p_status public.review_status default 'pending')
returns table (
  id uuid, product_name text, product_slug text, rating smallint, title text, body text, display_name text,
  status public.review_status, moderation_note text, moderated_by text, created_at timestamptz, edited boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['catalogue', 'support']::public.staff_role[]);
  return query
    select r.id, p.name, p.slug, r.rating, r.title, r.body, r.display_name, r.status, r.moderation_note, r.moderated_by,
           r.created_at, r.updated_at > r.created_at + interval '1 minute'
    from public.product_reviews r join public.products p on p.id = r.product_id
    where r.status = p_status
    order by case when p_status = 'pending' then r.created_at end asc, r.created_at desc
    limit 200;
end;
$$;

revoke all on function public.admin_list_reviews(public.review_status) from public, anon;
grant execute on function public.admin_list_reviews(public.review_status) to authenticated;

create function public.admin_review_counts()
returns table (pending integer, published integer, rejected integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff();
  return query
    select (count(*) filter (where r.status = 'pending'))::integer, (count(*) filter (where r.status = 'published'))::integer,
           (count(*) filter (where r.status = 'rejected'))::integer
    from public.product_reviews r;
end;
$$;

revoke all on function public.admin_review_counts() from public, anon;
grant execute on function public.admin_review_counts() to authenticated;

-- Publishes or rejects a review. A rejection needs a short reason, which the author sees.
create function public.admin_moderate_review(p_id uuid, p_decision text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.review_status;
  v_note text := nullif(btrim(p_note), '');
  v_email text;
begin
  perform public.require_staff(array['catalogue', 'support']::public.staff_role[]);
  if p_decision not in ('publish', 'reject') then
    raise exception 'Choose publish or reject.' using errcode = '22023';
  end if;
  if p_decision = 'reject' and v_note is null then
    raise exception 'Give a short reason for rejecting this review.' using errcode = '22023';
  end if;
  if length(coalesce(v_note, '')) > 300 then
    raise exception 'Keep the reason under 300 characters.' using errcode = '22023';
  end if;
  v_status := case p_decision when 'publish' then 'published' else 'rejected' end;
  select u.email into v_email from auth.users u where u.id = auth.uid();

  update public.product_reviews r
  set status = v_status, moderation_note = case when v_status = 'rejected' then v_note end, moderated_at = now(),
      moderated_by = v_email
  where r.id = p_id;
  if not found then
    raise exception 'That review no longer exists.' using errcode = '22023';
  end if;
  perform public.audit('review.' || p_decision, 'product_review', p_id::text, jsonb_build_object('note', v_note));
end;
$$;

revoke all on function public.admin_moderate_review(uuid, text, text) from public, anon;
grant execute on function public.admin_moderate_review(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Your data: export and delete (FR-057)
-- ---------------------------------------------------------------------------

-- Why the signed-in shopper can't delete their account right now, or NULL when they can.
create function public.account_deletion_blocker()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_open integer;
begin
  if v_user is null then
    return 'Sign in first.';
  end if;
  if public.current_staff_role() is not null then
    return 'This account is on the staff list. Ask an admin to remove you from it first.';
  end if;
  select count(*) into v_open from public.orders o
  where o.user_id = v_user and o.status not in ('delivered', 'cancelled', 'returned');
  if v_open > 0 then
    return format('You have %s order%s still in progress. You can delete your account once %s delivered or cancelled.',
                  v_open, case when v_open = 1 then '' else 's' end, case when v_open = 1 then 'it is' else 'they are' end);
  end if;
  return null;
end;
$$;

revoke all on function public.account_deletion_blocker() from public, anon;
grant execute on function public.account_deletion_blocker() to authenticated;

-- Everything the store holds about the signed-in shopper, as one JSON document.
create function public.export_my_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
        'customer_name', o.customer_name, 'phone', o.phone, 'area', o.area, 'ghanapost_gps', o.ghanapost_gps,
        'directions', o.rider_directions, 'is_gift', o.is_gift, 'payment_method', o.payment_method,
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
        'status', r.status, 'written_at', r.created_at) order by r.created_at)
      from public.product_reviews r join public.products p on p.id = r.product_id where r.user_id = v_user), '[]')
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

-- Storage paths of return photos attached to the shopper's orders, so the files can be removed through the Storage API.
create function public.my_return_photo_paths()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(so.name), '{}')
  from storage.objects so
  where so.bucket_id = 'return-photos'
    and split_part(so.name, '/', 1) in (
      select public.return_photo_folder(o.public_token) from public.orders o where o.user_id = auth.uid()
    );
$$;

revoke all on function public.my_return_photo_paths() from public, anon;
grant execute on function public.my_return_photo_paths() to authenticated;

create function public.owns_return_photo(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.orders o
    where o.user_id = auth.uid() and public.return_photo_folder(o.public_token) = split_part(p_name, '/', 1)
  );
$$;

revoke all on function public.owns_return_photo(text) from public, anon;
grant execute on function public.owns_return_photo(text) to authenticated;

create policy "Shoppers can see their own return photos" on storage.objects
  for select to authenticated using (bucket_id = 'return-photos' and public.owns_return_photo(name));
create policy "Shoppers can remove their own return photos" on storage.objects
  for delete to authenticated using (bucket_id = 'return-photos' and public.owns_return_photo(name));

-- Deletes the signed-in shopper's account. Their saved details, bag, wishlist, payment methods and reviews are
-- removed. Orders are kept for the shop's records (accounting, refunds, returns) but lose everything that identifies
-- the shopper: name, phone, address, directions and Mobile Money number. Related support cases and return details are
-- scrubbed the same way, and queued messages are dropped. Return photos are removed by the web app first.
create function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_blocker text := public.account_deletion_blocker();
  v_orders uuid[];
begin
  if v_blocker is not null then
    raise exception '%', v_blocker using errcode = '22023';
  end if;

  select coalesce(array_agg(o.id), '{}') into v_orders from public.orders o where o.user_id = v_user;

  update public.orders o
  set user_id = null, customer_name = 'Deleted customer', phone = '', ghanapost_gps = null, rider_directions = null,
      wallet_number = case when o.wallet_number is null then null else '' end
  where o.id = any (v_orders);

  update public.support_cases s
  set name = 'Deleted customer', phone = '', email = null, message = '[Removed at the customer’s request]',
      staff_reply = null
  where s.order_id = any (v_orders);

  update public.return_requests r set details = null, photo_paths = '{}' where r.order_id = any (v_orders);
  delete from public.notifications n where n.order_id = any (v_orders);

  -- Logged without who it was: the point of deleting is that nothing identifying is kept.
  insert into public.audit_log (action, entity, details)
  values ('account.deleted', 'account', jsonb_build_object('orders_anonymised', cardinality(v_orders)));

  -- Cascades to the profile, addresses, saved numbers, bag, wishlist and reviews.
  delete from auth.users u where u.id = v_user;
  return jsonb_build_object('orders_anonymised', cardinality(v_orders));
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
