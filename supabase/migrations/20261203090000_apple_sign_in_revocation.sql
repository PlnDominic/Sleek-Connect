-- Sign in with Apple: Apple requires an app that lets people delete their account to also revoke the Apple link
-- (App Store guideline 5.1.1(v)). Revoking needs a refresh token that Apple only hands out when the sign-in's
-- authorization code is exchanged, so the code is exchanged by the website's server right after sign-in and the
-- resulting token is kept here until the account is deleted.
--
-- The table has no grants. A signed-in shopper can only store a token for themselves and take it back
-- (taking it removes it); nobody can read other people's. The row goes away with the account.

create table public.apple_sign_in_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null check (length(refresh_token) between 10 and 2000),
  saved_at timestamptz not null default now()
);

alter table public.apple_sign_in_tokens enable row level security;
revoke all on public.apple_sign_in_tokens from public, anon, authenticated;

create or replace function public.save_apple_refresh_token(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;
  insert into public.apple_sign_in_tokens (user_id, refresh_token)
  values (auth.uid(), p_token)
  on conflict (user_id) do update set refresh_token = excluded.refresh_token, saved_at = now();
end;
$$;

-- Hands the stored token back once and forgets it, so a failed revocation can put it back with save_apple_refresh_token.
create or replace function public.take_apple_refresh_token()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;
  delete from public.apple_sign_in_tokens where user_id = auth.uid() returning refresh_token into v_token;
  return v_token;
end;
$$;

revoke all on function public.save_apple_refresh_token(text) from public, anon, authenticated;
revoke all on function public.take_apple_refresh_token() from public, anon, authenticated;
grant execute on function public.save_apple_refresh_token(text) to authenticated;
grant execute on function public.take_apple_refresh_token() to authenticated;
