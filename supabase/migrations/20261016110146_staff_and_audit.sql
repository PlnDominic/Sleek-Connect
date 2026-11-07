-- Staff roles with required two-step verification (PRD FR-107) and an append-only audit log (FR-108).

-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------

create type public.staff_role as enum ('admin', 'catalogue', 'operations', 'support', 'finance', 'read_only');

-- Staff are matched to sign-in accounts by confirmed email address. Add the first admin with SQL:
--   insert into public.staff_members (email, role) values ('owner@example.com', 'admin');
create table public.staff_members (
  email text primary key check (email = lower(btrim(email)) and email like '%_@_%'),
  role public.staff_role not null,
  is_active boolean not null default true,
  added_by uuid references auth.users (id) on delete set null,
  added_at timestamptz not null default now()
);

alter table public.staff_members enable row level security;

-- The signed-in user's staff role, or NULL unless they are active staff AND completed two-step verification
-- in this session (assurance level aal2). Every staff permission check goes through this.
create function public.current_staff_role()
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
    and s.is_active
    and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

revoke all on function public.current_staff_role() from public, anon;
grant execute on function public.current_staff_role() to authenticated;

-- What the admin console needs to route a signed-in user: their role (if any) and whether this session has
-- passed two-step verification. Says nothing about other people.
create function public.my_staff_access()
returns table (role public.staff_role, mfa_verified boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.role, coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
  from public.staff_members s
  join auth.users u on lower(u.email) = s.email
  where u.id = auth.uid() and u.email_confirmed_at is not null and s.is_active;
$$;

revoke all on function public.my_staff_access() from public, anon;
grant execute on function public.my_staff_access() to authenticated;

-- Raises unless the caller is verified staff with one of the given roles. Admins may do everything.
create function public.require_staff(p_roles public.staff_role[] default null)
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
    raise exception 'Staff access with two-step verification is required.' using errcode = '42501';
  end if;
  if p_roles is not null and v_role <> 'admin' and not (v_role = any (p_roles)) then
    raise exception 'Your role (%) can''t do this.', replace(v_role::text, '_', ' ') using errcode = '42501';
  end if;
  return v_role;
end;
$$;

revoke all on function public.require_staff(public.staff_role[]) from public, anon, authenticated;

create policy "Staff can see the staff list" on public.staff_members
  for select to authenticated using ((select public.current_staff_role()) is not null);

grant select on public.staff_members to authenticated;

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_email text,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb
);

create index audit_log_entity_idx on public.audit_log (entity, entity_id);

comment on table public.audit_log is 'Append-only record of sensitive staff actions (PRD FR-108). Entries cannot be changed.';

create function public.audit_log_is_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Audit log entries cannot be changed or deleted.' using errcode = '42501';
end;
$$;

create trigger audit_log_append_only
  before update or delete on public.audit_log
  for each row execute function public.audit_log_is_append_only();

alter table public.audit_log enable row level security;

create policy "Admins can read the audit log" on public.audit_log
  for select to authenticated using ((select public.current_staff_role()) = 'admin');

grant select on public.audit_log to authenticated;

create function public.audit(p_action text, p_entity text, p_entity_id text, p_details jsonb default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (actor_id, actor_email, action, entity, entity_id, details)
  values (auth.uid(), auth.jwt() ->> 'email', p_action, p_entity, p_entity_id, p_details);
$$;

revoke all on function public.audit(text, text, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Managing staff (admins only)
-- ---------------------------------------------------------------------------

create function public.admin_set_staff(p_email text, p_role public.staff_role, p_active boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_before public.staff_members%rowtype;
begin
  perform public.require_staff(array['admin']::public.staff_role[]);
  if v_email is null or v_email not like '%_@_%' then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;

  select * into v_before from public.staff_members s where s.email = v_email for update;

  insert into public.staff_members (email, role, is_active, added_by)
  values (v_email, p_role, p_active, auth.uid())
  on conflict (email) do update set role = excluded.role, is_active = excluded.is_active;

  if not exists (select 1 from public.staff_members s where s.role = 'admin' and s.is_active) then
    raise exception 'There must always be at least one active admin.' using errcode = '22023';
  end if;

  perform public.audit(
    case when v_before.email is null then 'staff.added' else 'staff.changed' end, 'staff', v_email,
    jsonb_build_object(
      'before', case when v_before.email is null then null
                     else jsonb_build_object('role', v_before.role, 'active', v_before.is_active) end,
      'after', jsonb_build_object('role', p_role, 'active', p_active)
    )
  );
end;
$$;

revoke all on function public.admin_set_staff(text, public.staff_role, boolean) from public, anon;
grant execute on function public.admin_set_staff(text, public.staff_role, boolean) to authenticated;
