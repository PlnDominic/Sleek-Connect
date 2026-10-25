// Database checks: vendor applications, yearly subscriptions, the owner's product review and markup, public visibility,
// the vendor-order gate and the vendor's own data export and deletion.
const { URL_, KEY, sql, admin, createUser, staffSession, createClient } = require('./lib.cjs');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const errOf = async (p) => { const r = await p; return r.error; };
const anon = createClient(URL_, KEY, { auth: { persistSession: false } });
const stamp = Date.now();

const product = (extra = {}) => ({
  name: 'Shea Body Butter', brand: 'Ama Naturals', department: 'beauty', kind: 'jar', category_id: 'beauty-kits',
  price_ghs: 100, publish: true,
  sizes: [{ code: '200ml', label: '200 ml', price_ghs: 100, is_default: true }, { code: '400ml', label: '400 ml', price_ghs: 180 }],
  description: 'Rich, unrefined shea butter.', ingredients: 'Shea butter', warnings: 'For external use only.',
  country_of_origin: 'Ghana', regulatory_reference: 'FDA/GH/2026/0001', ...extra,
});

(async () => {
  await createUser(`boss+${stamp}@example.com`);
  sql(`insert into public.staff_members (email, role) values ('boss+${stamp}@example.com', 'admin')`);
  const boss = (await staffSession(`boss+${stamp}@example.com`)).client;
  await createUser(`sup+${stamp}@example.com`);
  sql(`insert into public.staff_members (email, role) values ('sup+${stamp}@example.com', 'support')`);
  const support = (await staffSession(`sup+${stamp}@example.com`)).client;
  const people = {};
  for (const k of ['ama', 'kofi']) {
    await createUser(`${k}+${stamp}@example.com`);
    people[k] = (await staffSession(`${k}+${stamp}@example.com`)).client;
  }
  const { ama, kofi } = people;

  // --- Applying ----------------------------------------------------------------------------------
  assert((await errOf(anon.rpc('vendor_apply', { p_name: 'Ama Beauty', p_phone: '0241234567', p_accept_terms: true })))?.code !== undefined, 'guests cannot apply');
  assert((await errOf(ama.rpc('vendor_apply', { p_name: 'A', p_phone: '0241234567', p_accept_terms: true })))?.message.includes('store name'), 'a store needs a real name');
  assert((await errOf(ama.rpc('vendor_apply', { p_name: 'Ama Beauty', p_phone: '12', p_accept_terms: true })))?.message.includes('phone'), 'a store needs a phone number');
  assert((await errOf(ama.rpc('vendor_apply', { p_name: 'Ama Beauty', p_phone: '0241234567', p_accept_terms: false })))?.message.includes('terms'), 'the vendor terms must be accepted');
  assert((await errOf(boss.rpc('vendor_apply', { p_name: 'Boss Store', p_phone: '0241234567', p_accept_terms: true })))?.message.includes('Staff'), 'staff accounts cannot open a store');
  const { data: vendorId, error: applyError } = await ama.rpc('vendor_apply', { p_name: "Ama's Beauty Hub", p_phone: '0241234567', p_tagline: 'Glow every day', p_accept_terms: true });
  assert(!applyError && vendorId, 'a signed-in shopper can apply');
  assert((await errOf(ama.rpc('vendor_apply', { p_name: 'Second', p_phone: '0241234567', p_accept_terms: true })))?.message.includes('already'), 'one store per account');
  let me = (await ama.rpc('vendor_me')).data;
  assert(me.status === 'pending' && me.slug === 'amas-beauty-hub' && me.live === false, 'the application starts pending, with a web address made from the name');
  assert((await kofi.rpc('vendor_me')).data === null, 'someone who has not applied has no store');

  // --- Nothing works before approval and payment -------------------------------------------------
  assert((await errOf(ama.rpc('vendor_save_product', { p: product() })))?.message.includes('not approved'), 'a pending store cannot add products');
  assert((await errOf(kofi.rpc('admin_vendors')))?.code === '42501', 'shoppers cannot list vendors');
  assert((await errOf(support.rpc('admin_review_vendor', { p_vendor_id: vendorId, p_decision: 'active' })))?.code === '42501', 'only an admin approves vendors');
  const { data: queue } = await boss.rpc('admin_vendors');
  assert(queue.length === 1 && queue[0].status === 'pending' && queue[0].phone === '0241234567', 'the owner sees the application with contact details');
  await boss.rpc('admin_review_vendor', { p_vendor_id: vendorId, p_decision: 'active', p_note: 'Welcome' });
  me = (await ama.rpc('vendor_me')).data;
  assert(me.status === 'active' && me.live === false && me.annual_fee_ghs > 0, 'approved but unpaid: not live, with the yearly fee shown');
  assert((await errOf(ama.rpc('vendor_save_product', { p: product() })))?.message.includes('subscription'), 'an unpaid store cannot add products');
  assert((await anon.from('vendors').select('slug')).data.every((v) => v.slug !== 'amas-beauty-hub'), 'an unpaid store is not public');

  // --- Subscription ------------------------------------------------------------------------------
  assert((await errOf(ama.rpc('admin_record_subscription', { p_vendor_id: vendorId, p_amount_ghs: 300 })))?.code === '42501', 'vendors cannot record their own payment');
  const { data: ends } = await boss.rpc('admin_record_subscription', { p_vendor_id: vendorId, p_amount_ghs: 300, p_method: 'momo', p_reference: 'MM123' });
  const year = new Date(ends).getTime() - Date.now();
  assert(year > 360 * 864e5 && year < 367 * 864e5, 'a payment buys one year');
  const { data: renewed } = await boss.rpc('admin_record_subscription', { p_vendor_id: vendorId, p_amount_ghs: 300, p_method: 'momo', p_reference: 'MM124' });
  assert(new Date(renewed).getTime() - new Date(ends).getTime() > 360 * 864e5, 'a renewal starts after the current year ends');
  assert((await ama.rpc('vendor_me')).data.live === true, 'a paid, approved store is live');
  assert((await anon.from('vendors').select('slug, name').eq('slug', 'amas-beauty-hub')).data.length === 1, 'a live store is public');
  assert((await anon.from('vendors').select('owner_id')).error !== null, 'who runs a store is never public');
  assert((await kofi.from('vendor_subscriptions').select('id')).data.length === 0, 'subscriptions are private');

  // --- Products, review and markup ---------------------------------------------------------------
  const { data: saved, error: saveError } = await ama.rpc('vendor_save_product', { p: product() });
  assert(!saveError && saved.slug.startsWith('amas-beauty-hub-') && saved.problems.length === 0, 'a live vendor can add a product');
  const productId = saved.id;
  assert((await anon.from('products').select('id').eq('id', productId)).data.length === 0, 'an unreviewed product is not on sale');
  assert((await errOf(kofi.rpc('vendor_save_product', { p: product({ id: productId }) })))?.code === '42501', 'nobody can edit another store\'s product');
  assert((await errOf(ama.rpc('vendor_set_stock', { p_product_id: productId, p_size_code: '200ml', p_quantity: -1 })))?.message.includes('stock'), 'stock cannot be negative');
  await ama.rpc('vendor_set_stock', { p_product_id: productId, p_size_code: '200ml', p_quantity: 10 });
  const mine = (await ama.rpc('vendor_my_products')).data;
  assert(mine.length === 1 && mine[0].review_status === 'pending' && mine[0].sizes.find((s) => s.code === '200ml').stock === 10, 'the vendor sees their product, its review state and stock');
  assert(mine[0].markup_percent === null && mine[0].shopper_price_ghs === null, 'the vendor does not see the markup before it is set');

  const { data: pending } = await boss.rpc('admin_vendor_products', { p_status: 'pending' });
  assert(pending.length === 1 && pending[0].vendor_price_ghs === 100, 'the owner sees it in the review queue');
  assert((await errOf(ama.rpc('admin_review_product', { p_product_id: productId, p_decision: 'approved', p_markup_percent: 15 })))?.code === '42501', 'vendors cannot approve their own products');
  assert((await errOf(boss.rpc('admin_review_product', { p_product_id: productId, p_decision: 'approved', p_markup_percent: 500 })))?.message.includes('markup'), 'the markup is capped');
  const { data: approved } = await boss.rpc('admin_review_product', { p_product_id: productId, p_decision: 'approved', p_markup_percent: 15 });
  assert(Number(approved.price_ghs) === 115 && approved.is_published === true, 'the shopper price is the vendor price plus the markup, and it goes on sale');
  const pub = (await anon.from('products').select('price_ghs').eq('id', productId)).data;
  assert(pub.length === 1 && Number(pub[0].price_ghs) === 115, 'the public sees the marked-up price');
  const sizes = (await anon.from('product_sizes').select('code, price_ghs').eq('product_id', productId)).data;
  assert(Number(sizes.find((s) => s.code === '400ml').price_ghs) === 207, 'size prices carry the markup too');

  // Editing prices keeps approval; changing what the product is sends it back to the owner.
  await ama.rpc('vendor_save_product', { p: product({ id: productId, price_ghs: 120, sizes: [{ code: '200ml', label: '200 ml', price_ghs: 120, is_default: true }, { code: '400ml', label: '400 ml', price_ghs: 180 }] }) });
  let row = sql(`select review_status || '|' || price_ghs || '|' || is_published from public.products where id = '${productId}'`);
  assert(row === 'approved|138.00|t', 'a price change keeps the approval and applies the markup');
  await ama.rpc('vendor_save_product', { p: product({ id: productId, name: 'Shea Body Butter Deluxe' }) });
  row = sql(`select review_status || '|' || is_published from public.products where id = '${productId}'`);
  assert(row === 'pending|f', 'renaming the product sends it back for review and takes it off sale');
  await boss.rpc('admin_review_product', { p_product_id: productId, p_decision: 'approved', p_markup_percent: 20 });

  // --- Orders from vendor stores stay closed until the owner opens them -------------------------
  sql("update public.delivery_options set fee_ghs = 20 where id = 'standard'");
  const line = [{ slug: saved.slug, size: '200ml', quantity: 2 }];
  const order = () => anon.rpc('place_order', {
    p_customer: { name: 'Kofi Mensah', phone: '024 123 4567', area: 'Osu' },
    p_delivery_option: 'standard', p_payment: { method: 'momo', network: 'mtn', wallet: '024 765 4321' },
    p_items: line, p_is_gift: false,
  }).single();
  assert((await order()).error?.message.includes('opens soon'), 'vendor products cannot be ordered while the marketplace is closed');
  assert((await errOf(support.rpc('admin_set_marketplace_settings', { p: { marketplace_orders_open: true } })))?.code === '42501', 'only an admin changes marketplace settings');
  await boss.rpc('admin_set_marketplace_settings', { p: { marketplace_orders_open: true } });
  const placed = await order();
  assert(!placed.error, 'once open, vendor products can be ordered');
  const split = sql("select unit_price_ghs || '|' || vendor_unit_price_ghs || '|' || markup_unit_ghs from public.order_items order by id desc limit 1");
  assert(split === '144.00|120.00|24.00', 'the order line records what the vendor is owed and the owner\'s markup');
  await boss.rpc('admin_set_marketplace_settings', { p: { marketplace_orders_open: false } });

  // --- Subscription ends -------------------------------------------------------------------------
  sql(`update public.vendor_subscriptions set starts_on = current_date - 800, ends_on = current_date - 400 where vendor_id = '${vendorId}'`);
  sql('select public.refresh_vendor_products(null)');
  assert((await anon.from('products').select('id').eq('id', productId)).data.length === 0, 'when the subscription runs out the products come off sale');
  assert((await anon.from('vendors').select('slug').eq('slug', 'amas-beauty-hub')).data.length === 0, 'and the storefront closes');
  assert((await errOf(ama.rpc('vendor_save_product', { p: product({ id: productId }) })))?.message.includes('subscription'), 'the vendor must renew to edit');
  await boss.rpc('admin_record_subscription', { p_vendor_id: vendorId, p_amount_ghs: 300, p_method: 'momo' });
  assert((await anon.from('products').select('id').eq('id', productId)).data.length === 1, 'renewing puts the products back on sale');

  // --- The shop's own range is untouched ---------------------------------------------------------
  const house = sql("select count(*) from public.products p join public.vendors v on v.id = p.vendor_id where v.is_house and p.is_published");
  assert(Number(house) > 0, 'the house range is still published');

  // --- Data rights -------------------------------------------------------------------------------
  const exported = (await ama.rpc('export_my_data')).data;
  assert((await ama.rpc('account_deletion_blocker')).data.includes('order'), 'a store with an order in progress cannot be deleted yet');
  sql("update public.orders set status = 'cancelled' where status = 'pending_payment'");
  assert(exported.vendor_store?.phone === '0241234567' && exported.vendor_store.products.length === 1, 'the data export includes the vendor store');
  await ama.rpc('delete_my_account');
  const closed = sql(`select status || '|' || coalesce(owner_id::text, 'none') from public.vendors where id = '${vendorId}'`);
  assert(closed === 'suspended|none', 'deleting the account closes the store');
  assert(sql(`select count(*) from public.vendor_private where vendor_id = '${vendorId}'`) === '0', 'and removes the contact details');
  assert((await anon.from('products').select('id').eq('id', productId)).data.length === 0, 'and its products come off sale');

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll marketplace database checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
