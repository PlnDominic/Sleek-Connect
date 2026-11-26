-- Search suggestions: as-you-type completions and "Did you mean" corrections.
--
-- Matches published product names, brands and categories that have published products. Word similarity forgives typos
-- ("serun"), and names or words that start with what was typed rank first ("ser" finds the serum). Nothing about
-- people is returned, so anyone may call it. "Did you mean" asks for a lower minimum score to catch bigger typos.

create function public.search_suggestions(p_query text, p_limit integer default 8, p_min_score real default 0.45)
returns table (kind text, label text, slug text, department public.department, score real)
language sql
stable
security definer
set search_path = ''
as $$
  with q as (
    select lower(btrim(regexp_replace(regexp_replace(coalesce(p_query, ''), '[%_\\]', '', 'g'), '\s+', ' ', 'g'))) as q
  ),
  candidates as (
    select 'product'::text as kind, p.name as label, p.slug, p.department, lower(p.name) as hay, 1.0 as weight
    from public.products p
    where p.is_published
    union all
    select 'brand'::text, b.brand, null::text, null::public.department, lower(b.brand), 0.95
    from (select distinct brand from public.products where is_published and brand is not null) b
    union all
    select 'category'::text, c.name, c.id, c.department, lower(c.name), 0.9
    from public.categories c
    where exists (select 1 from public.products p where p.category_id = c.id and p.is_published)
  ),
  scored as (
    select c.kind, c.label, c.slug, c.department,
      extensions.word_similarity(q.q, c.hay) * c.weight
        + case when c.hay like q.q || '%' then 0.5 when c.hay like '% ' || q.q || '%' then 0.3 else 0 end as score
    from candidates c
    cross join q
    where length(q.q) >= 2
  )
  select s.kind, s.label, s.slug, s.department, s.score::real
  from scored s
  where s.score >= greatest(p_min_score, 0.2)
  order by s.score desc, s.kind, s.label
  limit greatest(1, least(p_limit, 20));
$$;

revoke all on function public.search_suggestions(text, integer, real) from public;
grant execute on function public.search_suggestions(text, integer, real) to anon, authenticated;
