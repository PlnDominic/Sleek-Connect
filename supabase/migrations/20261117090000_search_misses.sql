-- What shoppers search for and don't find, so the owner knows what to stock (Admin → Catalogue → Searches).
-- Only the normalised search words and a daily count are kept: no address, device, account or time of day. Anything that looks like
-- personal data (an email address, a long number, a web address) is not recorded at all.

create table public.search_misses (
  day date not null default current_date,
  term text not null,
  searches integer not null default 1,
  primary key (day, term)
);

alter table public.search_misses enable row level security;
revoke all on public.search_misses from anon, authenticated;

-- Called by the website when a search that found nothing has stayed on screen. Never raises: a failure here must not bother the shopper.
create function public.record_search_miss(p_query text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_term text := lower(btrim(regexp_replace(coalesce(p_query, ''), '\s+', ' ', 'g')));
begin
  if length(v_term) < 2 or length(v_term) > 60
     or v_term ~ '[@/]' or v_term ~ '\d{5,}' or v_term like '%http%' or v_term like '%www.%' then
    return;
  end if;
  -- A flood of made-up words can't grow the table: new words stop being added after 2,000 a day.
  if not exists (select 1 from public.search_misses m where m.day = current_date and m.term = v_term)
     and (select count(*) from public.search_misses m where m.day = current_date) >= 2000 then
    return;
  end if;
  insert into public.search_misses (day, term) values (current_date, v_term)
  on conflict (day, term) do update set searches = public.search_misses.searches + 1;
exception when others then
  return;
end;
$$;

revoke all on function public.record_search_miss(text) from public;
grant execute on function public.record_search_miss(text) to anon, authenticated;

-- The report: the most-missed words over the last p_days days.
create function public.admin_search_misses(p_days integer default 30)
returns table (term text, searches bigint, days_seen bigint, last_seen date)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['catalogue']::public.staff_role[]);
  return query
    select m.term, sum(m.searches)::bigint, count(*)::bigint, max(m.day)
    from public.search_misses m
    where m.day >= current_date - greatest(1, least(coalesce(p_days, 30), 365))
    group by m.term
    order by sum(m.searches) desc, max(m.day) desc, m.term
    limit 200;
end;
$$;

revoke all on function public.admin_search_misses(integer) from public, anon;
grant execute on function public.admin_search_misses(integer) to authenticated;

-- Marks a word as dealt with (for example once a matching product has been added).
create function public.admin_clear_search_miss(p_term text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff(array['catalogue']::public.staff_role[]);
  delete from public.search_misses m where m.term = lower(btrim(coalesce(p_term, '')));
  perform public.audit('search_miss.cleared', 'search', lower(btrim(coalesce(p_term, ''))), null);
end;
$$;

revoke all on function public.admin_clear_search_miss(text) from public, anon;
grant execute on function public.admin_clear_search_miss(text) to authenticated;

-- Three months is plenty.
create function public.purge_old_search_misses()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.search_misses m where m.day < current_date - 90;
$$;

revoke all on function public.purge_old_search_misses() from public, anon, authenticated;

select cron.schedule('purge-search-misses', '25 0 * * *', 'select public.purge_old_search_misses()');
