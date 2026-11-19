-- Categories can be added, renamed, reordered and deleted from Admin → Categories (catalogue staff). A category can't change department or be
-- deleted while products are in it, so no product is left without a home by accident.

create function public.admin_save_category(p jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text := nullif(btrim(p ->> 'id'), '');
  v_name text := btrim(coalesce(p ->> 'name', ''));
  v_department public.department;
  v_base text;
  v_new text;
  v_n integer := 1;
  v_old public.categories%rowtype;
begin
  perform public.require_staff(array['catalogue']::public.staff_role[]);
  if v_name = '' or length(v_name) > 60 then
    raise exception 'Enter a category name of up to 60 characters.' using errcode = '22023';
  end if;
  begin
    v_department := (p ->> 'department')::public.department;
  exception when others then
    raise exception 'Choose a department.' using errcode = '22023';
  end;
  if v_department is null then
    raise exception 'Choose a department.' using errcode = '22023';
  end if;
  if exists (select 1 from public.categories c where lower(c.name) = lower(v_name) and c.id is distinct from v_id) then
    raise exception 'There is already a category called %.', v_name using errcode = '22023';
  end if;

  if v_id is not null then
    select * into v_old from public.categories c where c.id = v_id;
    if not found then
      raise exception 'That category no longer exists.' using errcode = '22023';
    end if;
    if v_old.department <> v_department and exists (select 1 from public.products x where x.category_id = v_id) then
      raise exception 'Move or remove the products in this category before changing its department.' using errcode = '22023';
    end if;
    update public.categories c set name = v_name, department = v_department where c.id = v_id;
    perform public.audit('category.updated', 'category', v_id, jsonb_build_object('name', v_name, 'department', v_department));
    return v_id;
  end if;

  v_base := trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'));
  if v_base = '' then v_base := 'category'; end if;
  v_new := v_base;
  while exists (select 1 from public.categories c where c.id = v_new) loop
    v_n := v_n + 1;
    v_new := v_base || '-' || v_n;
  end loop;
  insert into public.categories (id, name, department, tint, kind, sort_order)
  values (
    v_new, v_name, v_department,
    coalesce((select c.tint from public.categories c where c.department = v_department order by c.sort_order limit 1), '#F3F4F6'),
    'bottle',
    coalesce((select max(c.sort_order) from public.categories c), 0) + 1
  );
  perform public.audit('category.created', 'category', v_new, jsonb_build_object('name', v_name, 'department', v_department));
  return v_new;
end;
$$;

-- Moves a category one place earlier (p_direction -1) or later (1) in the order shoppers see.
create function public.admin_move_category(p_id text, p_direction integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids text[];
  v_pos integer;
  v_to integer;
begin
  perform public.require_staff(array['catalogue']::public.staff_role[]);
  select array_agg(c.id order by c.sort_order, c.name) into v_ids from public.categories c;
  v_pos := array_position(v_ids, p_id);
  if v_pos is null then
    raise exception 'That category no longer exists.' using errcode = '22023';
  end if;
  v_to := v_pos + case when p_direction < 0 then -1 else 1 end;
  if v_to < 1 or v_to > array_length(v_ids, 1) then
    return;
  end if;
  v_ids[v_pos] := v_ids[v_to];
  v_ids[v_to] := p_id;
  update public.categories c set sort_order = o.n::smallint
  from (select id, ord as n from unnest(v_ids) with ordinality as t(id, ord)) o
  where c.id = o.id;
  perform public.audit('category.moved', 'category', p_id, jsonb_build_object('direction', p_direction));
end;
$$;

create function public.admin_delete_category(p_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_photo text;
begin
  perform public.require_staff(array['catalogue']::public.staff_role[]);
  select c.photo_path into v_photo from public.categories c where c.id = p_id;
  if not found then
    raise exception 'That category no longer exists.' using errcode = '22023';
  end if;
  if exists (select 1 from public.products x where x.category_id = p_id) then
    raise exception 'This category still has products. Move or delete them first.' using errcode = '22023';
  end if;
  delete from public.categories c where c.id = p_id;
  perform public.audit('category.deleted', 'category', p_id, '{}'::jsonb);
  -- The caller removes the photo file through the Storage API.
  return v_photo;
end;
$$;

revoke all on function public.admin_save_category(jsonb) from public, anon;
revoke all on function public.admin_move_category(text, integer) from public, anon;
revoke all on function public.admin_delete_category(text) from public, anon;
grant execute on function public.admin_save_category(jsonb) to authenticated;
grant execute on function public.admin_move_category(text, integer) to authenticated;
grant execute on function public.admin_delete_category(text) to authenticated;
