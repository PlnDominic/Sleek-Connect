-- Checkout enhancements for guest orders, promotions, and gift personalization.
alter table public.orders add column if not exists discount_ghs numeric(10,2) not null default 0 check (discount_ghs >= 0);
alter table public.orders add column if not exists promo_code text;
alter table public.orders add column if not exists gift_message text check (gift_message is null or length(gift_message) <= 500);

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code)),
  label text not null,
  kind text not null check (kind in ('percent','fixed','free_delivery')),
  value numeric(10,2) not null check (value >= 0),
  minimum_spend_ghs numeric(10,2) not null default 0 check (minimum_spend_ghs >= 0),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  max_uses integer check (max_uses is null or max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0),
  first_order_only boolean not null default false,
  allowed_slugs text[],
  allowed_categories text[],
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.promotions enable row level security;
revoke all on public.promotions from public, anon, authenticated;

create or replace function public.apply_order_promotion(p_order_token uuid, p_code text)
returns table(discount_ghs numeric, delivery_fee_ghs numeric, total_ghs numeric, promo_code text)
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders%rowtype;
  v_promo public.promotions%rowtype;
  v_discount numeric(10,2) := 0;
  v_delivery numeric(10,2);
  v_eligible boolean;
  v_code text := upper(btrim(coalesce(p_code, '')));
begin
  select * into v_order from public.orders where public.orders.public_token = p_order_token for update;
  if not found or v_order.status <> 'pending_payment' then raise exception 'This order is no longer eligible for a promotion.' using errcode = '22023'; end if;
  if v_code = '' then raise exception 'Enter a promo code.' using errcode = '22023'; end if;
  select * into v_promo from public.promotions where code = v_code and active and starts_at <= now() and (ends_at is null or ends_at > now()) for update;
  if not found then raise exception 'That promo code is invalid or has expired.' using errcode = '22023'; end if;
  if v_promo.max_uses is not null and v_promo.used_count >= v_promo.max_uses then raise exception 'That promo code has reached its usage limit.' using errcode = '22023'; end if;
  if v_order.subtotal_ghs < v_promo.minimum_spend_ghs then raise exception 'Spend at least GH₵ % to use this code.', to_char(v_promo.minimum_spend_ghs, 'FM999999990.00') using errcode = '22023'; end if;
  if v_promo.first_order_only and (v_order.user_id is null or exists(select 1 from public.orders o where o.user_id = v_order.user_id and o.status <> 'cancelled' and o.id <> v_order.id)) then raise exception 'This code is only available on a first order.' using errcode = '22023'; end if;
  if v_promo.allowed_slugs is not null and not exists(select 1 from public.order_items i join public.products p on p.id=i.product_id where i.order_id=v_order.id and p.slug = any(v_promo.allowed_slugs)) then raise exception 'This code does not apply to the items in your order.' using errcode = '22023'; end if;
  if v_promo.allowed_categories is not null and not exists(select 1 from public.order_items i join public.products p on p.id=i.product_id where i.order_id=v_order.id and p.category = any(v_promo.allowed_categories)) then raise exception 'This code does not apply to the items in your order.' using errcode = '22023'; end if;
  select delivery_fee_ghs into v_delivery from public.orders where id=v_order.id;
  if v_promo.kind = 'percent' then v_discount := round(v_order.subtotal_ghs * least(v_promo.value, 100) / 100, 2);
  elsif v_promo.kind = 'fixed' then v_discount := least(v_promo.value, v_order.subtotal_ghs);
  elsif v_promo.kind = 'free_delivery' then v_delivery := 0;
  end if;
  update public.orders set discount_ghs=v_discount, promo_code=v_code, delivery_fee_ghs=v_delivery, total_ghs=greatest(0, subtotal_ghs-v_discount+coalesce(v_delivery,0)) where id=v_order.id;
  update public.promotions set used_count=used_count+1 where id=v_promo.id;
  return query select v_discount, v_delivery, greatest(0, v_order.subtotal_ghs-v_discount+coalesce(v_delivery,0)), v_code;
end; $$;
revoke all on function public.apply_order_promotion(uuid,text) from public, authenticated, anon;
grant execute on function public.apply_order_promotion(uuid,text) to anon, authenticated;

create or replace function public.set_order_gift_details(p_order_token uuid, p_message text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.orders set gift_message=nullif(left(btrim(coalesce(p_message,'')),500),'') where public_token=p_order_token and status='pending_payment' and is_gift;
  if not found then raise exception 'Gift details could not be saved.' using errcode='22023'; end if;
end; $$;
revoke all on function public.set_order_gift_details(uuid,text) from public, authenticated, anon;
grant execute on function public.set_order_gift_details(uuid,text) to anon, authenticated;

insert into public.promotions(code,label,kind,value,minimum_spend_ghs,first_order_only)
values ('WELCOME10','10% off your first order','percent',10,0,true)
on conflict (code) do nothing;
insert into public.promotions(code,label,kind,value,minimum_spend_ghs)
values ('SAVE20','GH₵20 off orders over GH₵200','fixed',20,200)
on conflict (code) do nothing;
insert into public.promotions(code,label,kind,value)
values ('FREESHIP','Free delivery','free_delivery',0)
on conflict (code) do nothing;
