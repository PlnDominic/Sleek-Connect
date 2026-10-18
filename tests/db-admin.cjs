const { URL_, KEY, sql, admin, createUser, staffSession, createClient } = require('./lib.cjs');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const errOf = async (p) => { const r = await p; return r.error; };
const anon = createClient(URL_, KEY, { auth: { persistSession: false } });
const stamp = Date.now();

async function placeAndPay(items, opts = {}) {
  const { data, error } = await anon.rpc('place_order', {
    p_customer: { name: opts.name ?? 'Ama Owusu', phone: '024 123 4567', area: 'Osu' },
    p_delivery_option: 'same_day',
    p_payment: { method: 'momo', network: 'mtn', wallet: '024 765 4321' },
    p_items: items, p_is_gift: false,
  }).single();
  if (error) throw error;
  const ref = `T-${data.order_number}`;
  let e = (await admin.rpc('start_payment', { p_order_token: data.order_token, p_provider: 'test', p_reference: ref })).error;
  if (e) throw e;
  e = (await admin.rpc('confirm_payment', { p_provider: 'test', p_reference: ref, p_status: 'succeeded', p_amount_ghs: data.total_ghs })).error;
  if (e) throw e;
  const id = sql(`select id from public.orders where order_number = '${data.order_number}'`);
  return { ...data, id };
}
const stock = (slug, size = '') => sql(`select i.on_hand || '/' || i.reserved from public.inventory_levels i join public.products p on p.id = i.product_id where p.slug = '${slug}' and i.size_code = '${size}'`);
const status = (id) => sql(`select status from public.orders where id = '${id}'`);

(async () => {
  sql("update public.delivery_options set fee_ghs = 30 where id = 'same_day'");
  const users = {};
  for (const [k, role] of [['admin', 'admin'], ['ops', 'operations'], ['cat', 'catalogue'], ['ro', 'read_only'], ['temp', 'operations'], ['shopper', null]]) {
    users[k] = await createUser(`${k}+${stamp}@example.com`, undefined, { full_name: k });
    if (role) sql(`insert into public.staff_members (email, role) values ('${k}+${stamp}@example.com', '${role}')`);
  }
  const S = {};
  for (const k of ['admin', 'ops', 'cat', 'ro', 'temp']) S[k] = (await staffSession(`${k}+${stamp}@example.com`)).client;
  S.shopper = (await staffSession(`shopper+${stamp}@example.com`)).client;

  // --- Access ------------------------------------------------------------------
  const { data: acc } = await S.ops.rpc('my_staff_access').single();
  assert(acc?.role === 'operations', 'staff are recognised from their sign-in alone');
  const { data: { session } } = await S.ops.auth.getSession();
  assert(JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64url')).aal === 'aal1', 'staff sessions have no second step (assurance level aal1)');
  assert(!(await errOf(S.ops.rpc('admin_start_packing', { p_order_ids: [] }))), 'staff can use admin functions without any second step');
  assert((await errOf(S.shopper.rpc('admin_start_packing', { p_order_ids: [] })))?.code === '42501', 'accounts that are not on the staff list are refused');
  assert((await anon.rpc('my_staff_access')).error !== null || (await anon.rpc('my_staff_access')).data?.length === 0, 'anonymous visitors get no staff access');
  assert(!(await errOf(S.temp.rpc('admin_start_packing', { p_order_ids: [] }))), 'an active staff member is let in');
  sql(`update public.staff_members set is_active = false where email = 'temp+${stamp}@example.com'`);
  assert((await errOf(S.temp.rpc('admin_start_packing', { p_order_ids: [] })))?.code === '42501' && (await S.temp.from('stock_batches').select('id')).data.length === 0, 'deactivated staff are refused straight away');
  assert((await S.temp.rpc('my_staff_access')).data.length === 0, 'deactivated staff are shown as having no access');
  assert((await S.shopper.from('stock_batches').select('id')).data.length === 0 && (await anon.from('stock_batches').select('id')).data.length === 0, 'shoppers and anon see no batches');
  assert((await S.ops.from('stock_batches').select('id')).data.length === 11, 'staff see batches');
  assert((await errOf(anon.rpc('admin_stock_overview')))?.code !== undefined, 'anon cannot read the stock overview');
  const { data: ov } = await S.ro.rpc('admin_stock_overview');
  assert(ov?.length === 11 && ov.every((r) => r.available === 25), 'read-only staff can see stock levels');
  assert((await errOf(S.ro.rpc('admin_receive_stock', { p_product_id: ov[0].product_id, p_size_code: ov[0].size_code, p_batch_code: 'X', p_expires_on: '2030-01-01', p_quantity: 1 })))?.code === '42501', 'read-only staff cannot change stock');

  // --- Staff management -----------------------------------------------------------
  assert((await errOf(S.ops.rpc('admin_set_staff', { p_email: 'x@example.com', p_role: 'admin' })))?.code === '42501', 'only admins manage staff');
  assert(!(await errOf(S.admin.rpc('admin_set_staff', { p_email: 'New.Person@Example.com ', p_role: 'support' }))), 'admin adds staff');
  assert(sql("select role from public.staff_members where email = 'new.person@example.com'") === 'support', 'staff email stored lower-case');
  const lastAdmin = await errOf(S.admin.rpc('admin_set_staff', { p_email: `admin+${stamp}@example.com`, p_role: 'admin', p_active: false }));
  assert(lastAdmin?.message?.includes('at least one active admin'), 'cannot remove the last admin');
  assert((await S.admin.from('audit_log').select('action')).data.some((r) => r.action === 'staff.added'), 'staff change is audited');
  assert((await S.ops.from('audit_log').select('id')).data.length === 0, 'only admins read the audit log');
  let immutable = false; try { sql('update public.audit_log set action = action'); } catch { immutable = true; }
  assert(immutable, 'audit log cannot be edited, even by the database owner');

  // --- Catalogue -----------------------------------------------------------------
  const draft = { name: 'Rosehip Face Oil', department: 'beauty', kind: 'bottle', category_id: sql("select id from public.categories where department = 'beauty' limit 1"), price_ghs: 150, publish: true, sizes: [], age_bands: [] };
  assert((await errOf(S.ops.rpc('admin_save_product', { p: draft })))?.code === '42501', 'operations cannot edit the catalogue');
  const { data: saved, error: saveErr } = await S.cat.rpc('admin_save_product', { p: draft });
  assert(!saveErr && saved.published === false && saved.slug === 'rosehip-face-oil', `incomplete product saved as a draft (${saveErr?.message})`);
  assert(['brand', 'description', 'ingredients', 'safety notes', 'country of origin', 'FDA registration number'].every((x) => saved.problems.includes(x)), `missing fields listed (${saved.problems})`);
  assert((await anon.from('products').select('id').eq('slug', 'rosehip-face-oil')).data.length === 0, 'draft not visible to shoppers');
  assert((await S.ro.from('products').select('id').eq('slug', 'rosehip-face-oil')).data.length === 1, 'draft visible to staff');
  const full = { ...draft, id: saved.id, brand: 'Glow Lab', description: 'Cold-pressed rosehip oil.', ingredients: 'Rosa Canina Seed Oil', warnings: 'For external use only.', country_of_origin: 'Ghana', regulatory_reference: 'FDA/CB.123', sizes: [{ code: '15', label: '15 ml', price_ghs: 90 }, { code: '30', label: '30 ml', price_ghs: 150, is_default: true }] };
  const { data: pub } = await S.cat.rpc('admin_save_product', { p: full });
  assert(pub.published === true && pub.problems.length === 0, 'complete product publishes');
  assert(sql(`select price_ghs || ' ' || (select string_agg(code || ':' || is_default, ',' order by sort_order) from public.product_sizes where product_id = p.id) from public.products p where id = '${saved.id}'`) === '150.00 15:false,30:true', 'sizes saved with chosen default');
  assert(sql(`select string_agg(size_code || '=' || on_hand, ',' order by size_code) from public.inventory_levels where product_id = '${saved.id}'`) === '15=0,30=0', 'stock rows created per size');
  const { data: pub2 } = await S.cat.rpc('admin_save_product', { p: { ...full, regulatory_reference: '', price_ghs: 0, sizes: [{ code: '30', label: '30 ml', price_ghs: 160 }] } });
  assert(pub2.published === false && pub2.problems.includes('FDA registration number'), 'clearing a required field takes the product off the store');
  assert((await S.admin.from('audit_log').select('action, details').eq('entity_id', saved.id)).data.some((r) => r.action === 'product.price_changed'), 'price change audited');
  assert((await errOf(S.cat.rpc('admin_save_product', { p: { ...full, id: undefined, name: 'Copy', slug: 'rosehip-face-oil' } })))?.message.includes('already uses'), 'duplicate web address refused');
  await S.cat.rpc('admin_save_product', { p: full });

  // --- Receiving and batches --------------------------------------------------------
  const pid = saved.id;
  assert((await errOf(S.ops.rpc('admin_receive_stock', { p_product_id: pid, p_size_code: '30', p_batch_code: 'rh-1', p_expires_on: null, p_quantity: 10 })))?.message.includes('expiry date'), 'cosmetics need an expiry date');
  assert((await errOf(S.ops.rpc('admin_receive_stock', { p_product_id: pid, p_size_code: '30', p_batch_code: 'rh-1', p_expires_on: '2020-01-01', p_quantity: 10 })))?.message.includes('passed'), 'expired stock refused');
  await S.ops.rpc('admin_receive_stock', { p_product_id: pid, p_size_code: '30', p_batch_code: 'rh-late', p_expires_on: '2029-06-30', p_quantity: 3, p_note: 'Invoice 77' });
  await S.ops.rpc('admin_receive_stock', { p_product_id: pid, p_size_code: '30', p_batch_code: 'rh-early', p_expires_on: '2027-03-31', p_quantity: 2 });
  assert(stock('rosehip-face-oil', '30') === '5/0', 'received stock goes on sale');
  assert((await anon.from('inventory_levels').select('in_stock').eq('product_id', pid).eq('size_code', '30')).data[0].in_stock === true, 'shoppers see it in stock');

  // --- Order: FEFO pick, pack, dispatch, deliver ---------------------------------------
  const o1 = await placeAndPay([{ slug: 'rosehip-face-oil', size: '30', quantity: 3 }]);
  assert(stock('rosehip-face-oil', '30') === '2/0' && status(o1.id) === 'paid', 'paid order takes stock off sale');
  const { data: pick } = await S.ro.rpc('admin_pick_list', { p_order_id: o1.id });
  assert(pick.map((r) => `${r.batch_code}x${r.quantity}`).join(',') === 'RH-EARLYx2,RH-LATEx1', `pick list takes earliest expiry first (${pick.map((r) => `${r.batch_code}x${r.quantity}`)})`);
  assert(await S.ops.rpc('admin_start_packing', { p_order_ids: [o1.id] }).then((r) => r.data) === 1 && status(o1.id) === 'packing', 'start packing');
  const { data: packed } = await S.ops.rpc('admin_pack_orders', { p_order_ids: [o1.id] });
  assert(packed[0].ok && status(o1.id) === 'packed', 'pack order');
  assert(sql(`select string_agg(batch_code || '=' || quantity, ',' order by batch_code) from public.stock_batches where product_id = '${pid}'`) === 'RH-EARLY=0,RH-LATE=2', 'packing takes units out of the batches');
  const { data: rider } = await S.ops.rpc('admin_save_rider', { p_id: null, p_name: 'Kofi Asante', p_phone: '020 111 2222', p_vehicle: 'Motorbike' });
  assert((await errOf(S.ops.rpc('admin_dispatch_order', { p_order_id: o1.id, p_rider_id: null })))?.message.includes('rider'), 'dispatch needs a rider or courier');
  await S.ops.rpc('admin_dispatch_order', { p_order_id: o1.id, p_rider_id: rider });
  assert(status(o1.id) === 'out_for_delivery', 'dispatched');
  const code = sql(`select delivery_code from public.orders where id = '${o1.id}'`);
  const { data: page } = await anon.rpc('get_order', { p_order_token: o1.order_token });
  assert(page.delivery_code === code && page.rider.name === 'Kofi Asante' && page.items[0].quantity === 3, 'order page shows code, rider and items');
  assert(page.events.map((e) => e.status).join('>') === 'pending_payment>paid>packing>packed>out_for_delivery', `order timeline (${page.events.map((e) => e.status)})`);
  const wrong = code === '0000' ? '1111' : '0000';
  assert((await S.ops.rpc('admin_mark_delivered', { p_order_id: o1.id, p_recipient: 'Ama', p_code: wrong })).data === 'wrong_code' && status(o1.id) === 'out_for_delivery', 'wrong delivery code refused');
  assert((await errOf(S.ops.rpc('admin_mark_delivered', { p_order_id: o1.id, p_recipient: '', p_code: code })))?.message.includes('name'), 'recipient name required');
  await S.ops.rpc('admin_mark_delivered', { p_order_id: o1.id, p_recipient: 'Ama Owusu', p_code: code });
  assert(status(o1.id) === 'delivered', 'delivered with proof');
  const ev = (await S.ro.from('order_events').select('status, actor_email, details').eq('order_id', o1.id)).data;
  assert(ev.find((e) => e.status === 'delivered')?.actor_email === `ops+${stamp}@example.com` && ev.find((e) => e.status === 'out_for_delivery')?.details.rider === 'Kofi Asante', 'history records who did what');
  const notes = sql(`select string_agg(template, ',' order by created_at) from public.notifications where order_id = '${o1.id}' and channel = 'sms'`);
  assert(notes === 'order_confirmed,order_packed,out_for_delivery,order_delivered', `SMS queued for each customer-facing step (${notes})`);
  assert(sql(`select payload->>'rider_name' from public.notifications where order_id = '${o1.id}' and template = 'out_for_delivery'`) === 'Kofi Asante', 'out-for-delivery message names the rider');
  assert((await anon.rpc('get_order', { p_order_token: o1.order_token })).data.delivery_code === null, 'delivery code hidden once delivered');

  // --- Guessing the delivery code locks the order -------------------------------------------
  const o6 = await placeAndPay([{ slug: 'rosehip-face-oil', size: '30', quantity: 1 }]);
  await S.ops.rpc('admin_pack_orders', { p_order_ids: [o6.id] });
  await S.ops.rpc('admin_dispatch_order', { p_order_id: o6.id, p_rider_id: rider });
  const code6 = sql(`select delivery_code from public.orders where id = '${o6.id}'`);
  const wrong6 = code6 === '0000' ? '1111' : '0000';
  const results = [];
  for (let i = 0; i < 5; i++) results.push((await S.ops.rpc('admin_mark_delivered', { p_order_id: o6.id, p_recipient: 'X', p_code: wrong6 })).data);
  assert(results.every((r) => r === 'wrong_code') && sql(`select delivery_code_failures || ' ' || needs_review from public.orders where id = '${o6.id}'`) === '5 true', 'wrong codes are counted and the order flagged after five');
  assert((await S.ops.rpc('admin_mark_delivered', { p_order_id: o6.id, p_recipient: 'X', p_code: code6 })).data === 'locked' && status(o6.id) === 'out_for_delivery', 'after five wrong codes even the right code is refused');
  assert((await S.admin.from('audit_log').select('action').eq('entity_id', o6.id).eq('action', 'order.wrong_delivery_code')).data.length === 5, 'each wrong code is in the audit log');
  assert((await errOf(S.admin.rpc('admin_mark_delivered', { p_order_id: o6.id, p_recipient: 'Ama', p_code: '' })))?.message.includes('note'), 'admin override needs a note');
  assert((await S.ops.rpc('admin_mark_delivered', { p_order_id: o6.id, p_recipient: 'Ama', p_code: '', p_note: 'x' })).data === 'locked', 'operations staff cannot skip the code');
  assert((await S.admin.rpc('admin_mark_delivered', { p_order_id: o6.id, p_recipient: 'Ama', p_code: '', p_note: 'Customer lost the SMS; ID checked' })).data === 'delivered' && status(o6.id) === 'delivered', 'an admin can confirm without the code');
  assert((await S.admin.from('audit_log').select('action').eq('entity_id', o6.id).eq('action', 'order.delivered_without_code')).data.length === 1, 'the override is audited');

  // --- Failed delivery, re-attempt limit, return to stock ------------------------------
  const o2 = await placeAndPay([{ slug: 'rosehip-face-oil', size: '30', quantity: 1 }]);
  await S.ops.rpc('admin_pack_orders', { p_order_ids: [o2.id] });
  await S.ops.rpc('admin_dispatch_order', { p_order_id: o2.id, p_rider_id: rider });
  assert((await errOf(S.ops.rpc('admin_mark_delivery_failed', { p_order_id: o2.id, p_reason: 'other' })))?.message.includes('note'), '"other" failure needs a note');
  await S.ops.rpc('admin_mark_delivery_failed', { p_order_id: o2.id, p_reason: 'customer_unreachable' });
  assert(status(o2.id) === 'delivery_failed' && sql(`select payload->>'reason' from public.notifications where order_id = '${o2.id}' and template = 'delivery_failed' and channel = 'sms'`) === 'customer_unreachable', 'failed delivery recorded and customer told why');
  await S.ops.rpc('admin_dispatch_order', { p_order_id: o2.id, p_rider_id: rider, p_note: 'Second try' });
  await S.ops.rpc('admin_mark_delivery_failed', { p_order_id: o2.id, p_reason: 'customer_absent' });
  assert((await errOf(S.ops.rpc('admin_dispatch_order', { p_order_id: o2.id, p_rider_id: rider })))?.message.includes('limit'), 'attempts capped by the store setting');
  const before2 = stock('rosehip-face-oil', '30');
  await S.ops.rpc('admin_return_to_stock', { p_order_id: o2.id, p_note: 'Back from rider' });
  assert(status(o2.id) === 'returned' && sql(`select refund_due from public.orders where id = '${o2.id}'`) === 't', 'returned order flagged for refund');
  assert(stock('rosehip-face-oil', '30') === `${Number(before2.split('/')[0]) + 1}/0`, 'returned unit back on sale');

  // --- Cancellations ------------------------------------------------------------------------
  const o3 = await placeAndPay([{ slug: 'argan-hair-oil', quantity: 2 }]);
  assert(stock('argan-hair-oil') === '23/0', 'paid');
  await S.ops.rpc('admin_cancel_order', { p_order_id: o3.id, p_reason: 'Customer called to cancel' });
  assert(status(o3.id) === 'cancelled' && stock('argan-hair-oil') === '25/0' && sql(`select refund_due from public.orders where id = '${o3.id}'`) === 't', 'cancelling a paid order restocks and flags a refund');
  const o4 = await placeAndPay([{ slug: 'argan-hair-oil', quantity: 1 }]);
  await S.ops.rpc('admin_pack_orders', { p_order_ids: [o4.id] });
  await S.ops.rpc('admin_cancel_order', { p_order_id: o4.id, p_reason: 'Duplicate order' });
  assert(stock('argan-hair-oil') === '25/0' && sql("select quantity from public.stock_batches b join public.products p on p.id = b.product_id where p.slug = 'argan-hair-oil'") === '25', 'cancelling a packed order puts units back in the batch');
  assert(sql(`select string_agg(template, ',') from public.notifications where order_id = '${o4.id}' and channel = 'sms'`).endsWith('order_cancelled'), 'customer told about the cancellation');
  const { data: pend } = await anon.rpc('place_order', { p_customer: { name: 'Pending', phone: '0241234567', area: 'Osu' }, p_delivery_option: 'same_day', p_payment: { method: 'momo', network: 'mtn', wallet: '0241234567' }, p_items: [{ slug: 'argan-hair-oil', quantity: 1 }], p_is_gift: false }).single();
  const pendId = sql(`select id from public.orders where order_number = '${pend.order_number}'`);
  await S.ops.rpc('admin_cancel_order', { p_order_id: pendId, p_reason: 'Test order' });
  assert(status(pendId) === 'cancelled' && stock('argan-hair-oil') === '25/0' && sql(`select count(*) from public.notifications where order_id = '${pendId}'`) === '0', 'cancelling an unpaid order releases the hold without messaging');
  assert((await errOf(S.ops.rpc('admin_cancel_order', { p_order_id: o1.id, p_reason: 'x' })))?.message.includes("can't be cancelled"), 'delivered orders cannot be cancelled');

  // --- Batch controls, recall, expiry ------------------------------------------------------------
  const baby = (code) => sql(`select b.id from public.stock_batches b join public.products p on p.id = b.product_id where p.slug = 'gentle-baby-wash-shampoo' and b.size_code = '${code}'`);
  await S.ops.rpc('admin_receive_stock', { p_product_id: sql("select id from public.products where slug = 'gentle-baby-wash-shampoo'"), p_size_code: '200', p_batch_code: 'BW-2', p_expires_on: '2026-12-31', p_quantity: 4 });
  assert(stock('gentle-baby-wash-shampoo', '200') === '29/0', 'second batch received');
  const o5 = await placeAndPay([{ slug: 'gentle-baby-wash-shampoo', size: '200', quantity: 2 }]);
  await S.ops.rpc('admin_pack_orders', { p_order_ids: [o5.id] });
  const bw2 = sql("select b.id from public.stock_batches b where b.batch_code = 'BW-2'");
  assert(sql(`select quantity from public.order_item_batches where batch_id = '${bw2}'`) === '2', 'packing picked the batch expiring first');
  assert((await errOf(S.ops.rpc('admin_set_batch_status', { p_batch_id: bw2, p_status: 'recalled', p_note: '' })))?.message.includes('note'), 'recall needs a note');
  await S.ops.rpc('admin_set_batch_status', { p_batch_id: bw2, p_status: 'recalled', p_note: 'Supplier recall notice 12' });
  assert(stock('gentle-baby-wash-shampoo', '200') === '25/0' && sql(`select needs_review from public.orders where id = '${o5.id}'`) === 't', 'recalled batch off sale and packed order flagged');
  assert((await errOf(S.ops.rpc('admin_set_batch_status', { p_batch_id: bw2, p_status: 'available', p_note: 'x' })))?.message.includes('written off'), 'recall is final');
  await S.ops.rpc('admin_write_off_batch', { p_batch_id: bw2, p_note: 'Destroyed' });
  assert(sql(`select quantity from public.stock_batches where id = '${bw2}'`) === '0', 'recalled batch written off');
  const b400 = baby('400');
  await S.ops.rpc('admin_set_batch_status', { p_batch_id: b400, p_status: 'quarantined', p_note: 'Leaking caps' });
  assert(stock('gentle-baby-wash-shampoo', '400') === '0/0' && (await anon.from('inventory_levels').select('in_stock').eq('size_code', '400')).data[0].in_stock === false, 'quarantine takes a batch off sale');
  await S.ops.rpc('admin_adjust_batch', { p_batch_id: b400, p_change: -5, p_reason: 'damaged', p_note: 'Leaked' });
  await S.ops.rpc('admin_set_batch_status', { p_batch_id: b400, p_status: 'available', p_note: 'Checked' });
  assert(stock('gentle-baby-wash-shampoo', '400') === '20/0', 'released batch back on sale, less the damaged units');
  assert((await errOf(S.ops.rpc('admin_adjust_batch', { p_batch_id: b400, p_change: -50, p_reason: 'lost', p_note: 'x' })))?.message.includes('only has'), 'batch count cannot go below zero');
  sql(`update public.stock_batches set expires_on = current_date - 1 where id = '${b400}'`);
  assert(sql('select public.expire_batches()') === '1' && stock('gentle-baby-wash-shampoo', '400') === '0/0', 'expired batch taken off sale by the daily job');
  const { data: exp } = await S.ro.rpc('admin_expiring_batches');
  assert(exp.some((b) => b.batch_id === b400 && b.status === 'expired'), 'expired batch listed for write-off');
  const { data: ov2 } = await S.ro.rpc('admin_stock_overview');
  assert(ov2.find((r) => r.slug === 'gentle-baby-wash-shampoo' && r.size_code === '400').is_low === true, 'low stock flagged');
  // Recall a whole product
  await S.cat.rpc('admin_recall_product', { p_product_id: pid, p_reason: 'Contamination report' });
  assert(sql(`select is_published::text || ' ' || (recalled_at is not null)::text from public.products where id = '${pid}'`) === 'false true' && stock('rosehip-face-oil', '30') === '0/0', 'product recall unpublishes and takes all stock off sale');
  const { data: rp } = await S.cat.rpc('admin_set_product_published', { p_product_id: pid, p_published: true });
  assert(rp.includes('recall lifted'), 'recalled product cannot be republished until the recall is lifted');
  assert((await errOf(S.cat.rpc('admin_lift_recall', { p_product_id: pid })))?.code === '42501', 'only admins lift recalls');

  // --- Ledger adds up --------------------------------------------------------------------------------
  const sku = sql("select count(*) from public.inventory_levels i where i.on_hand <> coalesce((select sum(m.sellable_change) from public.stock_movements m where m.product_id = i.product_id and m.size_code = i.size_code), 0)");
  const bat = sql("select count(*) from public.stock_batches b where b.quantity <> coalesce((select sum(m.quantity) from public.stock_movements m where m.batch_id = b.id), 0)");
  assert(sku === '0' && bat === '0', `stock ledger reconciles with stock levels and batches (${sku} SKUs, ${bat} batches off)`);
  assert((await S.ops.from('stock_movements').select('reason, actor_email').eq('reason', 'damaged')).data[0].actor_email === `ops+${stamp}@example.com`, 'movements record who made them');

  // --- Secrets staff must not read ------------------------------------------------------------------
  assert((await S.ops.from('orders').select('delivery_code').limit(1)).error?.code === '42501', 'staff cannot read delivery codes');
  assert((await S.admin.from('orders').select('public_token').limit(1)).error?.code === '42501', 'staff cannot read order-page tokens');
  assert((await S.ops.from('notifications').select('payload').limit(1)).error?.code === '42501', 'staff cannot read message contents (they include the code)');
  assert((await S.ops.from('orders').select('order_number, refund_due').limit(1)).error === null, 'staff can read the other order columns');
  const { data: shopperOrder } = await S.shopper.rpc('place_order', { p_customer: { name: 'Shopper', phone: '0241234567', area: 'Osu' }, p_delivery_option: 'same_day', p_payment: { method: 'momo', network: 'mtn', wallet: '0241234567' }, p_items: [{ slug: 'argan-hair-oil', quantity: 1 }], p_is_gift: false }).single();
  const { data: mine } = await S.shopper.rpc('my_orders');
  assert(mine.length === 1 && mine[0].order_token === shopperOrder.order_token && mine[0].item_count === 1, 'shoppers list their own orders with links');
  assert((await S.cat.rpc('my_orders')).data.length === 0, 'my_orders shows only the caller\'s orders, even for staff');
  const { data: o1page } = await anon.rpc('get_order', { p_order_token: o1.order_token });
  assert(o1page.items[0].batches.map((b) => b.code).join(',') === 'RH-EARLY,RH-LATE', 'order page lists the batches each line was packed from');
  const { data: cur } = await anon.rpc('product_current_batches', { p_slug: 'gentle-baby-wash-shampoo' });
  assert(cur.find((b) => b.size_code === '200')?.batch_code === 'STARTER', 'product page shows the batch a shopper gets next');

  // --- Notification outbox -------------------------------------------------------------------------------
  const { data: claimed } = await admin.rpc('claim_notifications', { p_limit: 3 });
  assert(claimed.length === 3 && claimed.every((n) => n.attempts === 1), 'sender claims due messages');
  await admin.rpc('finish_notification', { p_id: claimed[0].id, p_outcome: 'sent', p_provider: 'console', p_reference: 'x' });
  await admin.rpc('finish_notification', { p_id: claimed[1].id, p_outcome: 'failed', p_error: 'timeout' });
  await admin.rpc('finish_notification', { p_id: claimed[2].id, p_outcome: 'not_sent', p_error: 'No SMS provider is set up' });
  assert(sql(`select string_agg(status::text, ',' order by array_position(array['${claimed.map((c) => c.id).join("','")}']::uuid[], id)) from public.notifications where id in ('${claimed.map((c) => c.id).join("','")}')`) === 'sent,queued,not_sent', 'failures are queued for retry');
  assert((await errOf(anon.rpc('claim_notifications', { p_limit: 1 }))) && (await errOf(S.admin.rpc('claim_notifications', { p_limit: 1 }))), 'only the server can claim messages');

  console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
  process.exitCode = failures ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });
