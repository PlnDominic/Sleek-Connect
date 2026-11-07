// Database checks for managing categories in Admin → Categories: add, rename, reorder, delete.
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

  assert((await errOf(anon.rpc('admin_save_category', { p: { name: 'Nails', department: 'beauty' } }))) !== null, 'guests cannot add a category');
  assert((await errOf(ops.rpc('admin_save_category', { p: { name: 'Nails', department: 'beauty' } })))?.code === '42501', 'operations staff cannot add one');

  const created = await cat.rpc('admin_save_category', { p: { name: 'Nail Care', department: 'beauty' } });
  assert(!created.error && created.data === 'nail-care', 'catalogue staff can add a category, and it gets an address from its name');
  assert(sql(`select department || '|' || sort_order from public.categories where id = 'nail-care'`).startsWith('beauty|'), 'in the department they chose');
  assert((await cat.rpc('admin_save_category', { p: { name: 'nail care', department: 'beauty' } })).error?.message.includes('already a category'), 'a duplicate name is refused');
  assert((await cat.rpc('admin_save_category', { p: { name: '  ', department: 'beauty' } })).error?.message.includes('Enter a category name'), 'so is an empty one');
  assert((await cat.rpc('admin_save_category', { p: { name: 'X', department: 'nonsense' } })).error?.message.includes('Choose a department'), 'and an unknown department');

  assert(!(await cat.rpc('admin_save_category', { p: { id: 'nail-care', name: 'Nails & Polish', department: 'beauty' } })).error, 'a category can be renamed');
  assert(sql(`select name from public.categories where id = 'nail-care'`) === 'Nails & Polish', 'the new name is saved');

  // The store sells general merchandise: other departments exist, and a new category starts with the neutral picture kind
  const phones = await cat.rpc('admin_save_category', { p: { name: 'Phones', department: 'electronics' } });
  assert(!phones.error && sql(`select department || '|' || kind from public.categories where id = '${phones.data}'`) === 'electronics|box', 'categories can go in the electronics department, with the neutral picture kind');
  assert(!(await cat.rpc('admin_save_category', { p: { name: 'Gym Gear', department: 'sports' } })).error && !(await cat.rpc('admin_save_category', { p: { name: 'Gifts', department: 'general' } })).error, 'and in sports and general');

  // Order
  const before = sql(`select string_agg(id, ',' order by sort_order, name) from public.categories`).split(',');
  assert(before[before.length - 1] === 'nail-care', 'a new category goes last');
  assert(!(await cat.rpc('admin_move_category', { p_id: 'nail-care', p_direction: -1 })).error, 'it can be moved earlier');
  const after = sql(`select string_agg(id, ',' order by sort_order, name) from public.categories`).split(',');
  assert(after[after.length - 2] === 'nail-care' && after[after.length - 1] === before[before.length - 2], 'and swaps places with the one before it');
  assert(!(await cat.rpc('admin_move_category', { p_id: after[0], p_direction: -1 })).error, 'moving the first one earlier does nothing');

  // Department and delete rules
  const used = sql(`select category_id from public.products where category_id is not null limit 1`);
  const dept = sql(`select department from public.categories where id = '${used}'`);
  const other = dept === 'beauty' ? 'kids' : 'beauty';
  assert((await cat.rpc('admin_save_category', { p: { id: used, name: 'Renamed', department: other } })).error?.message.includes('Move or remove the products'), 'a category with products cannot change department');
  assert((await errOf(cat.rpc('admin_delete_category', { p_id: used })))?.message.includes('still has products'), 'nor be deleted');
  assert((await errOf(ops.rpc('admin_delete_category', { p_id: 'nail-care' })))?.code === '42501', 'operations staff cannot delete');
  assert(!(await cat.rpc('admin_delete_category', { p_id: 'nail-care' })).error, 'an empty category can be deleted');
  assert(Number(sql(`select count(*) from public.categories where id = 'nail-care'`)) === 0, 'and it is gone');
  assert(Number(sql(`select count(*) from public.audit_log where action like 'category.%'`)) >= 4, 'each change is in the audit log');

  assert(sql("select coalesce(to_regclass('public.age_bands')::text, '') || coalesce(to_regclass('public.product_age_bands')::text, '')") === '', 'Shop by age is gone: its tables no longer exist');
  process.exit(failures ? 1 : 0);
})();
