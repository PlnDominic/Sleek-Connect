-- Security audit fixes.
--
-- 1. Order numbers were SC-1001, SC-1002, ... so anyone who knew a shopper's phone number could walk through the numbers with
--    find_order (8 misses an hour per phone) and recover the order page link. New orders now get an unpredictable number of the
--    same shape (SC-<10 digits>), which keeps every screen, email and test that expects SC-<digits> working. Orders already placed
--    keep their numbers.
-- 2. verify_fn_privilege(role, function, privilege) answers "may this role run that function?" for any function. It is only an
--    internal helper of verify_launch_schema(), which is a security definer function and keeps working, so the public roles
--    no longer need to call it directly.

create or replace function public.new_order_number()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_number text;
begin
  loop
    -- 32 bits from the database's secure random source (gen_random_uuid), shifted into 10 digits.
    v_number := 'SC-' || (1000000000 + (('x' || substr(md5(gen_random_uuid()::text), 1, 8))::bit(32)::bigint))::text;
    exit when not exists (select 1 from public.orders o where o.order_number = v_number);
  end loop;
  return v_number;
end;
$$;

-- Only the order-placing function (which runs as the table owner) fills this default in; shoppers never call it.
revoke all on function public.new_order_number() from public, anon, authenticated;

alter table public.orders alter column order_number set default public.new_order_number();

revoke execute on function public.verify_fn_privilege(text, text, text) from public, anon, authenticated;
grant execute on function public.verify_fn_privilege(text, text, text) to service_role;
