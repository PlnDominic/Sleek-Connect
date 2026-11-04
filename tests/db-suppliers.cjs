// Database checks for suppliers: vendors the owner creates and manages, with no sign-in. Covers the closed seller sign-up, who may manage
// suppliers, supplier products (priced, approved with a markup, on sale without a store fee), stock, and what is owed.
const { URL_, KEY, sql, createUser, staffSession, createClient } = require('./lib.cjs');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const errOf = async (p) => (await p).error;
const anon = createClient(URL_, KEY, { auth: { persistSession: false } });
const stamp = Date.now();
const checks = { photos_ok: true, description_ok: true, claims_ok: true, ingredients_ok: true, expiry_ok: 'na', authentic_ok: true, regulatory_ok: 'na', safety_ok: true };
const product = (extra = {}) => ({
  name: 'Shea Body Butter', brand: 'Ama Naturals', department: 'beauty', kind: 'jar', category_id: 'beauty-kits', price_ghs: 100, publish: true,
  sizes: [{ code: '200ml', label: '200 ml', price_ghs: 100, is_default: true }],
  description: 'Rich, unrefined shea butter.', ingredients: 'Shea butter', warnings: 'For external use only.',
  country_of_origin: 'Ghana', regulatory_reference: 'FDA/GH/2026/0001', ...extra,
});
const supplier = { name: 'Ama Naturals', tagline: 'Pure shea', contact_name: 'Ama Owusu', phone: '0241234567', email: 'ama@example.com',
  business_type: 'individual', legal_name: 'Ama Owusu', tin: 'GHA-123456789-0', payout_network: 'mtn', payout_wallet: '0241234567', payout_name: 'Ama Owusu' };

(async () => {
  const people = {};
  for (const [k, role] of [['boss', 'admin'], ['cat', 'catalogue'], ['sup', 'support']]) {
    await createUser(`${k}+${stamp}@example.com`);
    sql(`insert into public.staff_members (email, role) values ('${k}+${stamp}@example.com', '${role}')`);
    people[k] = (await staffSession(`${k}+${stamp}@example.com`)).client;
  }
  await createUser(`ama+${stamp}@example.com`);
  const shopper = (await staffSession(`ama+${stamp}@example.com`)).client;
  const { boss, cat, sup } = people;

  // Seller sign-up is closed by default
  const refused = await shopper.rpc('vendor_apply', { p_name: 'My Shop', p_owner_name: 'Ama Owusu', p_email: 'a@example.com', p_phone: '0241234567',
    p_id_type: 'ghana_card', p_id_number: 'GHA-123456789-0', p_id_path: 'x/y.png', p_tagline: null, p_accept_terms: true });
  assert(refused.error?.message.includes('not opening new seller accounts'), 'seller accounts are closed by default');
  assert((await errOf(shopper.rpc('admin_set_vendor_accounts_open', { p_open: true })))?.code === '42501', 'shoppers cannot open seller sign-up');

  // Who may manage suppliers
  assert((await errOf(anon.rpc('admin_create_supplier', { p: supplier })))?.code !== undefined, 'guests cannot add a supplier');
  assert((await errOf(shopper.rpc('admin_create_supplier', { p: supplier })))?.code === '42501', 'shoppers cannot add a supplier');
  assert((await errOf(cat.rpc('admin_create_supplier', { p: supplier })))?.code === '42501', 'catalogue staff cannot add a supplier (admins do)');
  assert((await errOf(boss.rpc('admin_create_supplier', { p: { ...supplier, name: 'A' } })))?.message.includes('name'), 'a supplier needs a real name');
  assert((await errOf(boss.rpc('admin_create_supplier', { p: { ...supplier, email: 'nope' } })))?.message.includes('email'), 'an email must look like one');
  assert((await errOf(boss.rpc('admin_create_supplier', { p: { ...supplier, payout_network: '' } })))?.message.includes('network'), 'a payout number needs its network');
  const { data: id, error } = await boss.rpc('admin_create_supplier', { p: supplier });
  assert(!error && id, 'an admin can add a supplier');
  assert(sql(`select (owner_id is null)::text || is_supplier::text || status from public.vendors where id = '${id}'`) === 'truetrueactive', 'a supplier has no owner (no sign-in), is a supplier and is active');
  assert((await boss.rpc('admin_create_supplier', { p: supplier })).data !== id, 'the same name again gets its own web address');
  const list = (await boss.rpc('admin_list_suppliers')).data;
  const mine = list.find((s) => s.id === id);
  assert(mine.contact_name === 'Ama Owusu' && mine.tin === 'GHA-123456789-0' && mine.payout_wallet === '0241234567' && mine.products === 0, 'the supplier record holds their contact, tax and payout details');
  assert((await errOf(sup.rpc('admin_list_suppliers')))?.code === '42501', 'support staff cannot list suppliers');
  assert((await anon.from('vendor_private').select('tin')).error !== null, 'a supplier\'s private details are not public');
  assert(!(await boss.rpc('admin_update_supplier', { p_vendor_id: id, p: { ...supplier, tagline: 'Shea from Tamale' } })).error, 'a supplier can be edited');

  // Products and stock
  assert((await errOf(sup.rpc('admin_save_supplier_product', { p_vendor_id: id, p: product() })))?.code === '42501', 'support staff cannot add supplier products');
  assert((await errOf(cat.rpc('admin_save_supplier_product', { p_vendor_id: '00000000-0000-0000-0000-000000000000', p: product() })))?.message.includes('doesn\'t exist'), 'products only go to a real supplier');
  const { data: saved, error: saveError } = await cat.rpc('admin_save_supplier_product', { p_vendor_id: id, p: product() });
  assert(!saveError && saved.id, 'catalogue staff can add a supplier product');
  assert(sql(`select review_status || vendor_price_ghs::text from public.products where id = '${saved.id}'`) === 'pending100.00', 'it waits for approval at the supplier\'s price');
  assert((await anon.from('products').select('id').eq('id', saved.id)).data.length === 0, 'an unapproved supplier product is not on sale');
  assert((await errOf(sup.rpc('admin_set_supplier_stock', { p_vendor_id: id, p_product_id: saved.id, p_size_code: '200ml', p_quantity: 5 })))?.code === '42501', 'support staff cannot set a supplier\'s stock');
  const ops = {};
  await createUser(`ops+${stamp}@example.com`);
  sql(`insert into public.staff_members (email, role) values ('ops+${stamp}@example.com', 'operations')`);
  ops.client = (await staffSession(`ops+${stamp}@example.com`)).client;
  assert(!(await ops.client.rpc('admin_set_supplier_stock', { p_vendor_id: id, p_product_id: saved.id, p_size_code: '200ml', p_quantity: 12 })).error, 'operations staff can set a supplier\'s stock');
  const rows = (await cat.rpc('admin_supplier_products', { p_vendor_id: id })).data;
  assert(rows.length === 1 && rows[0].sizes[0].stock === 12, 'the supplier\'s products list shows the stock');

  // Approval and sale: no store fee needed
  const { data: approved } = await boss.rpc('admin_review_product', { p_product_id: saved.id, p_decision: 'approved', p_markup_percent: 15, p_checks: checks });
  assert(Number(approved.price_ghs) === 115 && approved.is_published === true, 'approved with a markup, it goes on sale at the supplier\'s price plus the markup, with no store fee');
  const pub = (await anon.from('products').select('price_ghs').eq('id', saved.id)).data;
  assert(pub.length === 1 && Number(pub[0].price_ghs) === 115, 'shoppers see the marked-up price');
  assert((await anon.from('products').select('vendor_price_ghs').eq('id', saved.id)).error !== null, 'and never the supplier\'s price');

  // Editing and removing
  assert(!(await cat.rpc('admin_save_supplier_product', { p_vendor_id: id, p: product({ id: saved.id, price_ghs: 120, sizes: [{ code: '200ml', label: '200 ml', price_ghs: 120, is_default: true }] }) })).error, 'a supplier product can be edited');
  assert(sql(`select price_ghs::text from public.products where id = '${saved.id}'`) === '138.00', 'a price change keeps the approval and applies the markup');
  assert(!(await cat.rpc('admin_delete_supplier_product', { p_vendor_id: id, p_product_id: saved.id })).error, 'a product can be removed');

  // Sellers can still be switched on later
  assert(!(await boss.rpc('admin_set_vendor_accounts_open', { p_open: true })).error, 'an admin can allow seller accounts again');
  assert(sql('select vendor_accounts_open::text from public.store_settings') === 'true', 'the setting is saved');
  assert(sql(`select count(*) from public.audit_log where action in ('supplier.created', 'supplier.updated', 'settings.vendor_accounts_open')`) >= '4', 'supplier changes are in the audit log');

  console.log(failures ? `\n${failures} FAILED` : '\nAll supplier checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
