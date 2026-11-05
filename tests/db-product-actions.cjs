// Database checks for the product actions in Admin → Products: duplicate, and delete (never an ordered product, never one with stock).
const { URL_, KEY, sql, createUser, staffSession, createClient } = require('./lib.cjs');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const errOf = async (p) => (await p).error;
const anon = createClient(URL_, KEY, { auth: { persistSession: false } });
const stamp = Date.now();

(async () => {
  const people = {};
  for (const [k, role] of [['cat', 'catalogue'], ['ops', 'operations']]) {
    await createUser(`${k}+${stamp}@example.com`);
    sql(`insert into public.staff_members (email, role) values ('${k}+${stamp}@example.com', '${role}')`);
    people[k] = (await staffSession(`${k}+${stamp}@example.com`)).client;
  }
  const { cat, ops } = people;
  const [slug, id] = sql(`select slug || '|' || id from public.products where is_published order by slug limit 1`).split('|');

  assert((await errOf(anon.rpc('admin_duplicate_product', { p_id: id }))) !== null, 'guests cannot duplicate a product');
  assert((await errOf(ops.rpc('admin_duplicate_product', { p_id: id })))?.code === '42501', 'operations staff cannot duplicate or delete products');
  assert((await errOf(ops.rpc('admin_delete_product', { p_id: id })))?.code === '42501', 'nor delete them');

  // Duplicate: a new unpublished draft with the same details and sizes
  const copy = await cat.rpc('admin_duplicate_product', { p_id: id });
  assert(!copy.error && copy.data, 'catalogue staff can duplicate a product');
  const row = sql(`select slug || '|' || is_published::text || '|' || name from public.products where id = '${copy.data}'`).split('|');
  assert(row[0] === `${slug}-copy` && row[1] === 'false' && row[2].endsWith('(copy)'), 'the copy is an unpublished draft named "(copy)" with its own web address');
  assert(sql(`select (select count(*) from public.product_sizes where product_id = '${copy.data}') = (select count(*) from public.product_sizes where product_id = '${id}')`) === 't', 'it has the same sizes');
  assert(Number(sql(`select coalesce(sum(on_hand), 0) from public.inventory_levels where product_id = '${copy.data}'`)) === 0, 'and no stock');
  const second = await cat.rpc('admin_duplicate_product', { p_id: id });
  assert(sql(`select slug from public.products where id = '${second.data}'`) === `${slug}-copy-2`, 'a second copy gets its own address');

  // Delete rules
  assert((await errOf(cat.rpc('admin_delete_product', { p_id: id })))?.message.includes('still has stock'), 'a product with stock cannot be deleted');
  assert(!(await cat.rpc('admin_delete_product', { p_id: copy.data })).error, 'a draft copy with no stock can be deleted');
  assert(Number(sql(`select count(*) from public.products where id = '${copy.data}'`)) === 0, 'and it is gone');

  const ordered = sql(`select id from public.products where id <> '${id}' order by slug limit 1`);
  sql(`update public.stock_batches set quantity = 0 where product_id = '${ordered}'; update public.inventory_levels set on_hand = 0 where product_id = '${ordered}';
       alter table public.orders disable trigger user;
       with o as (insert into public.orders (customer_name, phone, area, delivery_option_id, payment_method, subtotal_ghs)
                  values ('T', '0240000000', (select name from public.delivery_areas limit 1), 'standard', 'cod', 10) returning id)
       insert into public.order_items (order_id, product_id, product_name, unit_price_ghs, quantity, line_total_ghs)
       select o.id, '${ordered}', 'x', 10, 1, 10 from o;
       alter table public.orders enable trigger user;`);
  assert((await errOf(cat.rpc('admin_delete_product', { p_id: ordered })))?.message.includes('customer order'), 'a product on a customer order cannot be deleted');
  assert(!(await cat.rpc('admin_delete_product', { p_id: second.data })).error, 'the second copy can be');

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll product action checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
