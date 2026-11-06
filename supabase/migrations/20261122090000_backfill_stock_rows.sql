-- Every product (and each of its sizes) needs a stock row before stock can be received into it. Saving a product creates
-- these, so this only fills in any product that is missing one. It changes no quantities and is safe to run again.
insert into public.inventory_levels (product_id, size_code)
select p.id, coalesce(s.code, '')
from public.products p
left join public.product_sizes s on s.product_id = p.id
on conflict do nothing;
