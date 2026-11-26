-- Keep the five-argument entry point for installed app versions. The checkout
-- overload prices and reserves the order, then applies the code in the same transaction.
create function public.place_order(
  p_customer jsonb, p_delivery_option text, p_payment jsonb, p_items jsonb,
  p_is_gift boolean, p_promo_code text
)
returns table (
  order_number text, order_token uuid, subtotal_ghs numeric, delivery_fee_ghs numeric,
  total_ghs numeric, reserved_until timestamptz, discount_ghs numeric, promo_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_promo record;
begin
  select * into strict v_order
  from public.place_order(p_customer, p_delivery_option, p_payment, p_items, p_is_gift);

  if nullif(btrim(p_promo_code), '') is null then
    return query select v_order.order_number, v_order.order_token, v_order.subtotal_ghs,
      v_order.delivery_fee_ghs, v_order.total_ghs, v_order.reserved_until, 0::numeric, null::text;
    return;
  end if;

  select * into strict v_promo
  from public.apply_order_promotion(v_order.order_token, p_promo_code);

  update public.notifications n
  set payload = n.payload || jsonb_build_object('total_ghs', v_promo.total_ghs)
  from public.orders o
  where o.public_token = v_order.order_token and n.order_id = o.id and n.template = 'order_received';

  return query select v_order.order_number, v_order.order_token, v_order.subtotal_ghs,
    v_promo.delivery_fee_ghs, v_promo.total_ghs, v_order.reserved_until, v_promo.discount_ghs, v_promo.promo_code;
end;
$$;

revoke all on function public.place_order(jsonb, text, jsonb, jsonb, boolean, text) from public;
grant execute on function public.place_order(jsonb, text, jsonb, jsonb, boolean, text) to anon, authenticated;
