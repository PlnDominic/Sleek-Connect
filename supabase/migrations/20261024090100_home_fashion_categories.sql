-- Starter categories for the new departments, and two beauty categories for the kits and hair accessories the store
-- will sell. Staff add the products themselves in Admin → Products.

-- The "kids filter" (bath, toys, clothing, gifts) only means something for kids' products. Clear it for every other
-- department, whichever way the product is saved.
create function public.products_clear_kids_filter()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.department <> 'kids' then
    new.kids_filter := null;
  end if;
  return new;
end;
$$;

create trigger products_clear_kids_filter
  before insert or update of department, kids_filter on public.products
  for each row execute function public.products_clear_kids_filter();

update public.products set kids_filter = null where department <> 'kids' and kids_filter is not null;

insert into public.categories (id, name, department, image_key, tint, kind, sort_order) values
  ('beauty-kits',        'Beauty Kits',                  'beauty',  null, '#E8EEF5', 'gift', 10),
  ('makeup-kits',        'Makeup Kits',                  'beauty',  null, '#E8EEF5', 'gift', 11),
  ('hair-accessories',   'Hair Accessories',             'beauty',  null, '#F5F7FA', 'gift', 12),
  ('groceries',          'Groceries',                    'home',    null, '#EDF5F2', 'jar',  20),
  ('kitchen-appliances', 'Kitchen & Home Appliances',    'home',    null, '#E3F0EC', 'gift', 21),
  ('jewellery',          'Jewellery',                    'fashion', null, '#E8EEF5', 'gift', 30),
  ('bags',               'Bags',                         'fashion', null, '#F5F7FA', 'gift', 31),
  ('more-accessories',   'More Accessories',             'fashion', null, '#EDF5F2', 'gift', 32)
on conflict (id) do nothing;
