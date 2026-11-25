const assert = require('node:assert/strict');
const { admin, createClient, createUser, staffSession, sql, URL_, KEY } = require('./lib.cjs');

const anon = createClient(URL_, KEY, { auth: { persistSession: false } });
const url = 'https://checkout.example.test/recovery-session';

function dataOf(response) {
  assert.ifError(response.error);
  return response.data;
}

(async () => {
  sql("update public.delivery_options set fee_ghs = 30 where id = 'same_day'");
  sql("insert into public.promotions (code, label, kind, value) values ('RESUME10', 'Recovery test', 'fixed', 10) on conflict do nothing");
  const order = dataOf(await anon.rpc('place_order', {
    p_customer: { adult_confirmed: true, name: 'Recovery Test', area: 'Osu', phone: '0245550127' },
    p_delivery_option: 'same_day',
    p_payment: { method: 'card' },
    p_items: [{ slug: 'argan-hair-oil', quantity: 1 }],
    p_is_gift: false, p_promo_code: 'RESUME10',
  }).single());
  const args = { p_order_token: order.order_token };
  const detail = dataOf(await anon.rpc('get_order', args));
  assert.equal(detail.delivery_option, 'Same day');
  assert.equal(detail.delivery_option_id, 'same_day');
  assert.equal(detail.discount_ghs, 10);
  assert.equal(detail.promo_code, 'RESUME10');
  assert.deepEqual(detail.returns, []);

  const reference = `hosted-${order.order_number}`;
  const attempt = { ...args, p_provider: 'hubtel', p_reference: reference };
  dataOf(await admin.rpc('start_payment', attempt));
  dataOf(await admin.rpc('save_payment_checkout', { p_provider: 'hubtel', p_reference: reference, p_url: url }));
  assert.equal(dataOf(await admin.rpc('get_payment_checkout', args)), url);
  assert.equal(dataOf(await admin.rpc('get_payment_checkout', { p_order_token: '00000000-0000-4000-8000-000000000001' })), null);
  assert.ok((await admin.rpc('start_payment', { ...attempt, p_reference: reference + '-duplicate' })).error);
  assert.ok((await anon.rpc('get_payment_checkout', args)).error);
  assert.ok((await anon.from('payment_checkout_sessions').select('checkout_url')).error);
  assert.equal(JSON.stringify(dataOf(await anon.rpc('get_order', args))).includes(url), false);

  dataOf(await admin.rpc('confirm_payment', {
    p_provider: 'hubtel', p_reference: reference, p_status: 'succeeded', p_amount_ghs: order.total_ghs,
  }));
  assert.equal(dataOf(await admin.rpc('get_payment_checkout', args)), null);
  assert.equal(sql('select count(*) from public.payment_checkout_sessions'), '0');

  dataOf(await anon.rpc('cancel_my_order', args));
  const cancelled = dataOf(await anon.rpc('get_order', args));
  assert.equal(cancelled.refund_due, true);
  assert.equal(cancelled.refund_recorded_at, null);
  const email = `refund-${Date.now()}@example.com`;
  await createUser(email);
  sql(`insert into public.staff_members (email, role) values ('${email}', 'finance')`);
  const { client } = await staffSession(email);
  const id = sql(`select id from public.orders where order_number = '${order.order_number}'`);
  dataOf(await client.rpc('admin_resolve_order_flag', { p_order_id: id, p_flag: 'refund_due', p_note: 'Private settlement reference' }));
  const settled = dataOf(await anon.rpc('get_order', args));
  assert.equal(settled.refund_due, false);
  assert.ok(settled.refund_recorded_at);
  assert.equal(JSON.stringify(settled).includes('Private settlement reference'), false);

  console.log('Checkout recovery and shopper order details passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
