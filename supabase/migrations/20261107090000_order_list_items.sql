-- The shopper's order list shows what is in each order, like the "My orders" pages on big marketplaces.
-- Returns, for the signed-in shopper only, the first items of each of their orders.

create function public.my_order_items()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(t.order_number, t.items), '{}'::jsonb)
  from (
    select o.order_number,
           (select coalesce(jsonb_agg(jsonb_build_object('name', i.product_name, 'size', i.size_label, 'quantity', i.quantity, 'slug', p.slug)
                                      order by i.product_name), '[]'::jsonb)
            from public.order_items i left join public.products p on p.id = i.product_id
            where i.order_id = o.id) as items
    from public.orders o
    where o.user_id = auth.uid()
  ) t;
$$;

revoke all on function public.my_order_items() from public, anon;
grant execute on function public.my_order_items() to authenticated;
