// Database checks for purchasing and profit: purchase orders (draft, place, receive in parts, cancel), what receiving does to stock and cost,
// stock counts, money owed to suppliers, the profit report, and who may do what.
const { URL_, KEY, sql, createUser, staffSession, createClient } = require('./lib.cjs');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const errOf = async (p) => (await p).error;
const anon = createClient(URL_, KEY, { auth: { persistSession: false } });
const stamp = Date.now();

(async () => {
  const people = {};
  for (const [k, role] of [['boss', 'admin'], ['ops', 'operations'], ['fin', 'finance'], ['cat', 'catalogue']]) {
    await createUser(`${k}+${stamp}@example.com`);
    sql(`insert into public.staff_members (email, role) values ('${k}+${stamp}@example.com', '${role}')`);
    people[k] = (await staffSession(`${k}+${stamp}@example.com`)).client;
  }
  const { boss, ops, fin, cat } = people;
  const sku = sql(`select p.id || '|' || s.code from public.products p join public.product_sizes s on s.product_id = p.id
                   where p.department <> 'beauty' and p.kids_filter is distinct from 'bath' limit 1`);
  const [productId, size] = sku.split('|');
  const supplier = (await boss.rpc('admin_save_supplier', { p: { name: `PO Supplier ${stamp}` } })).data;
  const line = (qty, cost) => ({ product_id: productId, size_code: size, quantity: qty, unit_cost_ghs: cost });

  // Who may do what
  assert((await errOf(anon.rpc('admin_list_purchase_orders')))?.code !== undefined, 'guests cannot see purchase orders');
  assert((await errOf(cat.rpc('admin_list_purchase_orders')))?.code === '42501', 'catalogue staff cannot see them');
  assert((await errOf(fin.rpc('admin_save_purchase_order', { p: { supplier_id: supplier, lines: [line(5, 10)] } })))?.code === '42501', 'finance can look but not create orders');

  // Draft, validation, place
  assert((await errOf(ops.rpc('admin_save_purchase_order', { p: { supplier_id: supplier, lines: [] } })))?.message.includes('at least one'), 'an order needs a product');
  assert((await errOf(ops.rpc('admin_save_purchase_order', { p: { supplier_id: supplier, lines: [line(0, 10)] } })))?.message.includes('quantity'), 'and a real quantity');
  const created = await ops.rpc('admin_save_purchase_order', { p: { supplier_id: supplier, expected_on: '2026-12-31', lines: [line(10, 12.5)] } });
  assert(!created.error && created.data, 'operations can create a draft order');
  const po = created.data;
  const got = (await fin.rpc('admin_get_purchase_order', { p_id: po })).data;
  assert(got.number.startsWith('PO-') && got.status === 'draft' && got.lines.length === 1, 'finance can read it: numbered, draft, one line');
  assert((await errOf(ops.rpc('admin_receive_purchase_order', { p_id: po, p_lines: [{ line_id: got.lines[0].id, quantity: 1, batch_code: 'X' }] })))?.message.includes('placed order'), 'stock cannot be received on a draft');
  assert(!(await ops.rpc('admin_save_purchase_order', { p: { id: po, supplier_id: supplier, lines: [line(10, 12.5), line(3, 20)] } })).error, 'a draft can be edited');
  assert(!(await ops.rpc('admin_place_purchase_order', { p_id: po })).error, 'and placed');
  assert((await errOf(ops.rpc('admin_save_purchase_order', { p: { id: po, supplier_id: supplier, lines: [line(1, 1)] } })))?.message.includes('draft'), 'a placed order can no longer be edited');

  // Receiving in parts
  const lines = (await ops.rpc('admin_get_purchase_order', { p_id: po })).data.lines;
  const first = lines.find((l) => l.quantity_ordered === 10);
  const before = Number(sql(`select coalesce(sum(on_hand), 0) from public.inventory_levels where product_id = '${productId}' and size_code = '${size}'`));
  const r1 = await ops.rpc('admin_receive_purchase_order', { p_id: po, p_lines: [{ line_id: first.id, quantity: 6, batch_code: `PO${stamp}A` }] });
  assert(!r1.error && r1.data.status === 'part_received' && r1.data.units === 6, 'receiving part of an order leaves it part received');
  assert(Number(sql(`select coalesce(sum(on_hand), 0) from public.inventory_levels where product_id = '${productId}' and size_code = '${size}'`)) === before + 6, 'the stock goes up');
  assert(sql(`select unit_cost_ghs::text || '/' || (supplier_id is not null)::text from public.stock_batches where batch_code = 'PO${stamp}A'`) === '12.50/true', 'the batch keeps the cost and the supplier');
  assert((await errOf(ops.rpc('admin_receive_purchase_order', { p_id: po, p_lines: [{ line_id: first.id, quantity: 5, batch_code: 'B' }] })))?.message.includes('up to 4 more'), 'more than is still to come is refused');
  assert((await errOf(ops.rpc('admin_cancel_purchase_order', { p_id: po })))?.message.includes('already received'), 'an order with stock received cannot be cancelled');
  const other = lines.find((l) => l.quantity_ordered === 3);
  const r2 = await ops.rpc('admin_receive_purchase_order', { p_id: po, p_lines: [{ line_id: first.id, quantity: 4, batch_code: `PO${stamp}B` }, { line_id: other.id, quantity: 3, batch_code: `PO${stamp}C` }] });
  assert(!r2.error && r2.data.status === 'received', 'receiving the rest completes it');
  assert(Number(sql(`select count(*) from public.stock_receipts where reference = '${got.number}' and supplier_id is not null`)) === 3, 'every delivery is on the supplier history, referenced by the order number');

  // A second order: cancel, and complete a short one
  const po2 = (await ops.rpc('admin_save_purchase_order', { p: { supplier_id: supplier, lines: [line(5, 10)] } })).data;
  await ops.rpc('admin_place_purchase_order', { p_id: po2 });
  assert(!(await ops.rpc('admin_cancel_purchase_order', { p_id: po2 })).error, 'an untouched order can be cancelled');
  const po3 = (await ops.rpc('admin_save_purchase_order', { p: { supplier_id: supplier, lines: [line(5, 10)] } })).data;
  await ops.rpc('admin_place_purchase_order', { p_id: po3 });
  const l3 = (await ops.rpc('admin_get_purchase_order', { p_id: po3 })).data.lines[0];
  await ops.rpc('admin_receive_purchase_order', { p_id: po3, p_lines: [{ line_id: l3.id, quantity: 2, batch_code: `PO${stamp}D` }] });
  assert(!(await ops.rpc('admin_complete_purchase_order', { p_id: po3 })).error, 'a short delivery can be marked complete');

  // Stock count
  const batch = sql(`select id from public.stock_batches where batch_code = 'PO${stamp}A'`);
  assert((await errOf(fin.rpc('admin_apply_stock_count', { p_counts: [{ batch_id: batch, counted: 1 }], p_note: 'x' })))?.code === '42501', 'finance cannot count stock');
  const counted = await ops.rpc('admin_apply_stock_count', { p_counts: [{ batch_id: batch, counted: 4 }, { batch_id: sql(`select id from public.stock_batches where batch_code = 'PO${stamp}B'`), counted: 4 }], p_note: 'monthly' });
  assert(!counted.error && counted.data === 1, 'only the batch that differs is corrected');
  assert(sql(`select quantity from public.stock_batches where id = '${batch}'`) === '4', 'to the counted quantity');
  assert(sql(`select reason::text || ':' || quantity from public.stock_movements where note = 'Stock count: monthly'`) === 'lost:-2', 'recorded as lost, with the note');

  // Money owed
  const bal = (await fin.rpc('admin_supplier_balances')).data.find((b) => b.supplier_id === supplier);
  assert(Number(bal.received_cost_ghs) === 10 * 12.5 + 3 * 20 + 2 * 10 && Number(bal.owed_ghs) === Number(bal.received_cost_ghs), 'the supplier balance is what was received at cost');
  assert((await errOf(ops.rpc('admin_supplier_balances')))?.code === '42501', 'operations staff cannot see what is owed');
  const paid = await fin.rpc('admin_record_supplier_payment', { p_supplier_id: supplier, p_amount: 100, p_method: 'momo', p_reference: 'MM1' });
  assert(!paid.error, 'finance can record a payment');
  assert(Number((await fin.rpc('admin_supplier_balances')).data.find((b) => b.supplier_id === supplier).owed_ghs) === Number(bal.owed_ghs) - 100, 'and the amount owed goes down');
  assert((await errOf(fin.rpc('admin_record_supplier_payment', { p_supplier_id: supplier, p_amount: 0, p_method: 'momo' })))?.message.includes('amount'), 'a payment needs an amount');
  assert(!(await fin.rpc('admin_delete_supplier_payment', { p_id: paid.data })).error, 'a wrong payment can be removed');

  // Profit and stock value
  assert((await errOf(ops.rpc('admin_profit_by_product', { p_from: '2026-01-01', p_to: '2026-12-31' })))?.code === '42501', 'operations staff cannot see profit');
  const value = (await fin.rpc('admin_stock_value')).data[0];
  assert(Number(value.value_ghs) > 0 && Number(value.units) > 0, 'finance sees the value of the stock at cost');
  assert(!(await fin.rpc('admin_profit_by_product', { p_from: '2026-01-01', p_to: '2026-12-31' })).error, 'and the profit report');

  // The tables are closed
  assert((await errOf(boss.from('purchase_orders').select('id')))?.code === '42501', 'purchase order tables are not readable directly');
  assert((await errOf(boss.from('supplier_payments').select('id')))?.code === '42501', 'nor are supplier payments');

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll purchasing checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
