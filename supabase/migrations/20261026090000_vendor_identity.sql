-- Vendor applications now carry the owner's full name, a contact email and identification: an ID type and number
-- plus a photo or scan of the document, kept in a private bucket only the owner (admin) can open.

alter table public.vendor_private
  add column owner_name text check (owner_name is null or length(btrim(owner_name)) between 2 and 80),
  add column id_type text check (id_type is null or id_type in ('ghana_card', 'passport', 'voters_id', 'drivers_license')),
  add column id_number text check (id_number is null or length(btrim(id_number)) between 5 and 30),
  -- Path in the private vendor-ids bucket: <auth user id>/<file>
  add column id_document_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vendor-ids', 'vendor-ids', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- Applicants upload, see and remove their own ID file (folder = their user id); admins can open every one.
create policy "Applicants upload their ID" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'vendor-ids' and split_part(name, '/', 1) = (select auth.uid())::text);
create policy "Applicants see their own ID" on storage.objects
  for select to authenticated
  using (bucket_id = 'vendor-ids' and split_part(name, '/', 1) = (select auth.uid())::text);
create policy "Applicants remove their own ID" on storage.objects
  for delete to authenticated
  using (bucket_id = 'vendor-ids' and split_part(name, '/', 1) = (select auth.uid())::text);
create policy "Admins can open vendor IDs" on storage.objects
  for select to authenticated
  using (bucket_id = 'vendor-ids' and (select public.current_staff_role()) = 'admin');

-- Applying now needs the owner's name, email and identification.
drop function public.vendor_apply(text, text, text, boolean);

create function public.vendor_apply(
  p_name text, p_owner_name text, p_email text, p_phone text,
  p_id_type text, p_id_number text, p_id_path text,
  p_tagline text default null, p_accept_terms boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
  return v_id;
end;
$$;

revoke all on function public.vendor_apply(text, text, text, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.vendor_apply(text, text, text, text, text, text, text, text, boolean) to authenticated;

-- The vendor's own view and the owner's list now include the name and ID details; the export includes them too.
create or replace function public.vendor_me()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v public.vendors%rowtype;
  s public.store_settings%rowtype;
  v_paid_until date;
  v_next_start date;
begin
  if auth.uid() is null then
    return null;
  end if;
  select * into v from public.vendors x where x.owner_id = auth.uid() and not x.is_house;
  if not found then
    return null;
  end if;
  select * into s from public.store_settings;
  select max(sub.ends_on) into v_paid_until from public.vendor_subscriptions sub where sub.vendor_id = v.id;
  return jsonb_build_object(
    'id', v.id,
    'slug', v.slug,
    'name', v.name,
    'tagline', v.tagline,
    'description', v.description,
    'logo_path', v.logo_path,
    'banner_path', v.banner_path,
    'status', v.status,
    'live', public.vendor_is_live(v.id),
    'paid_until', v_paid_until,
    'grace_days', s.vendor_grace_days,
    'annual_fee_ghs', s.vendor_annual_fee_ghs,
    'payment_instructions', s.vendor_payment_instructions,
    'phone', (select p.phone from public.vendor_private p where p.vendor_id = v.id),
    'email', (select p.email from public.vendor_private p where p.vendor_id = v.id),
    'review_note', (select p.review_note from public.vendor_private p where p.vendor_id = v.id),
    'owner_name', (select p.owner_name from public.vendor_private p where p.vendor_id = v.id),
    'id_type', (select p.id_type from public.vendor_private p where p.vendor_id = v.id)
  );
end;
$$;

create or replace function public.admin_vendors()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
begin
  perform public.require_staff(array['admin']::public.staff_role[]);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', v.id, 'slug', v.slug, 'name', v.name, 'tagline', v.tagline, 'status', v.status, 'created_at', v.created_at,
      'live', public.vendor_is_live(v.id),
      'phone', pr.phone, 'email', pr.email, 'review_note', pr.review_note,
      'owner_name', pr.owner_name, 'id_type', pr.id_type, 'id_number', pr.id_number, 'id_document_path', pr.id_document_path,
      'paid_until', (select max(s.ends_on) from public.vendor_subscriptions s where s.vendor_id = v.id),
      'products', (select count(*) from public.products p where p.vendor_id = v.id),
      'pending_products', (select count(*) from public.products p where p.vendor_id = v.id and p.review_status = 'pending')
    ) order by (v.status = 'pending') desc, v.created_at desc)
    from public.vendors v
    left join public.vendor_private pr on pr.vendor_id = v.id
    where not v.is_house
  ), '[]'::jsonb);
end;
$$;

create or replace function public.export_my_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
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
      from public.product_reviews r join public.products p on p.id = r.product_id where r.user_id = v_user), '[]'),
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
$$;
