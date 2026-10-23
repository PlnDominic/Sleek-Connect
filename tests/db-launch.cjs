// Launch acceptance checks for items 11–15. Runs against a fresh local Supabase database.
const { sql, admin, createClient } = require('./lib.cjs');
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
let failures = 0;
const assert = (condition, message) => {
  if (!condition) { failures++; console.error('FAIL:', message); }
  else console.log('ok -', message);
};
const errOf = async (promise) => (await promise).error;

(async () => {
  sql("update public.delivery_options set fee_ghs = 30 where id in ('standard', 'same_day')");

  // RLS and grants: secrets and operational tables are never public.
  assert((await errOf(anon.from('payments').select('id').limit(1))), 'anonymous clients cannot read payments');
  assert((await errOf(anon.from('notifications').select('id').limit(1))), 'anonymous clients cannot read notifications');
  assert((await errOf(anon.from('orders').select('delivery_code').limit(1))), 'anonymous clients cannot read delivery codes');
  assert((await errOf(anon.rpc('confirm_payment', { p_provider: 'test', p_reference: 'x', p_status: 'failed', p_amount_ghs: 0 }))), 'payment confirmation RPC is server-only');
  assert((await errOf(anon.rpc('claim_notifications', { p_limit: 1 }))), 'notification claiming RPC is server-only');

  // Delivery configuration fails closed in the database, not only in the checkout UI.
  sql("insert into public.delivery_zones (id, name, sort_order) values ('launch-test', 'Launch Test', 999)");
  sql("update public.delivery_areas set zone_id = 'launch-test' where name = 'Osu'");
  sql("insert into public.delivery_rates (zone_id, option_id, fee_ghs, is_available) values ('launch-test', 'same_day', 35, false)");
  const blocked = await anon.rpc('place_order', {
    p_customer: { name: 'Launch Test', phone: '0241234567', area: 'Osu' },
    p_delivery_option: 'same_day',
    p_payment: { method: 'momo', network: 'mtn', wallet: '0241234567' },
    p_items: [{ slug: 'argan-hair-oil', quantity: 1 }],
    p_is_gift: false,
  });
  assert(blocked.error?.code === '22023' && blocked.error.message.includes('not available'), 'disabled zone delivery option is rejected');
  sql("update public.delivery_areas set zone_id = null where name = 'Osu'");
  sql("delete from public.delivery_rates where zone_id = 'launch-test'");
  sql("delete from public.delivery_zones where id = 'launch-test'");

  // Checkout/payment idempotency: provider references are unique and final confirmations are repeat-safe.
  const placed = await anon.rpc('place_order', {
    p_customer: { name: 'Launch Test', phone: '0241234567', area: 'Osu' },
    p_delivery_option: 'standard',
    p_payment: { method: 'momo', network: 'mtn', wallet: '0241234567' },
    p_items: [{ slug: 'argan-hair-oil', quantity: 1 }],
    p_is_gift: false,
  });
  assert(!placed.error && placed.data?.[0]?.order_token, 'checkout creates a priced, reserved order');
  const order = placed.data[0];
  const reference = `LAUNCH-${order.order_number}`;
  const started = await admin.rpc('start_payment', { p_order_token: order.order_token, p_provider: 'test', p_reference: reference });
  assert(!started.error, 'a payment attempt can be started for the reserved order');
  const duplicate = await admin.rpc('start_payment', { p_order_token: order.order_token, p_provider: 'test', p_reference: reference });
  assert(duplicate.error, 'duplicate provider payment references are rejected');
  const first = await admin.rpc('confirm_payment', { p_provider: 'test', p_reference: reference, p_status: 'succeeded', p_amount_ghs: order.total_ghs });
  const second = await admin.rpc('confirm_payment', { p_provider: 'test', p_reference: reference, p_status: 'succeeded', p_amount_ghs: order.total_ghs });
  assert(!first.error && !second.error && second.data?.[0]?.payment_status === 'succeeded', 'replayed final payment confirmation is harmless');

  console.log(failures ? `\\n${failures} FAILED` : '\\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
