-- Account area extras (like the "Pending reviews" page on big marketplaces): the products a shopper has received and not yet reviewed.
-- Only the signed-in shopper's own delivered orders are read. Nothing is exposed to anyone else.

create function public.my_pending_reviews()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(t.item order by t.delivered_at desc), '[]'::jsonb)
  from (
    select distinct on (p.id)
      o.delivered_at,
      jsonb_build_object('product_name', p.name, 'slug', p.slug, 'order_number', o.order_number, 'delivered_at', o.delivered_at) as item
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    join public.products p on p.id = oi.product_id
    where o.user_id = auth.uid()
      and o.status = 'delivered'
      and p.is_published
      and not exists (select 1 from public.product_reviews r where r.product_id = p.id and r.user_id = auth.uid())
    order by p.id, o.delivered_at desc
  ) t;
$$;

revoke all on function public.my_pending_reviews() from public, anon;
grant execute on function public.my_pending_reviews() to authenticated;
