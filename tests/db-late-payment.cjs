// A payment that arrives after the reservation timer cancelled the order puts the order back to paid.
const { KEY, URL_, sql, admin, createClient } = require('./lib.cjs');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const anon = createClient(URL_, KEY, { auth: { persistSession: false } });

(async () => {
  sql("update public.delivery_options set fee_ghs = 30 where id = 'same_day'");
  const { data, error } = await anon.rpc('place_order', {
    p_customer: { adult_confirmed: true, name: 'Ama Owusu', phone: '024 123 4567', area: 'Osu' },
    p_delivery_option: 'same_day',
    p_payment: { method: 'momo', network: 'mtn', wallet: '024 765 4321' },
    p_items: [{ slug: 'wooden-stacking-blocks', quantity: 1 }], p_is_gift: false,
  }).single();
  if (error) throw error;
  const ref = `T-${data.order_number}`;
  const st = (await admin.rpc('start_payment', { p_order_token: data.order_token, p_provider: 'test', p_reference: ref })).error;
  if (st) throw st;
  const oid = sql(`select id from public.orders where order_number = '${data.order_number}'`);
  const onHand = () => sql("select on_hand from public.inventory_levels i join public.products p on p.id = i.product_id where p.slug = 'wooden-stacking-blocks' limit 1");
  const before = Number(onHand());
  // The timer cancels it (payment attempt older than the 45 minute grace).
  sql(`update public.payments set created_at = now() - interval '2 hours' where order_id = '${oid}'`);
  sql(`update public.orders set reservation_expires_at = now() - interval '1 hour' where id = '${oid}'`);
  sql('select public.expire_unpaid_orders()');
  assert(sql(`select status from public.orders where id = '${oid}'`) === 'cancelled', 'timer cancelled the order');
  const e = (await admin.rpc('confirm_payment', { p_provider: 'test', p_reference: ref, p_status: 'succeeded', p_amount_ghs: data.total_ghs })).error;
  assert(!e, 'late payment accepted');
  assert(sql(`select status from public.orders where id = '${oid}'`) === 'paid', 'late payment reinstates the order as paid');
  assert(sql(`select cancel_reason is null and paid_at is not null from public.orders where id = '${oid}'`) === 't', 'cancel reason cleared, paid_at set');
  assert(Number(onHand()) === before - 1, 'stock taken once');

  // A first attempt reported failed, then the shopper retried and paid: the order comes back too.
  const second = (await anon.rpc('place_order', {
    p_customer: { adult_confirmed: true, name: 'Ama Owusu', phone: '024 123 4567', area: 'Osu' },
    p_delivery_option: 'same_day',
    p_payment: { method: 'momo', network: 'mtn', wallet: '024 765 4321' },
    p_items: [{ slug: 'wooden-stacking-blocks', quantity: 1 }], p_is_gift: false,
  }).single()).data;
  const ref2 = `T-${second.order_number}`;
  await admin.rpc('start_payment', { p_order_token: second.order_token, p_provider: 'test', p_reference: ref2 });
  await admin.rpc('confirm_payment', { p_provider: 'test', p_reference: ref2, p_status: 'failed', p_amount_ghs: 0 });
  const oid2 = sql(`select id from public.orders where order_number = '${second.order_number}'`);
  assert(sql(`select status from public.orders where id = '${oid2}'`) === 'cancelled', 'failed answer cancels the order');
  await admin.rpc('confirm_payment', { p_provider: 'test', p_reference: ref2, p_status: 'failed', p_amount_ghs: 0 });
  assert(sql(`select status from public.orders where id = '${oid2}'`) === 'cancelled', 'repeated failed answer changes nothing');
  await admin.rpc('confirm_payment', { p_provider: 'test', p_reference: ref2, p_status: 'succeeded', p_amount_ghs: second.total_ghs });
  assert(sql(`select status from public.orders where id = '${oid2}'`) === 'paid', 'payment after a failed answer reinstates the order');
  assert(sql(`select status from public.payments where provider_reference = '${ref2}'`) === 'succeeded', 'payment recorded as succeeded');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
