-- Launch hardening: fail closed for invalid delivery configuration and preserve payment integrity.
-- The trigger protects every caller, including direct RPC attempts, rather than relying only on the checkout UI.

create or replace function public.validate_order_delivery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zone_id text;
  v_option_fee numeric;
  v_available boolean;
begin
  select o.fee_ghs into v_option_fee
  from public.delivery_options o
  where o.id = new.delivery_option_id;
  if not found or v_option_fee is null then
    raise exception 'This delivery option is not configured yet.' using errcode = '22023';
  end if;

  select a.zone_id into v_zone_id
  from public.delivery_areas a
  where a.name = new.area and a.is_active;
  if not found then
    raise exception 'We don''t deliver to that area yet.' using errcode = '22023';
  end if;

  if v_zone_id is not null then
    select r.is_available into v_available
    from public.delivery_rates r
    where r.zone_id = v_zone_id and r.option_id = new.delivery_option_id;
    if not found or not coalesce(v_available, false) then
      raise exception 'That delivery option is not available in this area.' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.validate_order_delivery() from public, anon, authenticated;

drop trigger if exists orders_validate_delivery on public.orders;
create trigger orders_validate_delivery
  before insert on public.orders
  for each row execute function public.validate_order_delivery();

-- Keep monetary payment records non-negative even if a future caller bypasses the payment RPC.
alter table public.payments
  drop constraint if exists payments_amount_ghs_check;
alter table public.payments
  add constraint payments_amount_ghs_check check (amount_ghs >= 0);
