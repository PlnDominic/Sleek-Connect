-- A saved address no longer has to carry an area. The delivery area (and its fee) is picked at checkout, so the account's address form
-- doesn't ask for it. Addresses saved before keep the area they have; editing one without the field leaves it alone.

alter table public.customer_addresses alter column area drop not null;

create or replace function public.save_address(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_name text := nullif(btrim(p ->> 'recipient_name'), '');
  v_phone text := nullif(btrim(p ->> 'phone'), '');
  v_area text := nullif(btrim(p ->> 'area'), '');
  v_gps text := upper(nullif(btrim(p ->> 'ghanapost_gps'), ''));
  v_default boolean := coalesce((p ->> 'is_default')::boolean, false);
begin
  if v_user is null then
    raise exception 'Sign in to save addresses.' using errcode = '42501';
  end if;
  if v_name is null or length(v_name) > 120 then
    raise exception 'Enter the name of the person receiving the order.' using errcode = '22023';
  end if;
  if v_phone is null or regexp_replace(v_phone, '\D', '', 'g') !~ '^\d{9,15}$' then
    raise exception 'Enter a valid phone number.' using errcode = '22023';
  end if;
  -- The area is optional here: it is chosen at checkout, where the delivery fee depends on it.
  if v_area is not null and not exists (select 1 from public.delivery_areas a where a.name = v_area and a.is_active) then
    raise exception 'Choose one of the areas we deliver to.' using errcode = '22023';
  end if;
  if v_gps is not null and v_gps !~ '^[A-Z]{2}-?[0-9]{3,4}-?[0-9]{3,5}$' then
    raise exception 'GhanaPost GPS addresses look like GA-123-4567.' using errcode = '22023';
  end if;
  if length(coalesce(p ->> 'directions', '')) > 300 or length(coalesce(p ->> 'label', '')) > 40 then
    raise exception 'Keep the label under 40 characters and the directions under 300.' using errcode = '22023';
  end if;

  if v_id is null then
    if (select count(*) from public.customer_addresses c where c.user_id = v_user) >= 10 then
      raise exception 'You can save up to 10 addresses. Remove one first.' using errcode = '22023';
    end if;
    v_default := v_default or not exists (select 1 from public.customer_addresses c where c.user_id = v_user);
    if v_default then
      update public.customer_addresses c set is_default = false where c.user_id = v_user and c.is_default;
    end if;
    insert into public.customer_addresses (user_id, label, recipient_name, phone, area, ghanapost_gps, directions, is_default)
    values (v_user, nullif(btrim(p ->> 'label'), ''), v_name, v_phone, v_area, v_gps, nullif(btrim(p ->> 'directions'), ''),
            v_default)
    returning id into v_id;
  else
    if not exists (select 1 from public.customer_addresses c where c.id = v_id and c.user_id = v_user) then
      raise exception 'That address no longer exists.' using errcode = '22023';
    end if;
    if v_default then
      update public.customer_addresses c set is_default = false where c.user_id = v_user and c.is_default and c.id <> v_id;
    end if;
    update public.customer_addresses c
    set label = nullif(btrim(p ->> 'label'), ''), recipient_name = v_name, phone = v_phone, area = case when p ? 'area' then v_area else c.area end,
        ghanapost_gps = v_gps, directions = nullif(btrim(p ->> 'directions'), ''),
        is_default = v_default or c.is_default
    where c.id = v_id;
  end if;
  return v_id;
end;
$$;

revoke all on function public.save_address(jsonb) from public, anon;
grant execute on function public.save_address(jsonb) to authenticated;
