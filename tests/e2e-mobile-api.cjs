// The website endpoint the mobile app uses to send the Mobile Money prompt for an order it has placed with place_order.
const { sql, admin, createClient, URL_, KEY } = require('./lib.cjs');
const BASE = 'http://localhost:3000';
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const anon = createClient(URL_, KEY, { auth: { persistSession: false } });
const start = (body) => fetch(`${BASE}/api/payments/start`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

(async () => {
  sql("update public.delivery_options set fee_ghs = 20 where id = 'standard'");
  const { data: order, error } = await anon.rpc('place_order', {
    p_customer: { name: 'Kofi Mensah', phone: '024 123 4567', area: 'East Legon' },
    p_delivery_option: 'standard', p_payment: { method: 'momo', network: 'mtn', wallet: '024 765 4321' },
    p_items: [{ slug: 'argan-hair-oil', quantity: 1 }], p_is_gift: false,
  }).single();
  assert(!error && order.order_token, 'the app places an order straight from the phone');

  let r = await start({ orderToken: 'nope', network: 'mtn', wallet: '0247654321' });
  assert(r.status === 400 && (await r.json()).kind === 'failed', 'a malformed order token is refused');
  r = await start({ orderToken: order.order_token, network: 'visa', wallet: '0247654321' });
  assert(r.status === 400, 'only Mobile Money networks are accepted');
  r = await start({ orderToken: order.order_token, network: 'mtn', wallet: '12' });
  assert(r.status === 400, 'and a real wallet number');
  r = await start({ orderToken: '00000000-0000-4000-8000-000000000001', network: 'mtn', wallet: '0247654321' });
  assert(r.status === 409, 'an order that does not exist is refused');

  r = await start({ orderToken: order.order_token, network: 'mtn', wallet: '0247654321' });
  const body = await r.json();
  assert(r.ok && body.kind === 'requested' && body.testMode === true, 'an unpaid order gets a payment prompt (test mode here)');
  const amount = sql(`select p.amount_ghs from public.payments p join public.orders o on o.id = p.order_id where o.order_number = '${order.order_number}' order by p.created_at desc limit 1`);
  assert(Number(amount) === Number(order.total_ghs), 'for the amount the database priced, never one sent by the phone');

  const ref = sql(`select p.provider_reference from public.payments p join public.orders o on o.id = p.order_id where o.order_number = '${order.order_number}' order by p.created_at desc limit 1`);
  await admin.rpc('confirm_payment', { p_provider: 'test', p_reference: ref, p_status: 'succeeded', p_amount_ghs: order.total_ghs });
  r = await start({ orderToken: order.order_token, network: 'mtn', wallet: '0247654321' });
  assert(r.status === 409, 'a paid order does not get another prompt');

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll mobile payment endpoint checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
