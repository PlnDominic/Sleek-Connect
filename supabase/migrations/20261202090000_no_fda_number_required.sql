-- The FDA registration number is no longer asked for in Admin → Products and no longer blocks publishing. A product now needs only a category
-- and a description. The column stays, so numbers already entered still show on the product page.

create or replace function public.product_publish_problems(p_product_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.products%rowtype;
  v_missing text[] := '{}'::text[];
begin
  select * into p from public.products where id = p_product_id;
  if not found then
    return array['product not found'];
  end if;

  if p.category_id is null then v_missing := v_missing || 'category'::text; end if;
  if coalesce(btrim(p.details ->> 'description'), '') = '' then v_missing := v_missing || 'description'::text; end if;
  if p.recalled_at is not null then v_missing := v_missing || 'recall lifted'::text; end if;
  return v_missing;
end;
$$;
