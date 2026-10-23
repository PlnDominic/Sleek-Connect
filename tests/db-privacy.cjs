// Database checks: saved Mobile Money numbers, product reviews with moderation, data export and account deletion.
const crypto = require('crypto');
const { URL_, KEY, sql, admin, createUser, staffSession, createClient } = require('./lib.cjs');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const errOf = async (p) => { const r = await p; return r.error; };
const anon = createClient(URL_, KEY, { auth: { persistSession: false } });
const stamp = Date.now();
const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');

const order = (client, items, { name = 'Ama Owusu' } = {}) =>
  client.rpc('place_order', {
    p_customer: { name, phone: '024 123 4567', area: 'Osu', ghanapost_gps: 'GA-123-4567', directions: 'Blue gate' },
    p_delivery_option: 'standard',
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
const deliver = (number) => sql(`update public.orders set status = 'delivered', delivered_at = now() where order_number = '${number}'`);

(async () => {
  sql("update public.delivery_options set fee_ghs = 20 where id = 'standard'");
  const S = {};
  for (const [k, role] of [['cat', 'catalogue'], ['sup', 'support'], ['fin', 'finance'], ['boss', 'admin']]) {
    await createUser(`${k}+${stamp}@example.com`);
    sql(`insert into public.staff_members (email, role) values ('${k}+${stamp}@example.com', '${role}')`);
    S[k] = (await staffSession(`${k}+${stamp}@example.com`)).client;
  }
  const people = {};
  for (const k of ['ama', 'kofi', 'esi']) {
    await createUser(`${k}+${stamp}@example.com`);
    people[k] = await staffSession(`${k}+${stamp}@example.com`);
  }
  const ama = people.ama.client, kofi = people.kofi.client, esi = people.esi.client;

  // --- Saved Mobile Money numbers ---------------------------------------------------------------
  const momo = { network: 'mtn', wallet_number: '024 765 4321' };
  assert((await errOf(anon.rpc('save_payment_method', { p: momo })))?.code !== undefined, 'guests cannot save a number');
  assert((await errOf(ama.rpc('save_payment_method', { p: { ...momo, network: 'visa' } })))?.message.includes('network'), 'the network must be a Mobile Money network');
  assert((await errOf(ama.rpc('save_payment_method', { p: { ...momo, wallet_number: '12' } })))?.message.includes('valid'), 'the number must look like a phone number');
  assert((await errOf(ama.rpc('save_payment_method', { p: { ...momo, wallet_number: '024 765 4321 <script>' } })))?.message.includes('valid'), 'letters and symbols are refused');
  const { data: m1 } = await ama.rpc('save_payment_method', { p: momo });
  await ama.rpc('save_payment_method', { p: { network: 'telecel', wallet_number: '050 111 2222', label: 'Work' } });
  let methods = (await ama.from('saved_payment_methods').select('id, network, is_default, label').order('created_at')).data;
  assert(methods.length === 2 && methods[0].is_default && !methods[1].is_default && methods[1].label === 'Work', 'the first number is the default');
  const { data: again } = await ama.rpc('save_payment_method', { p: { network: 'mtn', wallet_number: '0247654321', label: 'Mine' } });
  methods = (await ama.from('saved_payment_methods').select('id, label').order('created_at')).data;
  assert(again === m1 && methods.length === 2 && methods[0].label === 'Mine', 'saving the same number again updates it instead of adding a copy');
  await ama.rpc('save_payment_method', { p: { network: 'telecel', wallet_number: '050 111 2222', is_default: true } });
  methods = (await ama.from('saved_payment_methods').select('network, is_default').order('created_at')).data;
  assert(!methods[0].is_default && methods[1].is_default, 'another number can become the default');
  assert((await kofi.from('saved_payment_methods').select('id')).data.length === 0 && (await anon.from('saved_payment_methods').select('id')).data.length === 0, 'saved numbers are private');
  await kofi.rpc('delete_payment_method', { p_id: m1 });
  assert((await ama.from('saved_payment_methods').select('id')).data.length === 2, 'nobody else can remove your number');
  await ama.rpc('delete_payment_method', { p_id: (await ama.from('saved_payment_methods').select('id').eq('is_default', true)).data[0].id });
  methods = (await ama.from('saved_payment_methods').select('network, is_default')).data;
  assert(methods.length === 1 && methods[0].is_default, 'removing the default hands the default to the one left');
  for (const n of ['0241000001', '0241000002', '0241000003', '0241000004']) await ama.rpc('save_payment_method', { p: { network: 'at', wallet_number: n } });
  assert((await errOf(ama.rpc('save_payment_method', { p: { network: 'at', wallet_number: '0241000009' } })))?.message.includes('up to 5'), 'at most 5 numbers');

  // --- Reviews ---------------------------------------------------------------------------------
  const slug = 'vitamin-c-brightening-serum';
  const review = { p_slug: slug, p_rating: 5, p_title: 'Glowing', p_body: 'My skin looks brighter after two weeks.' };
  assert((await errOf(anon.rpc('submit_review', review)))?.code !== undefined, 'guests cannot review');
  assert((await errOf(ama.rpc('submit_review', review)))?.message.includes('received this product'), 'only people who received the product can review it');
  const st0 = (await ama.rpc('my_review_status', { p_slug: slug })).data?.[0];
  assert(st0?.can_review === false && st0.review_id === null, 'the product page knows they can’t review yet');
  const o1 = (await order(ama, [{ slug, size: null, quantity: 1 }])).data;
  await pay(o1);
  assert((await ama.rpc('my_review_status', { p_slug: slug })).data?.[0].can_review === false, 'a paid but undelivered order doesn’t qualify');
  deliver(o1.order_number);
  assert((await ama.rpc('my_review_status', { p_slug: slug })).data?.[0].can_review === true, 'a delivered order qualifies');
  assert((await kofi.rpc('my_review_status', { p_slug: slug })).data?.[0].can_review === false, 'someone else’s delivered order doesn’t');
  assert((await errOf(ama.rpc('submit_review', { ...review, p_rating: 6 })))?.message.includes('1 to 5'), 'ratings are 1 to 5');
  assert((await errOf(ama.rpc('submit_review', { ...review, p_body: 'Nice' })))?.message.includes('10 and 2000'), 'a review needs some words');
  assert((await ama.rpc('submit_review', review)).data === 'pending', 'a new review waits for approval');
  assert(((await anon.rpc('get_product_reviews', { p_slug: slug })).data ?? []).length === 0 && (await anon.rpc('get_review_summary', { p_slug: slug })).data[0].review_count === 0, 'nobody sees it yet');
  assert((await anon.from('product_reviews').select('id')).error !== null || (await anon.from('product_reviews').select('id')).data.length === 0, 'the table isn’t readable by guests');
  assert((await kofi.from('product_reviews').select('id')).data.length === 0, 'or by other shoppers');
  const mine = (await ama.from('product_reviews').select('id, status').eq('status', 'pending')).data;
  assert(mine.length === 1, 'the author sees their own pending review');
  assert((await ama.from('product_reviews').select('user_id')).error !== null, 'but not the account column (staff and shoppers never see who wrote what)');

  assert((await errOf(S.fin.rpc('admin_list_reviews')))?.message.includes('role'), 'finance can’t moderate');
  assert((await errOf(ama.rpc('admin_list_reviews')))?.message.includes('Staff access'), 'shoppers can’t moderate');
  const queue = (await S.cat.rpc('admin_list_reviews')).data;
  assert(queue.length === 1 && queue[0].display_name === 'Ama O.' && queue[0].product_slug === slug && !('user_id' in queue[0]), 'staff see the queue with a short name, never the account');
  assert((await errOf(S.cat.rpc('admin_moderate_review', { p_id: queue[0].id, p_decision: 'reject' })))?.message.includes('reason'), 'a rejection needs a reason');
  assert(!(await errOf(S.sup.rpc('admin_moderate_review', { p_id: queue[0].id, p_decision: 'reject', p_note: 'Please describe the product, not the delivery.' }))), 'support can reject, with a reason');
  const rejected = (await ama.rpc('my_review_status', { p_slug: slug })).data[0];
  assert(rejected.status === 'rejected' && rejected.moderation_note.includes('describe the product'), 'the author sees why');
  assert((await ama.rpc('submit_review', { ...review, p_body: 'The serum absorbs quickly and my skin looks brighter.' })).data === 'pending', 'editing sends it back for approval');
  const again2 = (await S.cat.rpc('admin_list_reviews')).data;
  assert(again2.length === 1 && again2[0].edited === false || again2.length === 1, 'it is back in the queue');
  assert(!(await errOf(S.cat.rpc('admin_moderate_review', { p_id: again2[0].id, p_decision: 'publish' }))), 'catalogue staff can publish');
  const pub = (await anon.rpc('get_product_reviews', { p_slug: slug })).data;
  assert(pub.length === 1 && pub[0].display_name === 'Ama O.' && !('user_id' in pub[0]), 'everyone sees it, with only the short name');
  let sum = (await anon.rpc('get_review_summary', { p_slug: slug })).data[0];
  assert(sum.review_count === 1 && Number(sum.average) === 5 && sum.stars_5 === 1, 'the summary counts it');
  const o2 = (await order(kofi, [{ slug, size: null, quantity: 1 }], { name: 'Kofi Mensah-Boateng' })).data;
  await pay(o2); deliver(o2.order_number);
  await kofi.rpc('submit_review', { p_slug: slug, p_rating: 3, p_title: null, p_body: 'It is fine, nothing special for the price.' });
  const k = (await S.boss.rpc('admin_list_reviews')).data[0];
  assert(k.display_name === 'Kofi M.' && k.title === null, 'names are first name and last initial');
  await S.boss.rpc('admin_moderate_review', { p_id: k.id, p_decision: 'publish' });
  sum = (await anon.rpc('get_review_summary', { p_slug: slug })).data[0];
  assert(sum.review_count === 2 && Number(sum.average) === 4 && sum.stars_3 === 1, 'the average follows');
  assert(sql(`select count(*) from public.audit_log where action in ('review.publish', 'review.reject')`) === '3', 'moderation is audited');
  const counts = (await S.cat.rpc('admin_review_counts')).data[0];
  assert(counts.pending === 0 && counts.published === 2 && counts.rejected === 0, 'staff see the counts');
  await kofi.rpc('delete_my_review', { p_slug: slug });
  assert((await anon.rpc('get_review_summary', { p_slug: slug })).data[0].review_count === 1, 'authors can delete their review');

  // --- Export and delete -----------------------------------------------------------------------
  assert((await errOf(anon.rpc('export_my_data')))?.code !== undefined, 'guests have nothing to export');
  const exp = (await ama.rpc('export_my_data')).data;
  assert(exp.account.email === `ama+${stamp}@example.com` && exp.orders.length === 1 && exp.orders[0].customer_name === 'Ama Owusu' && exp.orders[0].items[0].product === 'Vitamin C Brightening Serum', 'the export has the account and orders');
  assert(exp.payment_methods.length === 5 && exp.reviews.length === 1 && Array.isArray(exp.addresses) && Array.isArray(exp.saved_products) && Array.isArray(exp.bag), 'and saved numbers, reviews, addresses, saved products and bag');
  assert(!JSON.stringify(exp).includes('public_token') && !JSON.stringify(exp).includes('delivery_code'), 'but not the order link or delivery code');
  assert(JSON.stringify((await esi.rpc('export_my_data')).data.orders) === '[]', 'each export holds only your own data');

  // A paid order that hasn't been delivered blocks deletion; so does being staff.
  const o3 = (await order(ama, [{ slug: 'whipped-shea-body-butter', size: null, quantity: 1 }])).data;
  await pay(o3);
  assert(/1 order still in progress/.test((await ama.rpc('account_deletion_blocker')).data), 'an order in progress blocks deletion');
  assert((await errOf(ama.rpc('delete_my_account')))?.message.includes('in progress'), 'and the delete is refused');
  assert((await S.cat.rpc('account_deletion_blocker')).data.includes('staff list'), 'staff accounts can’t be deleted by themselves');
  deliver(o3.order_number);
  assert((await ama.rpc('account_deletion_blocker')).data === null, 'once delivered, nothing blocks it');

  // Support case, return and photo attached to Ama's order.
  const scr = await anon.rpc('create_support_case', { p_topic: 'delivery', p_name: 'Ama Owusu', p_phone: '024 123 4567', p_email: 'ama@example.com', p_message: 'Where is my parcel? I live at the blue gate.', p_order_token: o1.order_token });
  const sc = scr.data;
  assert(!scr.error && sc, `a support case is linked to the order (${JSON.stringify(scr.error)})`);
  const folder = crypto.createHash('sha256').update(o1.order_token).digest('hex');
  const photoPath = `${folder}/${stamp}.png`;
  const up = await ama.storage.from('return-photos').upload(photoPath, png, { contentType: 'image/png' });
  assert(!up.error, 'a shopper can attach a photo to their delivered order');
  const paths = (await ama.rpc('my_return_photo_paths')).data;
  assert(paths.length === 1 && paths[0] === photoPath && (await kofi.rpc('my_return_photo_paths')).data.length === 0, 'the shopper can list their own return photos');
  assert((await kofi.storage.from('return-photos').remove([photoPath])).data?.length === 0, 'nobody else can remove them');
  sql(`insert into public.notifications (order_id, template, channel, recipient, payload) select id, 'order_paid', 'sms', '0241234567', '{}' from public.orders where order_number = '${o1.order_number}'`);

  const gone = (await ama.rpc('delete_my_account'));
  assert(!gone.error && gone.data.orders_anonymised === 2, `the account is deleted (${JSON.stringify(gone.error)} ${JSON.stringify(gone.data)})`);
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 200 });
  assert(!users.users.some((u) => u.email === `ama+${stamp}@example.com`), 'the sign-in is gone');
  assert(sql(`select count(*) from public.customer_addresses a where a.recipient_name = 'Ama Owusu'`) === '0' && sql(`select count(*) from public.saved_payment_methods where network is not null and user_id not in (select id from auth.users)`) === '0', 'saved addresses and numbers are gone');
  const kept = sql(`select customer_name || '|' || phone || '|' || coalesce(ghanapost_gps, '-') || '|' || coalesce(rider_directions, '-') || '|' || wallet_number || '|' || (user_id is null)::text || '|' || total_ghs::text from public.orders where order_number = '${o1.order_number}'`);
  assert(kept === `Deleted customer||-|-||true|${o1.total_ghs}.00`, `the order stays for the shop's records without the customer's details (${kept})`);
  assert(sql(`select message || '|' || name || '|' || phone from public.support_cases where case_number = '${sc}'`).startsWith('[Removed at the customer’s request]|Deleted customer|'), 'support cases are scrubbed');
  assert(sql(`select count(*) from public.notifications where recipient = '0241234567'`) === '0', 'queued messages are dropped');
  assert(sql(`select count(*) from public.product_reviews where display_name = 'Ama O.'`) === '0', 'reviews are removed');
  assert(sql(`select count(*) from public.audit_log where action = 'account.deleted' and actor_email is null and actor_id is null`) === '1', 'the deletion is logged without who it was');
  assert((await kofi.from('saved_payment_methods').select('id')).data.length === 0 && (await esi.rpc('export_my_data')).error === null, 'other accounts are untouched');

  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
