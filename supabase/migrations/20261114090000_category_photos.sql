-- Category pictures: staff upload a photo for each category (Admin → Categories). The sample product photos that were standing in
-- for category pictures are cleared, so no sample imagery stays on the live store.

alter table public.categories add column photo_path text;

update public.categories set image_key = null where image_key is not null;

-- Sets or clears (p_path null) a category's photo. The file is uploaded to the public product-images bucket under categories/<id>/.
create function public.admin_set_category_photo(p_id text, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['catalogue']::public.staff_role[]);
  if not exists (select 1 from public.categories c where c.id = p_id) then
    raise exception 'That category no longer exists.' using errcode = '22023';
  end if;
  if p_path is not null and (
       split_part(p_path, '/', 1) <> 'categories'
       or split_part(p_path, '/', 2) <> p_id
       or not exists (select 1 from storage.objects o where o.bucket_id = 'product-images' and o.name = p_path)
     ) then
    raise exception 'The photo didn''t upload. Please try again.' using errcode = '22023';
  end if;
  update public.categories c set photo_path = p_path where c.id = p_id;
  perform public.audit('category.photo_set', 'category', p_id, jsonb_build_object('path', p_path));
end;
$$;

revoke all on function public.admin_set_category_photo(text, text) from public, anon;
grant execute on function public.admin_set_category_photo(text, text) to authenticated;
