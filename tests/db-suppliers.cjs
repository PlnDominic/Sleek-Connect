// Database checks for the supplier register: who may see and change it, tax and payment details only for finance/admin,
// receiving stock from a supplier (batch, cost, history), and deleting only suppliers with no deliveries.
const { URL_, KEY, sql, createUser, staffSession, createClient } = require('./lib.cjs');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const errOf = async (p) => (await p).error;
const anon = createClient(URL_, KEY, { auth: { persistSession: false } });
const stamp = Date.now();

(async () => {
  const people = {};
  for (const [k, role] of [['boss', 'admin'], ['fin', 'finance'], ['ops', 'operations'], ['cat', 'catalogue']]) {
    await createUser(`${k}+${stamp}@example.com`);
    sql(`insert into public.staff_members (email, role) values ('${k}+${stamp}@example.com', '${role}')`);
    people[k] = (await staffSession(`${k}+${stamp}@example.com`)).client;
  }
  await createUser(`shopper+${stamp}@example.com`);
  const shopper = (await staffSession(`shopper+${stamp}@example.com`)).client;
  const { boss, fin, ops, cat } = people;
  const supplier = { name: 'Accra Wholesale', contact_name: 'Kojo Mensah', phone: '0240000000', email: 'kojo@example.com', payment_terms: '14 days',
    business_type: 'company', legal_name: 'Accra Wholesale Ltd', tin: 'C0001234567', payout_network: 'mtn', payout_wallet: '0240000000', payout_name: 'Accra Wholesale' };

  // Who may use the register
  assert((await errOf(anon.rpc('admin_list_suppliers')))?.code !== undefined, 'guests cannot list suppliers');
  assert((await errOf(shopper.rpc('admin_list_suppliers')))?.code === '42501', 'shoppers cannot list suppliers');
  assert((await errOf(cat.rpc('admin_list_suppliers')))?.code === '42501', 'catalogue staff cannot list suppliers');
  assert((await errOf(shopper.rpc('admin_save_supplier', { p: supplier })))?.code === '42501', 'shoppers cannot add a supplier');

  // Adding, with checks
  assert((await errOf(boss.rpc('admin_save_supplier', { p: { ...supplier, name: 'A' } })))?.message.includes('name'), 'a supplier needs a real name');
  assert((await errOf(boss.rpc('admin_save_supplier', { p: { ...supplier, tin: '12' } })))?.message.includes('TIN'), 'a TIN is checked');
  assert((await errOf(boss.rpc('admin_save_supplier', { p: { ...supplier, payout_name: '' } })))?.message.includes('registered on that wallet'), 'a wallet needs the name on it');
  const added = await boss.rpc('admin_save_supplier', { p: supplier });
  assert(!added.error && added.data, 'an admin can add a supplier');
  const id = added.data;
  assert((await errOf(boss.rpc('admin_save_supplier', { p: { ...supplier, tin: 'C0009999999' } })))?.message.includes('already a supplier'), 'the same name cannot be added twice');

  // Tax and payment details: finance and admin only
  const finView = (await fin.rpc('admin_list_suppliers')).data.find((s) => s.id === id);
  assert(finView?.tin === 'C0001234567' && finView.payout_wallet === '0240000000', 'finance sees tax and payment details');
  const opsView = (await ops.rpc('admin_list_suppliers')).data.find((s) => s.id === id);
  assert(opsView && opsView.name === 'Accra Wholesale' && !('tin' in opsView) && !('payout_wallet' in opsView), 'operations sees the supplier but not tax or payment details');
  assert(!(await ops.rpc('admin_save_supplier', { p: { id, name: 'Accra Wholesale', phone: '0241111111', tin: 'HACKED12345' } })).error, 'operations can update contact details');
  const after = (await fin.rpc('admin_list_suppliers')).data.find((s) => s.id === id);
  assert(after.phone === '0241111111' && after.tin === 'C0001234567', 'and that leaves the tax number alone');

  // Receiving stock from a supplier
  const sku = sql(`select p.id || '|' || s.code from public.products p join public.product_sizes s on s.product_id = p.id where p.department <> 'beauty' and p.kids_filter is distinct from 'bath' limit 1`);
  const [productId, size] = sku.split('|');
  assert((await errOf(cat.rpc('admin_receive_stock_from', { p_product_id: productId, p_size_code: size, p_batch_code: 'T-1', p_expires_on: null, p_quantity: 5, p_supplier_id: id })))?.code === '42501', 'catalogue staff cannot receive stock');
  assert((await errOf(ops.rpc('admin_receive_stock_from', { p_product_id: productId, p_size_code: size, p_batch_code: 'T-1', p_expires_on: null, p_quantity: 5, p_supplier_id: '00000000-0000-0000-0000-000000000000' })))?.message.includes('Choose a supplier'), 'the supplier must exist');
  const before = Number(sql(`select coalesce(sum(on_hand), 0) from public.inventory_levels where product_id = '${productId}' and size_code = '${size}'`));
  const got = await ops.rpc('admin_receive_stock_from', { p_product_id: productId, p_size_code: size, p_batch_code: `T-${stamp}`, p_expires_on: null, p_quantity: 12, p_supplier_id: id, p_unit_cost: 7.5, p_reference: 'INV-100' });
  assert(!got.error && got.data, 'operations can receive stock from a supplier');
  assert(Number(sql(`select coalesce(sum(on_hand), 0) from public.inventory_levels where product_id = '${productId}' and size_code = '${size}'`)) === before + 12, 'the stock goes up');
  assert(sql(`select unit_cost_ghs::text || '/' || (supplier_id is not null)::text from public.stock_batches where id = '${got.data}'`) === '7.50/true', 'the batch keeps its cost and supplier');
  const history = (await fin.rpc('admin_supplier_history', { p_id: id })).data;
  assert(history.length === 1 && history[0].quantity === 12 && history[0].reference === 'INV-100' && Number(history[0].unit_cost_ghs) === 7.5, 'the delivery appears in the supplier history');
  const row = (await ops.rpc('admin_list_suppliers')).data.find((s) => s.id === id);
  assert(row.deliveries === 1 && row.units_received === 12 && Number(row.total_cost_ghs) === 90, 'the register totals what was delivered and what it cost');
  assert((await errOf(shopper.rpc('admin_supplier_history', { p_id: id })))?.code === '42501', 'shoppers cannot read supplier history');

  // Hiding and deleting
  assert(!(await ops.rpc('admin_set_supplier_active', { p_id: id, p_active: false })).error, 'a supplier can be hidden');
  assert(!(await ops.rpc('admin_supplier_options')).data.some((s) => s.id === id), 'a hidden supplier leaves the receiving menu');
  assert((await errOf(ops.rpc('admin_receive_stock_from', { p_product_id: productId, p_size_code: size, p_batch_code: 'T-2', p_expires_on: null, p_quantity: 1, p_supplier_id: id })))?.message.includes('Choose a supplier'), 'and cannot be chosen for new deliveries');
  assert((await errOf(fin.rpc('admin_delete_supplier', { p_id: id })))?.message !== undefined, 'a supplier with deliveries cannot be deleted');
  const spare = (await boss.rpc('admin_save_supplier', { p: { name: `Spare ${stamp}` } })).data;
  assert((await errOf(ops.rpc('admin_delete_supplier', { p_id: spare })))?.code === '42501', 'operations cannot delete suppliers');
  assert(!(await fin.rpc('admin_delete_supplier', { p_id: spare })).error, 'finance can delete a supplier with no deliveries');

  // Direct table access stays closed
  assert((await errOf(shopper.from('suppliers').select('id')))?.code === '42501', 'the supplier table is not readable directly');
  assert((await errOf(boss.from('suppliers').select('id')))?.code === '42501', 'not even by staff, who use the functions');

  // The seller side is switched off
  assert((await errOf(shopper.rpc('vendor_apply', {})))?.code !== undefined, 'seller sign-up is gone');

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll supplier checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
