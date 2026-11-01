// Bulk product editing, reorder suggestions and size guides.
const { sql, admin, createUser, staffSession } = require('./lib.cjs');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const errOf = async (p) => (await p).error;
const stamp = Date.now();
const idOf = (slug) => sql(`select id from public.products where slug = '${slug}'`);
const price = (slug) => sql(`select price_ghs || '/' || coalesce(was_price_ghs::text, '-') from public.products where slug = '${slug}'`);
const sizePrices = (slug) => sql(`select string_agg(price_ghs::text, ',' order by sort_order) from public.product_sizes where product_id = '${idOf(slug)}'`);

(async () => {
  for (const [k, role] of [['cat', 'catalogue'], ['ops', 'operations'], ['ro', 'read_only']]) {
    await createUser(`ct-${k}+${stamp}@example.com`);
    sql(`insert into public.staff_members (email, role) values ('ct-${k}+${stamp}@example.com', '${role}')`);
  }
  const S = {};
  for (const k of ['cat', 'ops', 'ro']) S[k] = (await staffSession(`ct-${k}+${stamp}@example.com`)).client;
  const oil = idOf('argan-hair-oil');
  const wash = idOf('gentle-baby-wash-shampoo'); // has sizes
  const bulk = (client, ids, changes) => client.rpc('admin_bulk_update_products', { p_ids: ids, p_changes: changes });

  // --- Who may change many products -------------------------------------------
  assert((await errOf(bulk(S.ops, [oil], { price: { mode: 'percent', value: 10 } }))) !== null, 'only catalogue staff can bulk edit');
  assert((await errOf(bulk(S.cat, [], { price: { mode: 'percent', value: 10 } })))?.message.includes('at least one'), 'something must be selected');
  assert((await errOf(bulk(S.cat, [oil], {})))?.message.includes('what to change'), 'and something chosen');
  assert((await errOf(bulk(S.cat, [oil], { price: { mode: 'sale_percent', value: 95 } })))?.message.includes('between 1% and 90%'), 'a sale takes off 1% to 90%');

  // --- Prices ---------------------------------------------------------------------
  const before = { oil: price('argan-hair-oil'), wash: price('gentle-baby-wash-shampoo'), washSizes: sizePrices('gentle-baby-wash-shampoo') };
  let { data } = await bulk(S.cat, [oil, wash], { price: { mode: 'percent', value: 10 } });
  assert(data.updated === 2 && data.skipped.length === 0, 'prices go up 10% for both products');
  assert(Number(price('argan-hair-oil').split('/')[0]) === Math.round(Number(before.oil.split('/')[0]) * 110) / 100, 'the product price follows');
  assert(sizePrices('gentle-baby-wash-shampoo') !== before.washSizes, 'and every size follows');

  ({ data } = await bulk(S.cat, [oil, wash], { price: { mode: 'sale_percent', value: 20 } }));
  assert(data.updated === 2 && price('argan-hair-oil').endsWith('/' + (Number(before.oil.split('/')[0]) * 1.1).toFixed(2)), 'a sale shows the old price as "was"');
  ({ data } = await bulk(S.cat, [oil], { price: { mode: 'sale_percent', value: 20 } }));
  assert(data.updated === 0 && data.skipped[0].reason.includes('already on sale'), 'a product already on sale is skipped, not discounted twice');
  ({ data } = await bulk(S.cat, [oil, wash], { price: { mode: 'end_sale' } }));
  assert(data.updated === 2 && price('argan-hair-oil') === `${(Number(before.oil.split('/')[0]) * 1.1).toFixed(2)}/-`, 'ending the sale restores the price and removes "was"');

  ({ data } = await bulk(S.cat, [oil, wash], { price: { mode: 'set', value: 99 } }));
  assert(data.updated === 1 && data.skipped.length === 1 && data.skipped[0].reason.includes('several sizes'), 'an exact price is refused for a product with several sizes, and applied to the rest');
  assert(price('argan-hair-oil') === '99.00/-', 'the product with one size got it');
  ({ data } = await bulk(S.cat, [oil], { price: { mode: 'amount', value: -9999 } }));
  assert(data.updated === 0 && data.skipped[0].reason.includes('below zero') && price('argan-hair-oil') === '99.00/-', 'a price never goes below zero, and nothing changes then');
  assert(Number(sql(`select count(*) from public.audit_log where action = 'product.price_changed' and details ->> 'bulk' = 'true'`)) >= 4, 'each price change is audited');

  // --- Other changes ---------------------------------------------------------------
  assert((await errOf(bulk(S.cat, [oil], { size_guide_id: 'nope' })))?.message.includes('size guide'), 'a size guide must exist');
  assert((await errOf(bulk(S.cat, [oil], { category_id: 'nope' })))?.message.includes('category'), 'a category must exist');
  ({ data } = await bulk(S.cat, [oil], { size_guide_id: 'womens-clothing', skin_types: { mode: 'add', values: ['Dry', 'Oily'] } }));
  assert(data.updated === 1 && sql(`select size_guide_id || ':' || array_to_string(skin_types, ',') from public.products where id = '${oil}'`) === 'womens-clothing:Dry,Oily', 'a size guide and skin types are set together');
  await bulk(S.cat, [oil], { skin_types: { mode: 'add', values: ['Sensitive', 'Dry'] } });
  assert(sql(`select array_to_string(skin_types, ',') from public.products where id = '${oil}'`) === 'Dry,Oily,Sensitive', 'adding skin types keeps the others and skips repeats');
  await bulk(S.cat, [oil], { skin_types: { mode: 'clear' } });
  assert(sql(`select cardinality(skin_types) from public.products where id = '${oil}'`) === '0', 'skin types can be cleared');
  ({ data } = await bulk(S.cat, [oil], { published: false }));
  assert(data.updated === 1 && sql(`select is_published from public.products where id = '${oil}'`) === 'f', 'products can be hidden');
  ({ data } = await bulk(S.cat, [oil], { published: true }));
  assert(data.skipped[0]?.reason.includes('Missing:') || data.updated === 1, 'and shown again only when complete (otherwise the reason is given)');

  // --- Independent stores are never touched ---------------------------------------
  const vendorProduct = sql(`select id from public.products where vendor_id <> (select id from public.vendors where is_house) limit 1`);
  if (vendorProduct) {
    ({ data } = await bulk(S.cat, [vendorProduct], { price: { mode: 'percent', value: 10 } }));
    assert(data.updated === 0 && data.skipped[0].reason.includes('independent store'), 'products sold by independent stores are skipped');
  }

  // --- Size guides -----------------------------------------------------------------------
  assert(Number(sql('select count(*) from public.size_guides')) >= 3, 'starter size guides exist');
  const guide = { title: 'Men\'s shirts', columns: ['Size', 'Chest (cm)'], rows: [['M', '96–101'], ['L', '101–106']] };
  assert((await errOf(S.ops.rpc('admin_save_size_guide', { p: guide }))) !== null, 'only catalogue staff save size guides');
  assert((await errOf(S.cat.rpc('admin_save_size_guide', { p: { ...guide, rows: [['M']] } })))?.message.includes('2 cells'), 'every row needs a cell for each column');
  assert((await errOf(S.cat.rpc('admin_save_size_guide', { p: { ...guide, columns: ['Size'] } })))?.message.includes('2 to 8 columns'), 'a guide needs at least two columns');
  const saved = await S.cat.rpc('admin_save_size_guide', { p: guide });
  assert(saved.data === 'men-s-shirts', 'a guide is saved under a web-safe id');
  const anon = require('./lib.cjs').createClient(require('./lib.cjs').URL_, require('./lib.cjs').KEY, { auth: { persistSession: false } });
  const read = await anon.from('size_guides').select('id, title, rows').eq('id', 'men-s-shirts').single();
  assert(read.data?.rows.length === 2, 'shoppers can read size guides');
  assert((await anon.rpc('admin_delete_size_guide', { p_id: 'men-s-shirts' })).error !== null, 'but not change them');
  await S.cat.rpc('admin_delete_size_guide', { p_id: 'womens-clothing' });
  assert(sql(`select size_guide_id is null from public.products where id = '${oil}'`) === 't', 'deleting a guide leaves its products with none');

  // --- Reorder suggestions ---------------------------------------------------------------
  assert((await errOf(anon.rpc('admin_reorder_suggestions'))) !== null, 'suggestions are for staff only');
  sql(`update public.products set created_at = now() - interval '90 days' where id = '${oil}'`);
  sql(`update public.inventory_levels set on_hand = 3, reserved = 0 where product_id = '${oil}' and size_code = ''`);
  sql(`insert into public.stock_movements (product_id, size_code, reason, quantity, sellable_change) values ('${oil}', '', 'sold', 0, -24)`);
  sql('update public.store_settings set reorder_lead_days = 7, reorder_cover_days = 21');
  const { data: rows } = await S.ro.rpc('admin_reorder_suggestions');
  const row = rows.find((r) => r.product_id === oil);
  assert(row && row.sold_in_window >= 24 && row.available === 3, 'sales and stock are counted (24 sold, 3 left)');
  assert(Number(row.daily_rate) >= 0.8 && row.urgency === 'now', 'at that rate it runs out before a new order could arrive');
  assert(row.suggested_qty === Math.ceil(Number(row.daily_rate) * 28) - 3, 'the suggestion covers lead time plus cover days, less what is available');

  if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
  console.log('all catalogue tool checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
