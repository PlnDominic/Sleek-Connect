// Limits on placing orders (place_order can be called by anyone holding the public key) and the minimum app version.
const { URL_, KEY, sql, createClient } = require('./lib.cjs');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const anon = createClient(URL_, KEY, { auth: { persistSession: false } });

const order = (phone, quantity = 1) =>
  anon.rpc('place_order', {
    p_customer: { adult_confirmed: true, name: 'Limit Test', phone, area: 'Osu' },
    p_delivery_option: 'standard',
    p_payment: { method: 'momo', network: 'mtn', wallet: '024 765 4321' },
    p_items: [{ slug: 'argan-hair-oil', quantity }],
    p_is_gift: false,
  }).single();
const setLimits = (open, hour, units) =>
  sql(`update public.store_settings set max_open_orders_per_phone = ${open}, max_orders_per_phone_per_hour = ${hour}, max_units_per_order = ${units}`);
const cancelAll = () => sql("update public.orders set status = 'cancelled' where status = 'pending_payment'");
const ordersFor = (digits) => Number(sql(`select count(*) from public.orders where right(regexp_replace(phone, '\\D', '', 'g'), 9) = '${digits}'`));

(async () => {
  // Open orders waiting for payment, counted by phone number however it is typed.
  setLimits(2, 1000, 1000);
  assert(!(await order('024 123 4567')).error, 'first order from a number is placed');
  assert(!(await order('+233241234567')).error, 'a second one, typed another way, is placed');
  const third = await order('0241234567');
  assert(third.error?.code === '22023' && /waiting for payment/.test(third.error.message), `a third open order from the same number is refused with a message the shopper can read (${third.error?.message})`);
  assert(ordersFor('241234567') === 2, 'and the refused order leaves nothing behind');
  assert(!(await order('020 111 2222')).error, 'another number is not affected');

  // Orders from one number in an hour, even when each earlier one was paid or cancelled.
  cancelAll();
  setLimits(1000, 3, 1000);
  for (let i = 0; i < 3; i++) { const r = await order('026 222 3333'); assert(!r.error, `order ${i + 1} of 3 allowed in the hour`); cancelAll(); }
  const fourth = await order('026 222 3333');
  assert(fourth.error?.code === '22023' && /too many orders/.test(fourth.error.message), `the fourth in the hour is refused (${fourth.error?.message})`);

  // Total units in one order.
  setLimits(1000, 1000, 3);
  assert(!(await order('055 000 1111', 3)).error, 'an order within the unit limit is placed');
  const big = await order('055 000 2222', 4);
  assert(big.error?.code === '22023' && /limit is 3 units/.test(big.error.message), `an order over the unit limit is refused (${big.error?.message})`);
  assert(ordersFor('550002222') === 0, 'with nothing left behind');

  // Minimum app version.
  const { data: before } = await anon.rpc('get_app_requirements').single();
  assert(before?.min_app_build === 0, 'by default every app build is allowed');
  sql('update public.store_settings set min_app_build = 7');
  const { data: after } = await anon.rpc('get_app_requirements').single();
  assert(after?.min_app_build === 7, 'the minimum build can be raised, and the app can read it without signing in');

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll order-limit checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
