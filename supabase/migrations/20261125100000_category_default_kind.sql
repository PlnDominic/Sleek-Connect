-- New categories start with the neutral 'box' picture kind instead of 'bottle', so a category of any kind of product looks right until its
-- photo is added. Replaces admin_save_category from 20261124090000; nothing else changes.
create or replace function public.admin_save_category(p jsonb)
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
    'box',
    coalesce((select max(c.sort_order) from public.categories c), 0) + 1
  );
  perform public.audit('category.created', 'category', v_new, jsonb_build_object('name', v_name, 'department', v_department));
  return v_new;
end;
$$;
