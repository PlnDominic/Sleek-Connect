-- Staff sign in with their Google account alone: two-step verification (an authenticator app) is no longer required.
--
-- Staff are still matched to their sign-in account by confirmed email address, must be active on the staff list, and
-- every admin_* function still checks their role. Only the "this session passed two-step verification" condition is
-- removed. Keep the staff list short, and switch on Google's own 2-Step Verification for each staff Google account.

-- The signed-in user's staff role, or NULL unless they are active staff with a confirmed email address.
create or replace function public.current_staff_role()
returns public.staff_role
language sql
stable
security definer
set search_path = ''
as $$
  select s.role
  from public.staff_members s
  join auth.users u on lower(u.email) = s.email
  where u.id = auth.uid()
    and u.email_confirmed_at is not null
    and s.is_active;
$$;

-- What the admin console needs to route a signed-in user: their role, if they are on the staff list. Says nothing
-- about other people. (It used to report whether the session had passed two-step verification as well.)
drop function public.my_staff_access();

create function public.my_staff_access()
returns table (role public.staff_role)
language sql
stable
security definer
set search_path = ''
as $$
  select s.role
  from public.staff_members s
  join auth.users u on lower(u.email) = s.email
  where u.id = auth.uid() and u.email_confirmed_at is not null and s.is_active;
$$;

revoke all on function public.my_staff_access() from public, anon;
grant execute on function public.my_staff_access() to authenticated;

-- Raises unless the caller is active staff with one of the given roles. Admins may do everything.
create or replace function public.require_staff(p_roles public.staff_role[] default null)
returns public.staff_role
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.staff_role := public.current_staff_role();
begin
  if v_role is null then
    raise exception 'Staff access is required.' using errcode = '42501';
  end if;
  if p_roles is not null and v_role <> 'admin' and not (v_role = any (p_roles)) then
    raise exception 'Your role (%) can''t do this.', replace(v_role::text, '_', ' ') using errcode = '42501';
  end if;
  return v_role;
end;
$$;

revoke all on function public.require_staff(public.staff_role[]) from public, anon, authenticated;
