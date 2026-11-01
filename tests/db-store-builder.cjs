// Database checks for the store builder (the Etsy-style way of opening and setting up a store): choosing a store name,
// setting the store up while the application is pending, preparing products before the store is live, sections, and
// vacation mode.
const { URL_, KEY, sql, createUser, staffSession, createClient } = require('./lib.cjs');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const errOf = async (p) => { const r = await p; return r.error; };
const anon = createClient(URL_, KEY, { auth: { persistSession: false } });
const stamp = Date.now();

const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
const checks = { photos_ok: true, description_ok: true, claims_ok: true, ingredients_ok: true, expiry_ok: 'na', authentic_ok: true, regulatory_ok: 'na', safety_ok: true };
const product = (extra = {}) => ({
  name: 'Shea Body Butter', brand: 'Ama Naturals', department: 'beauty', kind: 'jar', category_id: 'beauty-kits',
  price_ghs: 100, publish: true,
  sizes: [{ code: '200ml', label: '200 ml', price_ghs: 100, is_default: true }],
  description: 'Rich, unrefined shea butter.', ingredients: 'Shea butter', warnings: 'For external use only.',
  country_of_origin: 'Ghana', regulatory_reference: 'FDA/GH/2026/0001', ...extra,
});

(async () => {
  await createUser(`boss+${stamp}@example.com`);
  sql(`insert into public.staff_members (email, role) values ('boss+${stamp}@example.com', 'admin')`);
  const boss = (await staffSession(`boss+${stamp}@example.com`)).client;
  const people = {};
  for (const k of ['ama', 'kofi']) {
    await createUser(`${k}+${stamp}@example.com`);
    people[k] = (await staffSession(`${k}+${stamp}@example.com`)).client;
  }
  const { ama, kofi } = people;

  // --- Choosing a store name ---------------------------------------------------------------------
  assert((await errOf(anon.rpc('vendor_name_available', { p_name: 'Ama Naturals' })))?.code !== undefined, 'guests cannot check store names');
  let free = (await ama.rpc('vendor_name_available', { p_name: 'Ama Naturals' })).data;
  assert(free.available === true && free.slug === 'ama-naturals', 'a free name is available, with the web address it would get');
  assert((await ama.rpc('vendor_name_available', { p_name: 'A' })).data.available === false, 'a one-letter name is refused');
  assert((await ama.rpc('vendor_name_available', { p_name: '<b>Shop</b>' })).data.available === false, 'odd characters are refused');
  assert((await ama.rpc('vendor_name_available', { p_name: 'Sleek Connect' })).data.available === false, 'our own name is reserved');
  assert((await ama.rpc('vendor_name_available', { p_name: 'Admin' })).data.available === false, 'reserved words cannot be store names');

  // --- Applying, then setting the store up while it waits ----------------------------------------
  const amaId = (await ama.auth.getUser()).data.user.id;
  const idPath = `${amaId}/id-${stamp}.png`;
  await ama.storage.from('vendor-ids').upload(idPath, png, { contentType: 'image/png' });
  const { data: vendorId, error: applyError } = await ama.rpc('vendor_apply', {
    p_name: 'Ama Naturals', p_owner_name: 'Ama Owusu', p_email: 'ama@example.com', p_phone: '0241234567',
    p_id_type: 'ghana_card', p_id_number: 'GHA-123456789-0', p_id_path: idPath, p_tagline: null, p_accept_terms: true,
  });
  assert(!applyError && vendorId, 'the application goes through');
  const taken = (await kofi.rpc('vendor_name_available', { p_name: 'Ama Naturals' })).data;
  assert(taken.available === false && taken.reason.includes('taken') && taken.suggestion, 'a name that is taken says so and suggests another');
  assert(taken.suggestion.toLowerCase() !== 'ama naturals', 'the suggestion is different from the taken name');
  free = (await ama.rpc('vendor_name_available', { p_name: 'Ama Naturals' })).data;
  assert(free.available === true, 'your own store\'s name counts as free for you');
  assert((await ama.rpc('vendor_me')).data.processing_days === 2, 'a new store packs in 2 working days until it says otherwise');

  assert(!(await ama.rpc('vendor_update_store', { p: { name: 'Ama Naturals', tagline: 'Pure shea', announcement: 'Welcome!', description: 'Our story', returns_policy: 'Unopened jars within 7 days.', processing_days: 3, instagram: '@ama.naturals', website: 'https://ama.example.com' } })).error,
    'a store can be set up while the application is pending');
  let me = (await ama.rpc('vendor_me')).data;
  assert(me.status === 'pending' && me.live === false && me.announcement === 'Welcome!' && me.processing_days === 3 && me.instagram === 'ama.naturals', 'the details are saved (an @ in front of the Instagram name is dropped)');
  assert(me.returns_policy === 'Unopened jars within 7 days.' && me.website === 'https://ama.example.com', 'the returns policy and website are saved');
  assert((await errOf(ama.rpc('vendor_update_store', { p: { processing_days: 0 } })))?.message.includes('Packing time'), 'packing time is between 1 and 14 days');
  assert((await errOf(ama.rpc('vendor_update_store', { p: { processing_days: 30 } })))?.message.includes('Packing time'), 'and not more than 14');
  assert((await errOf(ama.rpc('vendor_update_store', { p: { instagram: 'not valid!' } })))?.message.includes('Instagram'), 'an Instagram name has no spaces or symbols');
  assert((await errOf(ama.rpc('vendor_update_store', { p: { website: 'javascript:alert(1)' } })))?.message.includes('http'), 'a website must be an http or https address');
  assert((await errOf(kofi.rpc('vendor_update_store', { p: { name: 'Hijack' } })))?.code === '42501', 'someone without a store cannot edit one');
  assert((await errOf(ama.rpc('vendor_save_product', { p: product() })))?.message.includes('not approved'), 'a pending store cannot add products yet');
  assert((await errOf(ama.rpc('vendor_set_paused', { p_paused: true })))?.message.includes('not approved'), 'and cannot pause before it is approved');

  // --- Sections ----------------------------------------------------------------------------------
  const { data: skin, error: sectionError } = await ama.rpc('vendor_save_section', { p: { name: 'Skincare' } });
  assert(!sectionError && skin, 'a store can add a section while it is being set up');
  const { data: hair } = await ama.rpc('vendor_save_section', { p: { name: 'Hair' } });
  assert((await errOf(ama.rpc('vendor_save_section', { p: { name: 'skincare' } })))?.message.includes('already'), 'two sections cannot have the same name');
  assert((await errOf(ama.rpc('vendor_save_section', { p: { name: '  ' } })))?.message.includes('Name the section'), 'a section needs a name');
  assert(!(await ama.rpc('vendor_save_section', { p: { id: hair, name: 'Hair care' } })).error, 'a section can be renamed');
  assert((await errOf(kofi.rpc('vendor_save_section', { p: { name: 'Mine' } })))?.code === '42501', 'someone without a store has no sections');
  assert((await kofi.from('vendor_sections').select('id')).data.length === 0, 'other shoppers cannot read a store\'s sections before it is live');
  assert((await ama.from('vendor_sections').select('id')).data.length === 2, 'the owner can read their own sections');
  for (let i = 0; i < 10; i++) await ama.rpc('vendor_save_section', { p: { name: `Extra ${i}` } });
  assert((await errOf(ama.rpc('vendor_save_section', { p: { name: 'One too many' } })))?.message.includes('12'), 'a store can have up to 12 sections');

  // --- Approval, then preparing products before paying ------------------------------------------
  await boss.rpc('admin_save_vendor_checks', { p_vendor_id: vendorId, p_checks: { id_matches: true, id_valid: true, phone_confirmed: true, products_allowed: true } });
  await boss.rpc('admin_review_vendor', { p_vendor_id: vendorId, p_decision: 'active', p_note: 'Welcome' });
  me = (await ama.rpc('vendor_me')).data;
  assert(me.status === 'active' && me.live === false, 'approved, not live until the yearly fee is paid');
  const { data: saved, error: saveError } = await ama.rpc('vendor_save_product', { p: product() });
  assert(!saveError && saved.id, 'an approved store can prepare products before it is live');
  const productId = saved.id;
  assert(!(await ama.rpc('vendor_set_product_section', { p_product_id: productId, p_section_id: skin })).error, 'a product can be put in a section');
  assert((await errOf(ama.rpc('vendor_set_product_section', { p_product_id: productId, p_section_id: '00000000-0000-0000-0000-000000000000' })))?.message.includes('section'), 'but not in a section that does not exist');
  const placed = (await ama.rpc('vendor_product_sections')).data;
  assert(placed.length === 1 && placed[0].section_id === skin, 'the store can list which product is in which section');
  assert((await anon.from('products').select('id').eq('id', productId)).data.length === 0, 'a prepared product is not on sale before the store is live');
  assert((await anon.from('vendor_sections').select('id')).data.length === 0, 'and its sections are not public');
  await ama.rpc('vendor_set_stock', { p_product_id: productId, p_size_code: '200ml', p_quantity: 5 });
  assert((await ama.rpc('vendor_my_products')).data[0].sizes[0].stock === 5, 'stock can be entered before the store is live');
  await boss.rpc('admin_review_product', { p_product_id: productId, p_decision: 'approved', p_markup_percent: 10, p_checks: checks });
  assert((await anon.from('products').select('id').eq('id', productId)).data.length === 0, 'an approved product still waits for the store to go live');

  // --- Going live, sections in public, then vacation mode ----------------------------------------
  await boss.rpc('admin_record_subscription', { p_vendor_id: vendorId, p_amount_ghs: 300, p_method: 'momo', p_reference: `MM-${stamp}` });
  me = (await ama.rpc('vendor_me')).data;
  assert(me.live === true && me.paused === false, 'paying makes the store live');
  assert((await anon.from('products').select('id').eq('id', productId)).data.length === 1, 'the approved product is now on sale');
  const publicSections = (await anon.from('vendor_sections').select('id, name').eq('vendor_id', vendorId)).data;
  assert(publicSections.length === 12 && publicSections.some((s) => s.name === 'Skincare'), 'a live store\'s sections are public');
  const publicProfile = (await anon.from('vendors').select('announcement, returns_policy, processing_days, instagram, website').eq('slug', 'ama-naturals')).data;
  assert(publicProfile.length === 1 && publicProfile[0].announcement === 'Welcome!' && publicProfile[0].processing_days === 3, 'the store profile is public');
  assert((await anon.from('vendors').select('owner_id')).error !== null, 'who runs the store is still never public');

  assert(!(await ama.rpc('vendor_set_paused', { p_paused: true, p_note: 'Back on 15 December' })).error, 'a live store can pause');
  me = (await ama.rpc('vendor_me')).data;
  assert(me.paused === true && me.paused_note === 'Back on 15 December' && me.live === false, 'a paused store is not live');
  assert((await anon.from('products').select('id').eq('id', productId)).data.length === 0, 'its products leave the shop while it is paused');
  assert((await anon.from('vendors').select('slug').eq('slug', 'ama-naturals')).data.length === 0, 'and its page is hidden');
  assert((await anon.from('vendor_sections').select('id').eq('vendor_id', vendorId)).data.length === 0, 'and so are its sections');
  assert(!(await ama.rpc('vendor_update_store', { p: { announcement: 'Back soon' } })).error, 'a paused store can still be edited');
  assert(!(await ama.rpc('vendor_set_paused', { p_paused: false })).error, 'it can reopen');
  me = (await ama.rpc('vendor_me')).data;
  assert(me.paused === false && me.live === true && me.paused_note === null, 'reopening makes it live again and clears the note');
  assert((await anon.from('products').select('id').eq('id', productId)).data.length === 1, 'and its approved products come back on sale');

  // --- Removing a section keeps the products ----------------------------------------------------
  assert(!(await ama.rpc('vendor_delete_section', { p_id: skin })).error, 'a section can be removed');
  assert((await ama.rpc('vendor_product_sections')).data[0].section_id === null, 'its products stay in the store, without a section');
  assert(sql(`select count(*) from public.audit_log where action in ('vendor.paused', 'vendor.resumed') and entity_id = '${vendorId}'`) === '2', 'pausing and reopening are in the audit log');

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll store builder checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
