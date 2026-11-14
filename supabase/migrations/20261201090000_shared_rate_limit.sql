-- A rate limiter shared by every web server instance. The old limiter counted in each instance's own memory, so on Vercel (many
-- instances) a patient caller could get far more than the limit. This keeps the counts in the database instead.
--
-- Callers are the website's own server code only (service role). The table has no grants and the function is not callable by the public
-- key, so nobody can read the counts or use up someone else's allowance. Keys arrive already hashed by the server (no IP addresses are stored).

create table public.rate_limits (
  key text primary key check (length(key) between 1 and 200),
  hits integer not null,
  reset_at timestamptz not null
);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from public, anon, authenticated;

-- Counts one hit and says whether it is within the limit, in a single atomic statement (safe when many requests arrive at once).
create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns table (allowed boolean, remaining integer, retry_after integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hits integer;
  v_reset timestamptz;
begin
  if p_key is null or length(p_key) not between 1 and 200 or p_limit not between 1 and 100000 or p_window_seconds not between 1 and 86400 then
    raise exception 'Invalid rate limit request.' using errcode = '22023';
  end if;

  insert into public.rate_limits as r (key, hits, reset_at)
  values (p_key, 1, now() + make_interval(secs => p_window_seconds))
  on conflict (key) do update
    set hits = case when r.reset_at <= now() then 1 else r.hits + 1 end,
        reset_at = case when r.reset_at <= now() then now() + make_interval(secs => p_window_seconds) else r.reset_at end
  returning r.hits, r.reset_at into v_hits, v_reset;

  return query select v_hits <= p_limit, greatest(0, p_limit - v_hits), greatest(1, ceil(extract(epoch from (v_reset - now())))::integer);
end;
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

-- Old windows are removed every ten minutes so the table stays small.
create or replace function public.purge_rate_limits()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.rate_limits where reset_at < now() - interval '1 hour';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.purge_rate_limits() from public, anon, authenticated;

select cron.schedule('purge-rate-limits', '*/10 * * * *', 'select public.purge_rate_limits()');
