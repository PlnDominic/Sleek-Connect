// Database checks for running a marketplace: vendors pack their own paid orders, staff collect before dispatch,
// vendors are paid what they earn (less returns), notifications and messages, the stores directory and ratings,
// sales reports, the change shown on re-review, and paying the yearly subscription online.
const { URL_, KEY, sql, admin, createUser, staffSession, createClient } = require('./lib.cjs');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const errOf = async (p) => { const r = await p; return r.error; };
const rows = async (q) => (await q).data ?? [];
const anon = createClient(URL_, KEY, { auth: { persistSession: false } });
const stamp = Date.now();

const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
const product = (extra = {}) => ({
  name: 'Shea Butter', brand: 'Ama Naturals', department: 'beauty', kind: 'jar', category_id: 'beauty-kits',
  price_ghs: 100, publish: true, description: 'Rich, unrefined shea butter.', ingredients: 'Shea butter',
  warnings: 'For external use only.', country_of_origin: 'Ghana', regulatory_reference: 'FDA/GH/2026/0001', ...extra,
});

(async () => {
  sql("update public.delivery_options set fee_ghs = 20 where id = 'standard'");
  const staff = {};
  for (const [k, role] of [['boss', 'admin'], ['ops', 'operations'], ['fin', 'finance'], ['sup', 'support']]) {
    await createUser(`${k}+${stamp}@example.com`);
    sql(`insert into public.staff_members (email, role) values ('${k}+${stamp}@example.com', '${role}')`);
    staff[k] = (await staffSession(`${k}+${stamp}@example.com`)).client;
  }
  await createUser(`ama+${stamp}@example.com`);
  await createUser(`kofi+${stamp}@example.com`);
  const ama = (await staffSession(`ama+${stamp}@example.com`)).client;
  const kofi = (await staffSession(`kofi+${stamp}@example.com`)).client;
  const amaId = (await ama.auth.getUser()).data.user.id;

  // --- A live vendor with one approved product -------------------------------------------------
  const idPath = `${amaId}/id.png`;
  await ama.storage.from('vendor-ids').upload(idPath, png, { contentType: 'image/png' });
  const { data: vendorId, error: applyError } = await ama.rpc('vendor_apply', {
    p_name: 'Ama Hub', p_owner_name: 'Ama Owusu', p_email: 'ama@example.com', p_phone: '0241234567',
    p_id_type: 'ghana_card', p_id_number: 'GHA-123456789-0', p_id_path: idPath, p_tagline: 'Glow every day', p_accept_terms: true,
  });
  assert(!applyError && vendorId, 'a vendor applies');
  assert(sql(`select count(*) from public.notifications where vendor_id = '${vendorId}' and template = 'vendor_application_received'`) === '2', 'the application is acknowledged by SMS and email');
  await staff.boss.rpc('admin_review_vendor', { p_vendor_id: vendorId, p_decision: 'active', p_note: 'Welcome' });
  assert(sql(`select count(*) from public.notifications where vendor_id = '${vendorId}' and template = 'vendor_approved'`) === '2', 'approval is texted and emailed to the vendor');
  await staff.boss.rpc('admin_record_subscription', { p_vendor_id: vendorId, p_amount_ghs: 300, p_method: 'momo', p_reference: 'MM1' });
  assert(sql(`select count(*) from public.notifications where vendor_id = '${vendorId}' and template = 'vendor_subscription_paid'`) === '2', 'a recorded subscription payment is confirmed to the vendor');
  const { data: saved } = await ama.rpc('vendor_save_product', { p: product() });
  const productId = saved.id;
  await ama.rpc('vendor_set_stock', { p_product_id: productId, p_size_code: '', p_quantity: 10 });
  await staff.boss.rpc('admin_review_product', { p_product_id: productId, p_decision: 'approved', p_markup_percent: 20 });
  assert(sql(`select count(*) from public.notifications where vendor_id = '${vendorId}' and template = 'vendor_product_reviewed'`) === '2', 'a product decision is sent to the vendor');
  await staff.boss.rpc('admin_set_marketplace_settings', { p: { marketplace_orders_open: true } });

  // --- A mixed order: one vendor line, one from our own range ----------------------------------
  const { data: order, error: orderError } = await anon.rpc('place_order', {
    p_customer: { name: 'Kofi Mensah', phone: '024 123 4567', area: 'East Legon' },
    p_delivery_option: 'standard', p_payment: { method: 'momo', network: 'mtn', wallet: '024 765 4321' },
    p_items: [{ slug: saved.slug, quantity: 2 }, { slug: 'argan-hair-oil', quantity: 1 }], p_is_gift: false,
  }).single();
  assert(!orderError, 'a shopper orders from a vendor and from the shop in one go');
  const orderId = sql(`select id from public.orders where order_number = '${order.order_number}'`);
  assert(sql(`select count(*) from public.order_shipments where order_id = '${orderId}'`) === '1', 'the vendor\'s part of the order gets its own shipment');
  assert(sql(`select count(*) from public.order_items where order_id = '${orderId}' and vendor_id = '${vendorId}'`) === '1', 'only the vendor\'s line is theirs');
  assert((await ama.rpc('vendor_orders')).data.length === 0, 'the vendor sees nothing until the order is paid');
  assert((await kofi.rpc('vendor_orders')).error !== null, 'someone without a store has no vendor orders');

  const ref = `T-${order.order_number}`;
  await admin.rpc('start_payment', { p_order_token: order.order_token, p_provider: 'test', p_reference: ref });
  await admin.rpc('confirm_payment', { p_provider: 'test', p_reference: ref, p_status: 'succeeded', p_amount_ghs: order.total_ghs });
  const mine = (await ama.rpc('vendor_orders')).data;
  assert(mine.length === 1 && mine[0].order_number === order.order_number && mine[0].shipment_status === 'pending', 'once paid, the vendor sees the order, waiting to be packed');
  assert(mine[0].lines.length === 1 && mine[0].lines[0].quantity === 2 && Number(mine[0].amount_ghs) === 200, 'with only their lines, at their own prices');
  const shown = JSON.stringify(mine);
  assert(!shown.includes('Kofi') && !shown.includes('024') && !shown.includes('East Legon') && !shown.includes('delivery_code') && !shown.includes(order.order_token), 'and nothing about the shopper, their address or delivery code');
  assert(sql(`select count(*) from public.notifications where vendor_id = '${vendorId}' and template = 'vendor_new_order'`) === '2', 'the vendor is told about the new order');
  assert((await errOf(ama.rpc('vendor_mark_packed', { p_order_id: '00000000-0000-0000-0000-000000000009' }))) !== null, 'a vendor cannot pack an order that is not theirs');
  assert((await rows(anon.from('order_shipments').select('order_id'))).length === 0 && (await rows(ama.from('order_shipments').select('order_id'))).length === 0, 'shipments are visible to staff only');

  // --- Packing and hand-over --------------------------------------------------------------------
  const picked = (await staff.ops.rpc('admin_pick_list', { p_order_id: orderId })).data;
  assert(picked.length === 1 && picked[0].product_name === 'Argan Hair Oil', 'the pick list holds only the shop\'s own items');
  const early = (await staff.ops.rpc('admin_pack_orders', { p_order_ids: [orderId] })).data;
  assert(early[0].ok === false && early[0].message.includes('Waiting for Ama Hub'), 'staff cannot pack the order until the vendor has packed theirs');
  assert((await errOf(staff.fin.rpc('admin_collect_vendor_items', { p_order_id: orderId, p_vendor_id: vendorId })))?.code === '42501', 'only operations staff collect from vendors');
  assert((await errOf(staff.ops.rpc('admin_collect_vendor_items', { p_order_id: orderId, p_vendor_id: vendorId })))?.message.includes('packed'), 'and only what the vendor has packed');
  assert(!(await errOf(ama.rpc('vendor_mark_packed', { p_order_id: orderId }))), 'the vendor marks their items packed');
  assert((await ama.rpc('vendor_orders')).data[0].shipment_status === 'packed', 'the order shows as packed');
  const packed = (await staff.ops.rpc('admin_pack_orders', { p_order_ids: [orderId] })).data;
  assert(packed[0].ok === true, 'now staff can pack the rest');
  const { data: rider } = await staff.ops.rpc('admin_save_rider', { p_id: null, p_name: 'Kofi Asante', p_phone: '020 111 2222', p_vehicle: 'Motorbike' });
  assert((await errOf(staff.ops.rpc('admin_dispatch_order', { p_order_id: orderId, p_rider_id: rider })))?.message.includes('Collect the items from Ama Hub'), 'the order cannot go out before the vendor\'s items are collected');
  const waiting = (await staff.ops.rpc('admin_vendor_shipments')).data;
  assert(waiting.length === 1 && waiting[0].status === 'packed' && waiting[0].items[0].quantity === 2, 'staff see the packed bag waiting for collection');
  assert(!(await errOf(staff.ops.rpc('admin_collect_vendor_items', { p_order_id: orderId, p_vendor_id: vendorId }))), 'staff collect it');
  assert(!(await errOf(staff.ops.rpc('admin_dispatch_order', { p_order_id: orderId, p_rider_id: rider }))), 'and the order can be dispatched');
  assert(sql(`select status from public.order_shipments where order_id = '${orderId}'`) === 'collected', 'the shipment is marked collected');

  // --- Delivery, earnings and payouts -----------------------------------------------------------
  const before = (await ama.rpc('vendor_statement')).data;
  assert(Number(before.earned) === 0 && Number(before.pending) === 200 && Number(before.balance) === 0, 'earnings are pending while the order is on its way');
  const code = sql(`select delivery_code from public.orders where id = '${orderId}'`);
  await staff.ops.rpc('admin_mark_delivered', { p_order_id: orderId, p_recipient: 'Kofi', p_code: code });
  let statement = (await ama.rpc('vendor_statement')).data;
  assert(Number(statement.earned) === 200 && Number(statement.balance) === 200 && statement.deliveries.length === 1, 'delivery turns the vendor\'s share into earnings');
  assert(!JSON.stringify(statement).includes('Kofi') && !JSON.stringify(statement).includes(code), 'and the statement shows no shopper details');

  const oi = sql(`select id from public.order_items where order_id = '${orderId}' and vendor_id = '${vendorId}'`);
  await anon.rpc('request_return', { p_order_token: order.order_token, p_items: [{ order_item_id: oi, quantity: 1 }], p_reason: 'changed_mind', p_note: 'nope', p_photo_paths: [] });
  const rid = sql(`select id from public.return_requests where order_id = '${orderId}'`);
  statement = (await ama.rpc('vendor_statement')).data;
  assert(Number(statement.balance) === 200 && statement.returns.length === 1, 'a requested return is listed but changes nothing yet');
  await staff.sup.rpc('admin_decide_return', { p_return_id: rid, p_approve: true, p_note: 'ok' });
  await staff.ops.rpc('admin_receive_return', { p_return_id: rid, p_outcomes: [{ order_item_id: oi, outcome: 'restock' }] });
  assert(sql(`select on_hand from public.inventory_levels where product_id = '${productId}' and size_code = ''`) === '9', 'a returned vendor item goes back into the vendor\'s own stock');
  statement = (await ama.rpc('vendor_statement')).data;
  assert(Number(statement.returned) === 100 && Number(statement.balance) === 100, 'a received return comes off what the vendor is owed, at their price');

  assert((await errOf(ama.rpc('vendor_set_payout_account', { p_network: 'visa', p_wallet: '0241234567', p_name: 'Ama Owusu' })))?.message !== undefined, 'only real Mobile Money networks are accepted');
  assert(!(await errOf(ama.rpc('vendor_set_payout_account', { p_network: 'mtn', p_wallet: '0241234567', p_name: 'Ama Owusu' }))), 'a vendor saves where to be paid');
  assert((await errOf(ama.rpc('admin_record_payout', { p_vendor_id: vendorId, p_amount_ghs: 10, p_method: 'momo', p_reference: 'X' })))?.code === '42501', 'vendors cannot pay themselves');
  assert((await errOf(staff.ops.rpc('admin_record_payout', { p_vendor_id: vendorId, p_amount_ghs: 10, p_method: 'momo', p_reference: 'X' })))?.code === '42501', 'only finance records payouts');
  assert((await errOf(staff.fin.rpc('admin_record_payout', { p_vendor_id: vendorId, p_amount_ghs: 50, p_method: 'momo' })))?.message.includes('reference'), 'a payout needs the transaction reference');
  assert((await errOf(staff.fin.rpc('admin_record_payout', { p_vendor_id: vendorId, p_amount_ghs: 500, p_method: 'momo', p_reference: 'T1' })))?.message.includes('owed'), 'a payout cannot exceed what is owed');
  const left = (await staff.fin.rpc('admin_record_payout', { p_vendor_id: vendorId, p_amount_ghs: 40, p_method: 'momo', p_reference: 'MM999' })).data;
  assert(Number(left) === 60, 'finance records a payment and sees what is still owed');
  assert(sql(`select count(*) from public.notifications where vendor_id = '${vendorId}' and template = 'vendor_payout_sent'`) === '2', 'the vendor is told they were paid');
  const balances = (await staff.fin.rpc('admin_vendor_balances')).data;
  assert(balances.length === 1 && Number(balances[0].balance) === 60 && balances[0].payout_wallet === '0241234567', 'finance sees the balance with the payout account');
  assert((await staff.fin.rpc('admin_vendor_payouts')).data.length === 1, 'and the payment history');
  assert((await rows(anon.from('vendor_payouts').select('id'))).length === 0 && (await rows(kofi.from('vendor_payouts').select('id'))).length === 0, 'payouts are private');
  assert((await errOf(staff.sup.rpc('admin_vendor_balances')))?.code === '42501', 'support cannot see what vendors are owed');

  // --- Messages between vendor and owner ---------------------------------------------------------
  assert(!(await errOf(ama.rpc('vendor_send_message', { p_body: 'When do payouts happen?' }))), 'a vendor writes to the owner');
  assert((await errOf(ama.rpc('vendor_send_message', { p_body: '   ' })))?.message !== undefined, 'empty messages are refused');
  assert((await errOf(kofi.rpc('vendor_send_message', { p_body: 'hi' }))) !== null, 'only vendors can write');
  const threads = (await staff.boss.rpc('admin_vendor_threads')).data;
  assert(threads.length === 1 && threads[0].unread === 1, 'the owner sees one unread conversation');
  assert((await errOf(staff.sup.rpc('admin_vendor_threads')))?.code === '42501', 'support staff cannot read vendor conversations');
  await staff.boss.rpc('admin_reply_vendor', { p_vendor_id: vendorId, p_body: 'Every Friday.' });
  assert((await staff.boss.rpc('admin_vendor_thread', { p_vendor_id: vendorId })).data.length === 2, 'the thread has both messages');
  assert((await staff.boss.rpc('admin_vendor_threads')).data[0].unread === 0, 'reading it clears the owner\'s unread count');
  assert((await ama.rpc('vendor_unread_messages')).data === 1, 'the vendor has one unread reply');
  assert((await ama.rpc('vendor_messages')).data.length === 2 && (await ama.rpc('vendor_unread_messages')).data === 0, 'opening the messages marks them read');
  assert(sql(`select count(*) from public.notifications where vendor_id = '${vendorId}' and template = 'vendor_message_reply'`) === '2', 'and a reply is texted to the vendor');
  assert((await kofi.rpc('vendor_messages')).error !== null && (await rows(anon.from('vendor_messages').select('id'))).length === 0, 'conversations are private');

  // --- Sales report -------------------------------------------------------------------------------
  const report = (await ama.rpc('vendor_report', { p_days: 7 })).data;
  assert(report.days.length === 7 && Number(report.totals.revenue) === 200 && report.totals.units === 2 && report.totals.orders === 1, 'the report adds up the vendor\'s paid sales');
  assert(report.top_products[0].name === 'Shea Butter' && report.top_products[0].units === 2, 'and ranks their best sellers');
  assert((await kofi.rpc('vendor_report', { p_days: 7 })).error !== null, 'reports are for vendors only');

  // --- Stores directory and ratings -----------------------------------------------------------------
  assert((await anon.rpc('store_directory')).data.some((s) => s.slug === 'ama-hub') && !(await anon.rpc('store_directory')).data.some((s) => s.is_house), 'open vendor stores are listed publicly, never the house');
  const rating0 = (await anon.rpc('store_rating', { p_slug: 'ama-hub' })).data;
  assert(rating0.count === 0, 'a new store has no ratings');
  const kofiId = (await kofi.auth.getUser()).data.user.id;
  sql(`insert into public.product_reviews (product_id, user_id, rating, title, body, display_name, status)
       values ('${productId}', '${kofiId}', 5, 'Lovely', 'Smooth and smells great', 'Esi', 'published'),
              ('${productId}', '${amaId}', 3, 'Hidden', 'Not yet moderated at all', 'Yaw', 'pending')`);
  const rating1 = (await anon.rpc('store_rating', { p_slug: 'ama-hub' })).data;
  assert(rating1.count === 1 && Number(rating1.average) === 5, 'a store\'s rating counts only published reviews of its products');
  const reviews = (await anon.rpc('store_reviews', { p_slug: 'ama-hub' })).data;
  assert(reviews.length === 1 && reviews[0].display_name === 'Esi' && !JSON.stringify(reviews).includes('Yaw'), 'and its page shows those reviews, without account details');

  // --- What changed when an approved product goes back for review ------------------------------------
  await ama.rpc('vendor_save_product', { p: product({ id: productId, name: 'Shea Butter Deluxe' }) });
  const queued = (await staff.boss.rpc('admin_vendor_products', { p_status: 'pending' })).data;
  assert(queued.length === 1 && queued[0].review_previous?.name === 'Shea Butter' && queued[0].name === 'Shea Butter Deluxe', 'the owner can see what the vendor changed');
  await staff.boss.rpc('admin_review_product', { p_product_id: productId, p_decision: 'approved', p_markup_percent: 20 });
  assert(sql(`select review_previous is null from public.products where id = '${productId}'`) === 't', 'the comparison is cleared once the owner decides');

  // --- Renewal reminders ---------------------------------------------------------------------------------
  sql(`update public.vendor_subscriptions set ends_on = current_date + 7, starts_on = current_date - 358 where vendor_id = '${vendorId}'`);
  assert(sql('select public.queue_vendor_renewal_reminders()') === '1', 'a vendor whose year ends in a week is due a reminder');
  assert(sql(`select count(*) from public.notifications where vendor_id = '${vendorId}' and template = 'vendor_renewal_reminder'`) === '2', 'sent by SMS and email');
  assert((await errOf(anon.rpc('queue_vendor_renewal_reminders'))) !== null, 'the reminder job is not callable from the browser');

  // --- Paying the subscription online --------------------------------------------------------------------
  const { data: fee, error: startError } = await ama.rpc('start_vendor_subscription_payment', { p_provider: 'test', p_reference: `SUB-${stamp}` });
  assert(!startError && Number(fee) === 300, 'a vendor starts an online payment for the yearly fee set by the owner');
  assert((await kofi.rpc('start_vendor_subscription_payment', { p_provider: 'test', p_reference: `SUB-X${stamp}` })).error !== null, 'only vendors can start one');
  assert((await errOf(ama.rpc('confirm_subscription_payment', { p_provider: 'test', p_reference: `SUB-${stamp}`, p_status: 'succeeded', p_amount_ghs: 300 }))) !== null, 'a vendor cannot confirm their own payment');
  const endsBefore = sql(`select max(ends_on) from public.vendor_subscriptions where vendor_id = '${vendorId}'`);
  await ama.rpc('start_vendor_subscription_payment', { p_provider: 'test', p_reference: `SUB-W${stamp}` });
  const wrong = await admin.rpc('confirm_subscription_payment', { p_provider: 'test', p_reference: `SUB-W${stamp}`, p_status: 'succeeded', p_amount_ghs: 100 });
  assert(!wrong.error && wrong.data === null && sql(`select max(ends_on) from public.vendor_subscriptions where vendor_id = '${vendorId}'`) === endsBefore, 'a payment for the wrong amount does not renew the store');
  assert(sql("select count(*) from public.audit_log where action = 'vendor.subscription_payment_mismatch'") === '1', 'and is recorded for the owner to sort out');
  const paid = await admin.rpc('confirm_subscription_payment', { p_provider: 'test', p_reference: `SUB-${stamp}`, p_status: 'succeeded', p_amount_ghs: 300 });
  assert(!paid.error && paid.data > endsBefore, 'a verified payment of the right amount renews the subscription');
  const again = await admin.rpc('confirm_subscription_payment', { p_provider: 'test', p_reference: `SUB-${stamp}`, p_status: 'succeeded', p_amount_ghs: 300 });
  assert(!again.error && sql(`select count(*) from public.vendor_subscriptions where vendor_id = '${vendorId}'`) === '2', 'a repeated notification does not renew twice');
  assert((await rows(ama.from('vendor_subscription_payments').select('id'))).length === 2 && (await rows(kofi.from('vendor_subscription_payments').select('id'))).length === 0, 'vendors see only their own payment attempts');

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll vendor operations database checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
