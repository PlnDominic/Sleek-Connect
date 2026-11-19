-- Discovery metrics used by public listing pages. Counts are derived from published reviews and completed orders;
-- no customer identifiers are exposed.
create or replace function public.get_product_discovery_metrics()
returns table (slug text, average_rating numeric, review_count integer, popularity bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select p.slug,
    coalesce((select round(avg(r.rating), 1) from public.product_reviews r where r.product_id = p.id and r.status = 'published'), 0)::numeric,
    coalesce((select count(*)::integer from public.product_reviews r where r.product_id = p.id and r.status = 'published'), 0),
    coalesce((select sum(oi.quantity)::bigint
      from public.order_items oi join public.orders o on o.id = oi.order_id
      where oi.product_id = p.id and o.status in ('paid', 'packing', 'packed', 'out_for_delivery', 'delivered')), 0)::bigint
  from public.products p
  where p.is_published and p.recalled_at is null;
$$;
revoke all on function public.get_product_discovery_metrics() from public;
grant execute on function public.get_product_discovery_metrics() to anon, authenticated;
