-- Vendors can pay their yearly subscription online (Mobile Money or card through the payment provider), instead of the
-- owner recording each payment by hand. The provider's verified notification is what opens or renews the store.

create table public.vendor_subscription_payments (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors (id),
  provider text not null,
  provider_reference text not null,
  amount_ghs numeric(10, 2) not null check (amount_ghs >= 0),
  status public.payment_status not null default 'pending',
  last_event jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_reference)
);

create index vendor_subscription_payments_vendor_idx on public.vendor_subscription_payments (vendor_id, created_at desc);

create trigger vendor_subscription_payments_set_updated_at before update on public.vendor_subscription_payments
  for each row execute function public.set_updated_at();

alter table public.vendor_subscription_payments enable row level security;
create policy "Vendors can read their own subscription payments" on public.vendor_subscription_payments
  for select to authenticated
  using (exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = (select auth.uid())));
create policy "Admins can read subscription payments" on public.vendor_subscription_payments
  for select to authenticated using ((select public.current_staff_role()) in ('admin', 'finance'));
grant select on public.vendor_subscription_payments to authenticated;

-- A vendor starts paying for a year. The amount is the yearly fee from settings, never sent by the browser.
create function public.start_vendor_subscription_payment(p_provider text, p_reference text)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vendors := public.vendor_require_own();
  v_fee numeric;
begin
  if v.status <> 'active' then
    raise exception 'Your store has to be approved before you can pay.' using errcode = '42501';
  end if;
  select st.vendor_annual_fee_ghs into v_fee from public.store_settings st;
  insert into public.vendor_subscription_payments (vendor_id, provider, provider_reference, amount_ghs)
  values (v.id, p_provider, p_reference, v_fee);
  return v_fee;
end;
$$;

revoke all on function public.start_vendor_subscription_payment(text, text) from public, anon;
grant execute on function public.start_vendor_subscription_payment(text, text) to authenticated;

-- Applies a verified provider result (server side only, like confirm_payment). Safe to call more than once.
-- Returns the date the subscription now runs to, or null if it did not open or renew the store.
create function public.confirm_subscription_payment(
  p_provider text, p_reference text, p_status text, p_amount_ghs numeric, p_event jsonb default null
)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.vendor_subscription_payments%rowtype;
  v_start date;
  v_end date;
begin
  if p_status not in ('succeeded', 'failed') then
    raise exception 'Unknown payment status %.', p_status using errcode = '22023';
  end if;
  select * into v_payment from public.vendor_subscription_payments p
  where p.provider = p_provider and p.provider_reference = p_reference for update;
  if not found then
    raise exception 'Unknown payment %.', p_reference using errcode = '22023';
  end if;
  if v_payment.status in ('succeeded', 'failed') then
    return null;
  end if;

  update public.vendor_subscription_payments p
  set status = p_status::public.payment_status, last_event = p_event where p.id = v_payment.id;
  if p_status = 'failed' then
    return null;
  end if;
  if p_amount_ghs is distinct from v_payment.amount_ghs then
    -- Money arrived but not the amount we asked for: leave it for the owner to sort out.
    perform public.audit('vendor.subscription_payment_mismatch', 'vendor', v_payment.vendor_id::text,
      jsonb_build_object('expected', v_payment.amount_ghs, 'received', p_amount_ghs, 'reference', p_reference));
    return null;
  end if;

  v_start := greatest(current_date, coalesce((select max(s.ends_on) + 1 from public.vendor_subscriptions s
                                              where s.vendor_id = v_payment.vendor_id), current_date));
  v_end := (v_start + interval '1 year')::date - 1;
  insert into public.vendor_subscriptions (vendor_id, starts_on, ends_on, amount_ghs, method, reference, note)
  values (v_payment.vendor_id, v_start, v_end, v_payment.amount_ghs, 'momo', p_reference, 'Paid online');
  perform public.queue_vendor_message(v_payment.vendor_id, 'vendor_subscription_paid',
    jsonb_build_object('ends_on', v_end, 'amount_ghs', v_payment.amount_ghs));
  perform public.audit('vendor.subscription_paid_online', 'vendor', v_payment.vendor_id::text,
    jsonb_build_object('ends_on', v_end, 'amount_ghs', v_payment.amount_ghs, 'reference', p_reference));
  return v_end;
end;
$$;

revoke all on function public.confirm_subscription_payment(text, text, text, numeric, jsonb) from public, anon, authenticated;
