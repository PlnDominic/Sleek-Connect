// The 18+ rule: the terms say you must be 18 or older to order, so every order carries the confirmation.
const { URL_, KEY, sql, createUser, staffSession, createClient } = require('./lib.cjs');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const anon = createClient(URL_, KEY, { auth: { persistSession: false } });
const stamp = Date.now();

const order = (client, customer) => client.rpc('place_order', {
  p_customer: { name: 'Esi Mensah', phone: '024 123 4567', area: 'Osu', ...customer },
  p_delivery_option: 'same_day',
  p_payment: { method: 'momo', network: 'mtn', wallet: '024 765 4321' },
  p_items: [{ slug: 'argan-hair-oil', quantity: 1 }],
  p_is_gift: false,
}).single();

(async () => {
  sql("update public.delivery_options set fee_ghs = 30 where id = 'same_day'");

  const none = await order(anon, {});
  assert(none.error?.message.includes('18 or older'), 'a guest who has not confirmed cannot order');
  assert((await order(anon, { adult_confirmed: false })).error?.message.includes('18 or older'), 'nor can one who says no');
  assert((await order(anon, { adult_confirmed: 'yes' })).error?.message.includes('18 or older'), 'only a real confirmation counts');
  const ok = await order(anon, { adult_confirmed: true });
  assert(!ok.error, 'a guest who confirms can order');
  assert(sql(`select adult_confirmed_at is not null from public.orders where order_number = '${ok.data.order_number}'`) === 't', 'and the moment is kept on the order');

  await createUser(`consented+${stamp}@example.com`);
  await createUser(`unconsented+${stamp}@example.com`);
  const consented = (await staffSession(`consented+${stamp}@example.com`)).client;
  const unconsented = (await staffSession(`unconsented+${stamp}@example.com`)).client;
  assert(!(await consented.rpc('record_signup_consent')).error, 'a shopper confirms when creating their account');
  const signedIn = await order(consented, {});
  assert(!signedIn.error, 'then orders without being asked again');
  assert(sql(`select adult_confirmed_at is not null from public.orders where order_number = '${signedIn.data.order_number}'`) === 't', 'with the moment kept on the order');
  assert((await order(unconsented, {})).error?.message.includes('18 or older'), 'an account that never confirmed is asked, like a guest');
  assert(!(await order(unconsented, { adult_confirmed: true })).error, 'and can order once it does');

  const { data: exported } = await consented.rpc('export_my_data');
  assert(exported.orders.length === 1 && exported.orders[0].adult_and_terms_confirmed_at, 'the confirmation is part of the shopper\'s data export');

  if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
  console.log('all age rule checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
