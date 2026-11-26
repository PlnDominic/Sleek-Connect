-- Two fixes to apply_order_promotion.
--  * A promo code can be applied to an order only once. Before, it could be called again on the same unpaid order with a different
--    code (a free-delivery code, then a percentage code) and the discounts stacked; each call also used up one use of the code.
--  * Two bugs that made every promo code fail with an error: the category check read a column that does not exist (products.category;
--    it is category_id), and `select delivery_fee_ghs` was ambiguous with the function's own output column of the same name.
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
  -- One code per order. Without this, a free-delivery code and then a discount code (or the same code again) would stack, and every call used up a use of the code.
  if v_order.promo_code is not null then raise exception 'A promo code is already applied to this order.' using errcode = '22023'; end if;
  select * into v_promo from public.promotions where code = v_code and active and starts_at <= now() and (ends_at is null or ends_at > now()) for update;
  if not found then raise exception 'That promo code is invalid or has expired.' using errcode = '22023'; end if;
  if v_promo.max_uses is not null and v_promo.used_count >= v_promo.max_uses then raise exception 'That promo code has reached its usage limit.' using errcode = '22023'; end if;
  if v_order.subtotal_ghs < v_promo.minimum_spend_ghs then raise exception 'Spend at least GH₵ % to use this code.', to_char(v_promo.minimum_spend_ghs, 'FM999999990.00') using errcode = '22023'; end if;
  if v_promo.first_order_only and (v_order.user_id is null or exists(select 1 from public.orders o where o.user_id = v_order.user_id and o.status <> 'cancelled' and o.id <> v_order.id)) then raise exception 'This code is only available on a first order.' using errcode = '22023'; end if;
  if v_promo.allowed_slugs is not null and not exists(select 1 from public.order_items i join public.products p on p.id=i.product_id where i.order_id=v_order.id and p.slug = any(v_promo.allowed_slugs)) then raise exception 'This code does not apply to the items in your order.' using errcode = '22023'; end if;
  if v_promo.allowed_categories is not null and not exists(select 1 from public.order_items i join public.products p on p.id=i.product_id where i.order_id=v_order.id and p.category_id = any(v_promo.allowed_categories)) then raise exception 'This code does not apply to the items in your order.' using errcode = '22023'; end if;
  v_delivery := v_order.delivery_fee_ghs;
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
