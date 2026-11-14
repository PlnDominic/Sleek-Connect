// Database checks for category photos: only catalogue staff set them, the file must be uploaded under categories/<id>/, and the
// public can read the result.
const { URL_, KEY, sql, createUser, staffSession, createClient } = require('./lib.cjs');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const errOf = async (p) => (await p).error;
const anon = createClient(URL_, KEY, { auth: { persistSession: false } });
const stamp = Date.now();
const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');

(async () => {
  const people = {};
  for (const [k, role] of [['cat', 'catalogue'], ['ops', 'operations']]) {
    await createUser(`${k}+${stamp}@example.com`);
    sql(`insert into public.staff_members (email, role) values ('${k}+${stamp}@example.com', '${role}')`);
    people[k] = (await staffSession(`${k}+${stamp}@example.com`)).client;
  }
  const { cat, ops } = people;
  const id = 'skincare';

  assert((await errOf(anon.rpc('admin_set_category_photo', { p_id: id })))?.code !== undefined, 'guests cannot change a category photo');
  assert((await errOf(ops.rpc('admin_set_category_photo', { p_id: id })))?.code === '42501', 'operations staff cannot either');
  assert((await errOf(cat.rpc('admin_set_category_photo', { p_id: 'nope', p_path: null })))?.message.includes('no longer exists'), 'the category must exist');
  assert((await errOf(cat.rpc('admin_set_category_photo', { p_id: id, p_path: `categories/${id}/missing.png` })))?.message.includes('didn'), 'the file must really be uploaded');

  const path = `categories/${id}/${stamp}.png`;
  const up = await cat.storage.from('product-images').upload(path, png, { contentType: 'image/png' });
  assert(!up.error, 'catalogue staff can upload to the category folder');
  assert((await errOf(cat.rpc('admin_set_category_photo', { p_id: 'makeup', p_path: path })))?.message.includes('didn'), 'a photo uploaded for one category cannot be used for another');
  assert(!(await cat.rpc('admin_set_category_photo', { p_id: id, p_path: path })).error, 'catalogue staff can set the photo');
  const shown = (await anon.from('categories').select('photo_path').eq('id', id).single()).data;
  assert(shown?.photo_path === path, 'shoppers can read it');
  assert(!(await cat.rpc('admin_set_category_photo', { p_id: id })).error && !(await anon.from('categories').select('photo_path').eq('id', id).single()).data.photo_path, 'and it can be removed');
  await cat.storage.from('product-images').remove([path]);

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll category photo checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
