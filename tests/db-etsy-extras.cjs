// Database checks for the Etsy-style extras: following stores, sellers replying to reviews, and Star Seller progress.
const { URL_, KEY, sql, createUser, staffSession, createClient } = require('./lib.cjs');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const errOf = async (p) => { const r = await p; return r.error; };
const anon = createClient(URL_, KEY, { auth: { persistSession: false } });
const stamp = Date.now();

const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
const checks = { photos_ok: true, description_ok: true, claims_ok: true, ingredients_ok: true, expiry_ok: 'na', authentic_ok: true, regulatory_ok: 'na', safety_ok: true };
const product = () => ({
  name: 'Shea Body Butter', brand: 'Ama Naturals', department: 'beauty', kind: 'jar', category_id: 'beauty-kits', price_ghs: 100, publish: true,
  sizes: [{ code: '200ml', label: '200 ml', price_ghs: 100, is_default: true }],
  description: 'Rich, unrefined shea butter.', ingredients: 'Shea butter', warnings: 'For external use only.',
  country_of_origin: 'Ghana', regulatory_reference: 'FDA/GH/2026/0001',
});

(async () => {
  await createUser(`boss+${stamp}@example.com`);
  sql(`insert into public.staff_members (email, role) values ('boss+${stamp}@example.com', 'admin')`);
  const boss = (await staffSession(`boss+${stamp}@example.com`)).client;
  const people = {};
  const ids = {};
  for (const k of ['ama', 'esi', 'kofi', 'r1', 'r2', 'r3', 'r4']) {
    const user = await createUser(`${k}+${stamp}@example.com`);
    ids[k] = user.id;
    people[k] = (await staffSession(`${k}+${stamp}@example.com`)).client;
  }
  const { ama, esi, kofi } = people;

  // A live store with one approved product.
  const idPath = `${ids.ama}/id-${stamp}.png`;
  await ama.storage.from('vendor-ids').upload(idPath, png, { contentType: 'image/png' });
  const { data: vendorId } = await ama.rpc('vendor_apply', {
    p_name: 'Ama Naturals', p_owner_name: 'Ama Owusu', p_email: 'ama@example.com', p_phone: '0241234567',
    p_id_type: 'ghana_card', p_id_number: 'GHA-123456789-0', p_id_path: idPath, p_tagline: null, p_accept_terms: true,
  });
  await boss.rpc('admin_save_vendor_checks', { p_vendor_id: vendorId, p_checks: { id_matches: true, id_valid: true, phone_confirmed: true, products_allowed: true } });
  await boss.rpc('admin_review_vendor', { p_vendor_id: vendorId, p_decision: 'active', p_note: 'Welcome' });
  await boss.rpc('admin_record_subscription', { p_vendor_id: vendorId, p_amount_ghs: 300, p_method: 'momo', p_reference: `MM-${stamp}` });
  const { data: saved } = await ama.rpc('vendor_save_product', { p: product() });
  await boss.rpc('admin_review_product', { p_product_id: saved.id, p_decision: 'approved', p_markup_percent: 10, p_checks: checks });

  // --- Following stores --------------------------------------------------------------------------
  const facts = (await anon.rpc('store_facts', { p_slug: 'ama-naturals' })).data;
  assert(facts.followers === 0 && facts.star_seller === false && facts.orders_delivered === 0 && facts.joined_year === new Date().getFullYear(), 'a live store shows counts and no badge yet');
  assert((await anon.rpc('store_facts', { p_slug: 'no-such-store' })).data === null, 'a store that is not open has no public facts');
  assert((await errOf(anon.rpc('follow_store', { p_slug: 'ama-naturals' })))?.code !== undefined, 'guests cannot follow a store');
  assert(!(await esi.rpc('follow_store', { p_slug: 'ama-naturals' })).error, 'a signed-in shopper can follow a store');
  assert(!(await esi.rpc('follow_store', { p_slug: 'ama-naturals' })).error, 'following twice is harmless');
  assert((await esi.rpc('is_following_store', { p_slug: 'ama-naturals' })).data === true, 'the shopper can see they follow it');
  assert((await kofi.rpc('is_following_store', { p_slug: 'ama-naturals' })).data === false, 'and other shoppers do not');
  const followed = (await esi.rpc('my_followed_stores')).data;
  assert(followed.length === 1 && followed[0].slug === 'ama-naturals' && followed[0].name === 'Ama Naturals', 'followed stores are listed for the shopper');
  assert((await kofi.rpc('my_followed_stores')).data.length === 0, 'someone else sees none of them');
  assert((await anon.rpc('store_facts', { p_slug: 'ama-naturals' })).data.followers === 1, 'the public follower count goes up');
  assert((await errOf(ama.rpc('follow_store', { p_slug: 'ama-naturals' })))?.message.includes('own store'), 'you cannot follow your own store');
  assert((await errOf(esi.rpc('follow_store', { p_slug: 'no-such-store' })))?.message.includes('isn\'t open'), 'you cannot follow a store that does not exist');
  assert((await esi.from('store_follows').select('user_id')).error !== null, 'the follow list is only reachable through the functions');
  assert((await ama.rpc('vendor_star_status')).data.followers === 1, 'the seller sees how many follow them, and not who');
  await ama.rpc('vendor_set_paused', { p_paused: true });
  assert((await esi.rpc('my_followed_stores')).data.length === 0, 'a paused store drops out of the list');
  assert((await errOf(kofi.rpc('follow_store', { p_slug: 'ama-naturals' })))?.message.includes('isn\'t open'), 'and cannot be followed while paused');
  await ama.rpc('vendor_set_paused', { p_paused: false });
  assert((await esi.rpc('my_followed_stores')).data.length === 1, 'it comes back when the store reopens');
  await esi.rpc('unfollow_store', { p_slug: 'ama-naturals' });
  assert((await esi.rpc('is_following_store', { p_slug: 'ama-naturals' })).data === false && (await anon.rpc('store_facts', { p_slug: 'ama-naturals' })).data.followers === 0, 'unfollowing takes it back');
  await esi.rpc('follow_store', { p_slug: 'ama-naturals' });

  // --- Seller replies to reviews ----------------------------------------------------------------
  const review = (user, rating, body) => sql(`insert into public.product_reviews (product_id, user_id, rating, title, body, display_name, status)
    values ('${saved.id}', '${user}', ${rating}, 'Lovely', '${body}', 'Esi A.', 'published') returning id`).split('\n')[0];
  const reviewId = review(ids.esi, 5, 'Really lovely butter, arrived quickly.');
  assert((await ama.rpc('vendor_reviews')).data.length === 1, 'the seller sees the published reviews on their products');
  assert((await errOf(kofi.rpc('vendor_reply_to_review', { p_review_id: reviewId, p_reply: 'Thanks!' })))?.message.includes('vendor'), 'shoppers who run no store cannot reply');
  assert((await errOf(ama.rpc('vendor_reply_to_review', { p_review_id: reviewId, p_reply: 'x' })))?.message.includes('between 2 and 1000'), 'a reply needs a few words');
  assert((await errOf(ama.rpc('vendor_reply_to_review', { p_review_id: '00000000-0000-0000-0000-000000000000', p_reply: 'Thank you' })))?.message.includes('isn\'t on one of your products'), 'a reply must be to a review of your own product');
  assert(!(await ama.rpc('vendor_reply_to_review', { p_review_id: reviewId, p_reply: 'Thank you Esi, so glad you love it!' })).error, 'the seller can reply to a review');
  const pub = (await anon.rpc('get_product_reviews_page', { p_slug: saved.slug })).data;
  assert(pub.length === 1 && pub[0].seller_reply === 'Thank you Esi, so glad you love it!' && !('user_id' in pub[0]), 'the reply is public on the product, with no account details');
  assert((await anon.rpc('store_reviews', { p_slug: 'ama-naturals' })).data[0].seller_reply === 'Thank you Esi, so glad you love it!', 'and on the store page');
  const exported = (await esi.rpc('export_my_data')).data;
  assert(exported.followed_stores.length === 1 && exported.followed_stores[0].web_address === 'ama-naturals', 'the shopper\'s data export lists the stores they follow');
  assert(exported.reviews[0].seller_reply === 'Thank you Esi, so glad you love it!', 'and the reply to their review');
  assert((await errOf(ama.rpc('admin_review_replies')))?.code === '42501', 'sellers cannot list replies as staff');
  const replies = (await boss.rpc('admin_review_replies')).data;
  assert(replies.length === 1 && replies[0].store_name === 'Ama Naturals', 'staff see the replies sellers have written');
  assert((await errOf(ama.rpc('admin_remove_review_reply', { p_review_id: reviewId })))?.code === '42501', 'sellers cannot use the staff removal');
  assert(!(await boss.rpc('admin_remove_review_reply', { p_review_id: reviewId })).error, 'staff can remove a reply');
  assert((await anon.rpc('get_product_reviews_page', { p_slug: saved.slug })).data[0].seller_reply === null, 'and it disappears from the product page');
  assert((await errOf(boss.rpc('admin_remove_review_reply', { p_review_id: reviewId })))?.message.includes('no seller reply'), 'removing twice says there is nothing to remove');
  await ama.rpc('vendor_reply_to_review', { p_review_id: reviewId, p_reply: 'Thanks again!' });
  await ama.rpc('vendor_reply_to_review', { p_review_id: reviewId, p_reply: '' });
  assert((await anon.rpc('get_product_reviews_page', { p_slug: saved.slug })).data[0].seller_reply === null, 'an empty reply removes the seller\'s own reply');
  assert(sql(`select count(*) from public.audit_log where entity = 'review' and entity_id = '${reviewId}'`) === '4', 'replies and removals are in the audit log');

  // --- Star Seller progress ---------------------------------------------------------------------
  let star = (await ama.rpc('vendor_star_status')).data;
  assert(star.star === false && star.orders.value === 0 && star.orders.needed === 10 && star.rating.met === false, 'a new store is not a Star Seller and sees what is needed');
  assert(star.disputes.met === true, 'with no disputes that rule is already met');
  for (const k of ['r1', 'r2', 'r3', 'r4']) review(ids[k], 5, 'Great product, will buy again.');
  star = (await ama.rpc('vendor_star_status')).data;
  assert(star.rating.reviews === 5 && Number(star.rating.value) === 5 && star.rating.met === true, 'five 5-star reviews meet the rating rule');
  assert(star.star === false && (await anon.rpc('store_facts', { p_slug: 'ama-naturals' })).data.star_seller === false, 'but without delivered orders there is still no badge');
  assert((await errOf(kofi.rpc('vendor_star_status')))?.message.includes('vendor'), 'only sellers have a Star Seller status');
  assert((await errOf(anon.rpc('vendor_star_check', { p_vendor_id: vendorId }))) !== null, 'the check itself is not callable from outside');

  // --- Pending reviews (account page) -------------------------------------------------------------
  assert((await errOf(anon.rpc('my_pending_reviews')))?.code !== undefined, 'guests have no pending reviews list');
  assert((await kofi.rpc('my_pending_reviews')).data.length === 0, 'a shopper with no delivered orders has nothing to review');

  assert((await errOf(anon.rpc('my_order_items')))?.code !== undefined, 'guests cannot read order items');
  assert(Object.keys((await kofi.rpc('my_order_items')).data).length === 0, 'a shopper with no orders has no order items');

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll Etsy extras checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
