// Batch 4 database checks: saved addresses, product photos, delivery zones and free delivery, customer cancellation,
// reorder data and the wishlist.
const crypto = require('crypto');
const { URL_, KEY, sql, admin, createUser, staffSession, createClient } = require('./lib.cjs');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const errOf = async (p) => { const r = await p; return r.error; };
const anon = createClient(URL_, KEY, { auth: { persistSession: false } });
const stamp = Date.now();
let e;
const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');

const order = (items, { area = 'Osu', option = 'standard', phone = '024 123 4567', client = anon } = {}) =>
  client.rpc('place_order', {
    p_customer: { name: 'Ama Owusu', phone, area },
    p_delivery_option: option,
    p_payment: { method: 'momo', network: 'mtn', wallet: '024 765 4321' },
    p_items: items, p_is_gift: false,
  }).single();

async function pay(o) {
  const ref = `T-${o.order_number}`;
  let e = (await admin.rpc('start_payment', { p_order_token: o.order_token, p_provider: 'test', p_reference: ref })).error;
  if (e) throw e;
  e = (await admin.rpc('confirm_payment', { p_provider: 'test', p_reference: ref, p_status: 'succeeded', p_amount_ghs: o.total_ghs })).error;
  if (e) throw e;
}
const stock = (slug) => sql(`select i.on_hand || '/' || i.reserved from public.inventory_levels i join public.products p on p.id = i.product_id where p.slug = '${slug}' and i.size_code = ''`);
const status = (number) => sql(`select status from public.orders where order_number = '${number}'`);

(async () => {
  sql("update public.delivery_options set fee_ghs = 20 where id = 'standard'");
  sql("update public.delivery_options set fee_ghs = 30 where id = 'same_day'");
  const S = {};
  for (const [k, role] of [['admin', 'admin'], ['ops', 'operations'], ['cat', 'catalogue']]) {
    await createUser(`${k}+${stamp}@example.com`);
    sql(`insert into public.staff_members (email, role) values ('${k}+${stamp}@example.com', '${role}')`);
    S[k] = (await staffSession(`${k}+${stamp}@example.com`)).client;
  }
  await createUser(`ama+${stamp}@example.com`);
  await createUser(`kofi+${stamp}@example.com`);
  const ama = (await staffSession(`ama+${stamp}@example.com`, { mfa: false })).client;
  const kofi = (await staffSession(`kofi+${stamp}@example.com`, { mfa: false })).client;

  // --- Saved addresses (FR-023) ----------------------------------------------------------------
  const addr = { recipient_name: 'Ama Owusu', phone: '024 123 4567', area: 'Osu', ghanapost_gps: 'ga-123-4567', directions: 'Blue gate', label: 'Home' };
  assert((await errOf(anon.rpc('save_address', { p: addr })))?.code !== undefined, 'guests cannot save addresses');
  assert((await errOf(ama.rpc('save_address', { p: { ...addr, area: 'Kumasi' } })))?.message.includes('areas we deliver'), 'address must be in a delivery area');
  assert((await errOf(ama.rpc('save_address', { p: { ...addr, phone: '12' } })))?.message.includes('phone'), 'address needs a valid phone');
  assert((await errOf(ama.rpc('save_address', { p: { ...addr, ghanapost_gps: 'not a code' } })))?.message.includes('GA-123-4567'), 'GhanaPost GPS format checked');
  const { data: home } = await ama.rpc('save_address', { p: addr });
  const { data: work } = await ama.rpc('save_address', { p: { ...addr, label: 'Work', area: 'East Legon', ghanapost_gps: '' } });
  let list = (await ama.from('customer_addresses').select('id, label, is_default, ghanapost_gps').order('created_at')).data;
  assert(list.length === 2 && list[0].is_default && !list[1].is_default && list[0].ghanapost_gps === 'GA-123-4567', 'first address is the default; GPS stored upper-case');
  await ama.rpc('save_address', { p: { ...addr, id: work, label: 'Office', area: 'East Legon', is_default: true } });
  list = (await ama.from('customer_addresses').select('id, label, is_default').order('created_at')).data;
  assert(list.find((a) => a.id === work).is_default && !list.find((a) => a.id === home).is_default && list.find((a) => a.id === work).label === 'Office', 'editing can make another address the default');
  assert((await kofi.from('customer_addresses').select('id')).data.length === 0 && (await anon.from('customer_addresses').select('id')).data.length === 0, 'addresses are private');
  assert((await errOf(kofi.rpc('save_address', { p: { ...addr, id: home } })))?.message.includes('no longer exists'), 'cannot edit someone else’s address');
  await kofi.rpc('delete_address', { p_id: home });
  assert((await ama.from('customer_addresses').select('id')).data.length === 2, 'cannot delete someone else’s address');
  await ama.rpc('delete_address', { p_id: work });
  list = (await ama.from('customer_addresses').select('id, is_default')).data;
  assert(list.length === 1 && list[0].id === home && list[0].is_default, 'deleting the default promotes another address');
  for (let i = 0; i < 9; i++) await ama.rpc('save_address', { p: { ...addr, label: `A${i}` } });
  assert((await errOf(ama.rpc('save_address', { p: addr })))?.message.includes('up to 10'), 'at most 10 addresses');

  // --- Delivery zones, free delivery (FR-040/041) ---------------------------------------------------
  assert((await errOf(S.ops.rpc('admin_save_delivery_zone', { p_id: 'outer', p_name: 'Outer Accra' })))?.code === '42501', 'only admins edit delivery');
  assert((await errOf(S.admin.rpc('admin_save_delivery_zone', { p_id: 'Outer Accra', p_name: 'Outer' })))?.message.includes('lower-case'), 'zone code format checked');
  await S.admin.rpc('admin_save_delivery_zone', { p_id: 'outer', p_name: 'Outer Accra', p_sort_order: 1 });
  await S.admin.rpc('admin_set_delivery_rate', { p_zone_id: 'outer', p_option_id: 'standard', p_fee: 45, p_available: true });
  await S.admin.rpc('admin_set_delivery_rate', { p_zone_id: 'outer', p_option_id: 'same_day', p_fee: null, p_available: false });
  await S.admin.rpc('admin_save_delivery_area', { p: { old_name: 'Spintex', name: 'Spintex Road', zone_id: 'outer', is_active: true } });
  assert(sql("select zone_id from public.delivery_areas where name = 'Spintex Road'") === 'outer', 'area renamed and put in a zone');
  assert((await errOf(S.admin.rpc('admin_save_delivery_area', { p: { name: 'Osu' } })))?.message.includes('already an area'), 'duplicate area refused');
  const { data: far } = await order([{ slug: 'argan-hair-oil', quantity: 1 }], { area: 'Spintex Road' });
  assert(Number(far.delivery_fee_ghs) === 45, `zone fee charged (${far.delivery_fee_ghs})`);
  assert((await errOf(order([{ slug: 'argan-hair-oil', quantity: 1 }], { area: 'Spintex Road', option: 'same_day' })))?.message.includes('isn’t available') ||
    (await errOf(order([{ slug: 'argan-hair-oil', quantity: 1 }], { area: 'Spintex Road', option: 'same_day' })))?.message.includes("isn't available"), 'option switched off in a zone is refused');
  const { data: near } = await order([{ slug: 'argan-hair-oil', quantity: 1 }], { area: 'Osu' });
  assert(Number(near.delivery_fee_ghs) === 20, 'areas without a zone use the standard fee');
  e = await errOf(S.admin.rpc('admin_update_settings', { p: { free_delivery_threshold_ghs: '200' } }));
  assert(!e, `free-delivery threshold set (${e?.message})`);
  const { data: big } = await order([{ slug: 'argan-hair-oil', quantity: 2 }], { area: 'Spintex Road' });
  assert(Number(big.delivery_fee_ghs) === 0 && Number(big.total_ghs) === Number(big.subtotal_ghs), `standard delivery free over the threshold (${big.delivery_fee_ghs})`);
  const { data: bigSameDay } = await order([{ slug: 'argan-hair-oil', quantity: 2 }], { area: 'Osu', option: 'same_day' });
  assert(Number(bigSameDay.delivery_fee_ghs) === 30, 'same day is not free (not eligible)');
  const { data: small } = await order([{ slug: 'velvet-matte-lip-colour', quantity: 1 }], { area: 'Osu' });
  assert(Number(small.delivery_fee_ghs) === 20, 'below the threshold the fee applies');
  assert((await errOf(S.admin.rpc('admin_save_delivery_option', { p: { id: 'same_day', label: 'Same day', fee_ghs: '30', cutoff_time: '25:99' } })))?.message.includes('time like'), 'bad cut-off time refused');
  assert((await errOf(S.admin.rpc('admin_save_delivery_option', { p: { id: 'standard', label: 'Standard', fee_ghs: '20', days_min: '3', days_max: '1' } })))?.message.includes('shortest'), 'estimate range checked');
  e = await errOf(S.admin.rpc('admin_save_delivery_option', { p: { id: 'same_day', label: 'Same day', fee_ghs: '35', free_eligible: false, days_min: '0', days_max: '0', cutoff_time: '14:00' } }));
  assert(!e && sql("select fee_ghs || '|' || cutoff_time || '|' || days_max from public.delivery_options where id = 'same_day'") === '35.00|14:00:00|0', `option fee, estimate and cut-off saved (${e?.message})`);
  const { data: rates } = await anon.from('delivery_rates').select('zone_id, option_id, fee_ghs, is_available');
  assert(rates.length === 2, 'shoppers can read zone rates (for checkout)');
  await S.admin.rpc('admin_delete_delivery_zone', { p_id: 'outer' });
  assert(sql("select coalesce(zone_id, 'none') from public.delivery_areas where name = 'Spintex Road'") === 'none', 'deleting a zone puts its areas back on standard fees');
  assert((await S.admin.from('audit_log').select('action').like('action', 'delivery.%')).data.length >= 5, 'delivery changes audited');

  // --- Customer cancellation (FR-052) -------------------------------------------------------------
  const before = stock('argan-hair-oil');
  const { data: unpaid } = await order([{ slug: 'argan-hair-oil', quantity: 1 }]);
  assert((await anon.rpc('get_order', { p_order_token: unpaid.order_token })).data.can_cancel === true, 'unpaid order can be cancelled');
  assert(!(await errOf(anon.rpc('cancel_my_order', { p_order_token: unpaid.order_token, p_reason: 'Ordered by mistake' }))), 'customer cancels an unpaid order');
  assert(status(unpaid.order_number) === 'cancelled' && stock('argan-hair-oil') === before, 'reservation released');
  assert(sql(`select note || '|' || (details->>'by') from public.order_events where order_id = (select id from public.orders where order_number = '${unpaid.order_number}') and status = 'cancelled'`) === 'Ordered by mistake|customer', 'history records the customer’s reason');
  const { data: paid } = await order([{ slug: 'argan-hair-oil', quantity: 2 }]);
  await pay(paid);
  const afterPay = stock('argan-hair-oil');
  assert(!(await errOf(anon.rpc('cancel_my_order', { p_order_token: paid.order_token }))), 'customer cancels a paid order before packing');
  const [onHandBefore] = afterPay.split('/').map(Number);
  assert(Number(stock('argan-hair-oil').split('/')[0]) === onHandBefore + 2, 'units go back on sale');
  assert(sql(`select status || '|' || refund_due from public.orders where order_number = '${paid.order_number}'`) === 'cancelled|true', 'paid order flagged for a refund');
  assert(sql(`select count(*) from public.notifications where order_id = (select id from public.orders where order_number = '${paid.order_number}') and template = 'order_cancelled'`) !== '0', 'customer told about the cancellation');
  const { data: packing } = await order([{ slug: 'argan-hair-oil', quantity: 1 }]);
  await pay(packing);
  await S.ops.rpc('admin_start_packing', { p_order_ids: [sql(`select id from public.orders where order_number = '${packing.order_number}'`)] });
  assert((await anon.rpc('get_order', { p_order_token: packing.order_token })).data.can_cancel === false, 'cannot cancel once packing starts');
  assert((await errOf(anon.rpc('cancel_my_order', { p_order_token: packing.order_token })))?.message.includes('can’t be cancelled online') ||
    (await errOf(anon.rpc('cancel_my_order', { p_order_token: packing.order_token })))?.message.includes("can't be cancelled online"), 'cancel refused while packing');
  assert((await errOf(anon.rpc('cancel_my_order', { p_order_token: '00000000-0000-4000-8000-000000000000' })))?.message.includes('find'), 'unknown order refused');

  // --- Reorder data (FR-051) and photos ------------------------------------------------------------
  const { data: sized } = await order([{ slug: 'gentle-baby-wash-shampoo', size: '400', quantity: 1 }]);
  const page = (await anon.rpc('get_order', { p_order_token: sized.order_token })).data;
  assert(page.items[0].size_code === '400' && page.items[0].slug === 'gentle-baby-wash-shampoo', 'order lines carry the size code for "Buy again"');

  // --- Product photos (NFR-P2) --------------------------------------------------------------------
  const serum = sql("select id from public.products where slug = 'vitamin-c-brightening-serum'");
  const p1 = `${serum}/${crypto.randomUUID()}.png`;
  assert((await S.ops.storage.from('product-images').upload(p1, png, { contentType: 'image/png' })).error, 'operations staff cannot upload product photos');
  assert((await anon.storage.from('product-images').upload(p1, png, { contentType: 'image/png' })).error, 'shoppers cannot upload product photos');
  const up = await S.cat.storage.from('product-images').upload(p1, png, { contentType: 'image/png' });
  assert(!up.error, `catalogue staff upload a photo (${up.error?.message})`);
  assert((await errOf(S.cat.rpc('admin_add_product_image', { p_product_id: serum, p_path: `${serum}/missing.png` })))?.message.includes('upload'), 'photo that was never uploaded refused');
  const wrong = sql("select id from public.products where slug = 'argan-hair-oil'");
  assert((await errOf(S.cat.rpc('admin_add_product_image', { p_product_id: wrong, p_path: p1 })))?.message.includes('upload'), 'photo from another product’s folder refused');
  const { data: img1 } = await S.cat.rpc('admin_add_product_image', { p_product_id: serum, p_path: p1, p_alt: 'Serum bottle' });
  const p2 = `${serum}/${crypto.randomUUID()}.png`;
  await S.cat.storage.from('product-images').upload(p2, png, { contentType: 'image/png' });
  const { data: img2 } = await S.cat.rpc('admin_add_product_image', { p_product_id: serum, p_path: p2 });
  const publicUrl = anon.storage.from('product-images').getPublicUrl(p1).data.publicUrl;
  assert((await fetch(publicUrl)).status === 200, 'photos are publicly viewable');
  let photos = (await anon.from('product_images').select('id, alt, sort_order').eq('product_id', serum).order('sort_order')).data;
  assert(photos.map((p) => p.id).join() === [img1, img2].join() && photos[0].alt === 'Serum bottle', 'shoppers see photos in order');
  await S.cat.rpc('admin_arrange_product_images', { p_product_id: serum, p_photos: [{ id: img2, alt: 'Back label' }, { id: img1, alt: 'Front' }] });
  photos = (await anon.from('product_images').select('id, alt').eq('product_id', serum).order('sort_order')).data;
  assert(photos[0].id === img2 && photos[0].alt === 'Back label', 'photos rearranged; the first is the main photo');
  assert((await ama.rpc('get_bag')).error === null, 'bag still loads');
  const serumSize = sql(`select coalesce((select code from public.product_sizes where product_id = '${serum}' and is_default), '')`) || null;
  await ama.rpc('set_bag', { p_items: [{ slug: 'vitamin-c-brightening-serum', size: serumSize, quantity: 1 }] });
  assert((await ama.rpc('get_bag')).data[0].photo_path === p2, 'bag shows the main photo');
  const { data: withPhoto } = await order([{ slug: 'vitamin-c-brightening-serum', quantity: 1 }]);
  assert((await anon.rpc('get_order', { p_order_token: withPhoto.order_token })).data.items[0].photo_path === p2, 'order page shows the main photo');
  assert((await errOf(S.ops.rpc('admin_remove_product_image', { p_id: img1 })))?.code === '42501', 'operations staff cannot remove photos');
  const { data: removedPath } = await S.cat.rpc('admin_remove_product_image', { p_id: img1 });
  assert(removedPath === p1 && !(await S.cat.storage.from('product-images').remove([p1])).error, 'removing a photo returns its file, which staff delete');
  assert((await fetch(publicUrl)).status !== 200, 'removed photo is gone');
  sql(`update public.products set is_published = false where id = '${serum}'`);
  assert((await anon.from('product_images').select('id').eq('product_id', serum)).data.length === 0, 'photos of unpublished products are hidden from shoppers');
  sql(`update public.products set is_published = true where id = '${serum}'`);

  // --- Wishlist (FR-063) --------------------------------------------------------------------------
  assert((await errOf(anon.rpc('set_wishlist', { p_slugs: ['argan-hair-oil'], p_saved: true })))?.code !== undefined, 'guests save on their device only');
  await ama.rpc('set_wishlist', { p_slugs: ['argan-hair-oil', 'velvet-matte-lip-colour', 'no-such-product'], p_saved: true });
  await ama.rpc('set_wishlist', { p_slugs: ['argan-hair-oil'], p_saved: true });
  let saved = (await ama.rpc('get_wishlist')).data.map((r) => r.slug).sort();
  assert(saved.join() === 'argan-hair-oil,velvet-matte-lip-colour', `saved products listed once, unknown ignored (${saved})`);
  await ama.rpc('set_wishlist', { p_slugs: ['velvet-matte-lip-colour'], p_saved: false });
  saved = (await ama.rpc('get_wishlist')).data.map((r) => r.slug);
  assert(saved.join() === 'argan-hair-oil', 'product removed from the wishlist');
  assert((await kofi.rpc('get_wishlist')).data.length === 0 && (await kofi.from('wishlist_items').select('product_id')).data.length === 0, 'wishlists are private');
  sql("update public.products set is_published = false where slug = 'argan-hair-oil'");
  assert((await ama.rpc('get_wishlist')).data.length === 0, 'unpublished products drop out of the wishlist');
  sql("update public.products set is_published = true where slug = 'argan-hair-oil'");

  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
