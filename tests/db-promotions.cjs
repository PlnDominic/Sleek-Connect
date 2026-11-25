// Database checks for promo code management (Admin → Promotions): who may manage codes, validation, the audit log, and that a code the
// admin creates really works at checkout (once per order).
const { createUser, staffSession, sql, URL_, KEY, createClient } = require('./lib.cjs');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const errOf = async (p) => (await p).error;
const anon = createClient(URL_, KEY, { auth: { persistSession: false } });
const stamp = Date.now();

(async () => {
  const roles = {};
  for (const role of ['admin', 'finance', 'support']) {
    await createUser(`${role}+${stamp}@example.com`);
    sql(`insert into public.staff_members (email, role) values ('${role}+${stamp}@example.com', '${role}')`);
    roles[role] = (await staffSession(`${role}+${stamp}@example.com`)).client;
  }
  await createUser(`shopper+${stamp}@example.com`);
  const shopper = (await staffSession(`shopper+${stamp}@example.com`)).client;
  const code = `T${stamp}`.slice(0, 12).toUpperCase();

  assert((await errOf(anon.rpc('admin_list_promotions')))?.code !== undefined, 'guests cannot list promo codes');
  assert((await errOf(shopper.rpc('admin_list_promotions')))?.code === '42501', 'shoppers cannot list promo codes');
  assert((await errOf(roles.support.rpc('admin_list_promotions')))?.code === '42501', 'support staff cannot manage promo codes');
  assert((await anon.from('promotions').select('code')).error !== null, 'the promotions table is not readable directly');
  assert(!(await roles.finance.rpc('admin_list_promotions')).error, 'finance staff can list them');

  const base = { code, label: 'Ten percent for testing', kind: 'percent', value: 10, minimum_spend_ghs: 0, max_uses: 2 };
  for (const [bad, why] of [[{ code: 'a' }, 'code'], [{ kind: 'percent', value: 150 }, 'percentage'], [{ label: 'x' }, 'description'], [{ kind: 'nonsense' }, 'type'],
    [{ ends_at: '2000-01-01T00:00:00Z', starts_at: '2001-01-01T00:00:00Z' }, 'end date'], [{ allowed_slugs: ['no-such-product'] }, 'product addresses'], [{ allowed_categories: ['no-such-category'] }, 'categories']]) {
    assert((await errOf(roles.finance.rpc('admin_save_promotion', { p: { ...base, ...bad } })))?.code === '22023', `a bad ${why} is refused`);
  }
  assert((await errOf(roles.support.rpc('admin_save_promotion', { p: base })))?.code === '42501', 'support cannot create a code');
  const { data: id, error } = await roles.finance.rpc('admin_save_promotion', { p: { ...base, code: code.toLowerCase() } });
  assert(!error && id, 'finance can create a code (lower case is stored upper case)');
  assert((await errOf(roles.admin.rpc('admin_save_promotion', { p: base })))?.message.includes('already'), 'a code name can only be used once');
  let row = (await roles.admin.rpc('admin_list_promotions')).data.find((p) => p.code === code);
  assert(row && row.active === true && row.used_count === 0 && row.orders === 0, 'it appears in the list, switched on and unused');

  // At checkout
  sql("update public.delivery_options set fee_ghs = 30 where id in ('standard', 'same_day')");
  const place = () => anon.rpc('place_order', { p_customer: { adult_confirmed: true, name: 'Promo Admin Test', phone: '0241234567', area: 'Osu' }, p_delivery_option: 'standard',
    p_payment: { method: 'momo', network: 'mtn', wallet: '0241234567' }, p_items: [{ slug: 'argan-hair-oil', quantity: 1 }], p_is_gift: false });
  const order = (await place()).data?.[0];
  const applied = await anon.rpc('apply_order_promotion', { p_order_token: order.order_token, p_code: code });
  assert(!applied.error && Number(applied.data[0].discount_ghs) > 0, `the code works at checkout (${applied.error?.message ?? 'discount applied'})`);
  row = (await roles.admin.rpc('admin_list_promotions')).data.find((p) => p.code === code);
  assert(row.used_count === 1, 'the list shows it was used once');

  // Changing it
  assert((await errOf(roles.finance.rpc('admin_save_promotion', { p: { ...base, id, max_uses: 0 } })))?.code === '22023', 'the most uses has to be 1 or more');
  await roles.finance.rpc('admin_save_promotion', { p: { ...base, id, code: 'IGNORED', value: 20, max_uses: 5 } });
  row = (await roles.admin.rpc('admin_list_promotions')).data.find((p) => p.id === id);
  assert(row.code === code && Number(row.value) === 20 && row.max_uses === 5, 'a code can be edited but its name stays the same');
  assert((await errOf(roles.finance.rpc('admin_delete_promotion', { p_id: id })))?.message.includes('been used'), 'a code that has been used can\'t be deleted');

  await roles.finance.rpc('admin_set_promotion_active', { p_id: id, p_active: false });
  const order2 = (await place()).data?.[0];
  const off = await anon.rpc('apply_order_promotion', { p_order_token: order2.order_token, p_code: code });
  assert(off.error?.message.includes('invalid or has expired'), 'a switched-off code stops working');

  // The new checkout entry point must roll back even the last unit if the code is rejected.
  const guestPhone = '0245550123';
  const checkout = {
    p_customer: { adult_confirmed: true, name: 'Promo Checkout Test', phone: guestPhone, area: 'Osu', email: 'promo-checkout@example.com' },
    p_delivery_option: 'standard', p_payment: { method: 'momo', network: 'mtn', wallet: guestPhone },
    p_items: [{ slug: 'wooden-stacking-blocks', quantity: 1 }], p_is_gift: false,
  };
  const stockFilter = "product_id = (select id from public.products where slug = 'wooden-stacking-blocks') and size_code = ''";
  const previousStock = sql(`select on_hand from public.inventory_levels where ${stockFilter}`);
  sql(`update public.inventory_levels set on_hand = 1 where ${stockFilter}`);
  const rejected = await anon.rpc('place_order', { ...checkout, p_promo_code: code }).single();
  assert(rejected.error?.code === '22023', 'a rejected code returns the shopper-friendly error from checkout');
  assert(sql(`select count(*) from public.orders where phone = '${guestPhone}'`) === '0', 'the rejected checkout creates no order');
  assert(sql("select count(*) from public.notifications where recipient = 'promo-checkout@example.com'") === '0', 'the rejected checkout queues no order email');
  const retry = await anon.rpc('place_order', { ...checkout, p_promo_code: '' }).single();
  assert(!retry.error && retry.data?.discount_ghs === 0, 'the same shopper can buy the last unit immediately without the code');
  const cancelled = await anon.rpc('cancel_my_order', { p_order_token: retry.data.order_token });
  assert(!cancelled.error, 'the test releases its first reservation');

  await roles.finance.rpc('admin_set_promotion_active', { p_id: id, p_active: true });
  const discounted = await anon.rpc('place_order', { ...checkout, p_promo_code: code.toLowerCase() }).single();
  assert(!discounted.error && discounted.data?.discount_ghs > 0 && discounted.data?.promo_code === code, 'checkout returns the applied discount and code');
  const priced = discounted.data;
  assert(priced.total_ghs === priced.subtotal_ghs + priced.delivery_fee_ghs - priced.discount_ghs, 'the final charge matches the discounted total');
  assert(Number(sql(`select n.payload->>'total_ghs' from public.notifications n join public.orders o on o.id = n.order_id where o.order_number = '${priced.order_number}' and n.template = 'order_received'`)) === priced.total_ghs, 'the order email has the same discounted total');
  await anon.rpc('cancel_my_order', { p_order_token: priced.order_token });
  sql(`update public.inventory_levels set on_hand = ${Number(previousStock)} where ${stockFilter}`);

  // A code nobody used can be deleted
  const { data: spare } = await roles.finance.rpc('admin_save_promotion', { p: { ...base, code: `S${stamp}`.slice(0, 12).toUpperCase() } });
  assert(!(await roles.finance.rpc('admin_delete_promotion', { p_id: spare })).error, 'an unused code can be deleted');
  assert(sql(`select count(*) from public.audit_log where entity = 'promotion' and entity_id = '${id}'`) >= '3', 'creating, editing and switching off are in the audit log');

  console.log(failures ? `\n${failures} FAILED` : '\nAll promotion checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
