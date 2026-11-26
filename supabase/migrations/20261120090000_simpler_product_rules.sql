-- What a product needs before it can go on the store is cut down to what is really necessary: a category, a description, and for cosmetics
-- (beauty and bath products) the FDA registration number. Brand, ingredients, safety notes, country of origin and the kids' age range are
-- still shown on the product page when they are filled in, but no longer block publishing. The product form in Admin → Products asks only for
-- the necessary fields.

create or replace function public.product_publish_problems(p_product_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.products%rowtype;
  v_cosmetic boolean;
  v_missing text[] := '{}'::text[];
begin
  select * into p from public.products where id = p_product_id;
  if not found then
    return array['product not found'];
  end if;
  v_cosmetic := p.department = 'beauty' or p.kids_filter = 'bath';

  if p.category_id is null then v_missing := v_missing || 'category'::text; end if;
  if coalesce(btrim(p.details ->> 'description'), '') = '' then v_missing := v_missing || 'description'::text; end if;
  if v_cosmetic and coalesce(btrim(p.regulatory_reference), '') = '' then
    v_missing := v_missing || 'FDA registration number'::text;
  end if;
  if p.recalled_at is not null then v_missing := v_missing || 'recall lifted'::text; end if;
  return v_missing;
end;
$$;
