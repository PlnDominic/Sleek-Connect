// Batch 3 database checks: search, banners, collections, settings, warnings, order lookup, returns, support cases.
const crypto = require('crypto');
const { URL_, KEY, sql, admin, createUser, staffSession, createClient } = require('./lib.cjs');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const errOf = async (p) => { const r = await p; return r.error; };
const anon = createClient(URL_, KEY, { auth: { persistSession: false } });
const stamp = Date.now();
const folder = (token) => crypto.createHash('sha256').update(token).digest('hex');
const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');

async function placeAndPay(items, phone = '024 123 4567') {
  const { data, error } = await anon.rpc('place_order', {
    p_customer: { name: 'Ama Owusu', phone, area: 'Osu' },
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
  return { ...data, id: sql(`select id from public.orders where order_number = '${data.order_number}'`) };
}

async function deliver(S, o, rider) {
  await S.ops.rpc('admin_start_packing', { p_order_ids: [o.id] });
  const { data: packed } = await S.ops.rpc('admin_pack_orders', { p_order_ids: [o.id] });
  if (!packed?.[0]?.ok) throw new Error(`pack failed ${JSON.stringify(packed)}`);
  await S.ops.rpc('admin_dispatch_order', { p_order_id: o.id, p_rider_id: rider });
  const code = sql(`select delivery_code from public.orders where id = '${o.id}'`);
  const { data } = await S.ops.rpc('admin_mark_delivered', { p_order_id: o.id, p_recipient: 'Ama Owusu', p_code: code });
  if (data !== 'delivered') throw new Error(`deliver failed ${data}`);
}

(async () => {
  sql("update public.delivery_options set fee_ghs = 30 where id = 'same_day'");
  const S = {};
  for (const [k, role] of [['admin', 'admin'], ['ops', 'operations'], ['cat', 'catalogue'], ['sup', 'support'], ['fin', 'finance'], ['ro', 'read_only']]) {
    await createUser(`${k}+${stamp}@example.com`);
    sql(`insert into public.staff_members (email, role) values ('${k}+${stamp}@example.com', '${role}')`);
    S[k] = (await staffSession(`${k}+${stamp}@example.com`)).client;
  }

  // --- Search with typos (FR-012) ----------------------------------------------------------
  const search = async (q) => (await anon.rpc('search_products', { p_query: q })).data?.map((r) => r.slug) ?? [];
  assert((await search('serun'))[0] === 'vitamin-c-brightening-serum', 'typo "serun" finds the serum');
  assert((await search('vitamn c'))[0] === 'vitamin-c-brightening-serum', 'typo "vitamn c" finds the serum');
  assert((await search('shea')).includes('whipped-shea-body-butter') && (await search('shea')).includes('shea-cocoa-body-butter'), 'search matches several products');
  assert((await search('xyzzy')).length === 0, 'nonsense finds nothing');
  assert((await search('')).length === 0, 'empty search finds nothing');

  // --- Suggestions: as-you-type completions and "did you mean" -------------------------------
  const suggest = async (q) => (await anon.rpc('search_suggestions', { p_query: q })).data ?? [];
  const s1 = await suggest('ser');
  assert(s1[0]?.kind === 'product' && s1[0].slug === 'vitamin-c-brightening-serum' && s1[0].department === 'beauty', 'typing "ser" suggests the serum first, with its link details');
  assert((await suggest('serun'))[0]?.label === 'Vitamin C Brightening Serum', 'a typo still suggests the right product');
  assert((await suggest('little')).some((r) => r.kind === 'brand' && r.label === 'Little Nest'), 'brands are suggested');
  assert((await suggest('skinc')).some((r) => r.kind === 'category' && r.slug === 'skincare'), 'categories are suggested, with a typo');
  const wide = async (q) => (await anon.rpc('search_suggestions', { p_query: q, p_limit: 4, p_min_score: 0.3 })).data ?? [];
  assert((await search('vitmnc')).length === 0 && (await wide('vitmnc')).some((r) => r.label === 'Vitamin C Brightening Serum'), 'a bigger typo finds nothing in search, but "did you mean" still points to the right product');
  assert((await suggest('xyzzy')).length === 0 && (await suggest('a')).length === 0 && (await suggest('')).length === 0, 'nonsense, one letter and nothing suggest nothing');
  assert((await suggest('100%_\\')).length === 0, 'wildcard characters are not treated as patterns');

  // --- Product fields: warnings, filters, returnable (FR-013, FR-017) -----------------------------
  const blocksId = sql("select id from public.products where slug = 'wooden-stacking-blocks'");
  const lipId = sql("select id from public.products where slug = 'velvet-matte-lip-colour'");
  const beauty = sql("select id from public.categories where department = 'beauty' limit 1");
  const balm = { name: 'Rose Lip Balm', department: 'beauty', kind: 'tube', category_id: beauty, price_ghs: 40, brand: 'Glow Lab', description: 'Balm.', ingredients: 'Shea', warnings: 'External use.', country_of_origin: 'Ghana', regulatory_reference: 'FDA/1', sizes: [], age_bands: [], publish: true, warning_label: ' Contains shea nut butter. ', shades: ['Ruby', ' Nude ', ''], skin_types: ['Dry'], returnable: false, return_note: 'Unopened only.' };
  const { data: balmSaved, error: balmErr } = await S.cat.rpc('admin_save_product', { p: balm });
  assert(!balmErr && balmSaved.published, `product with the new fields publishes (${balmErr?.message ?? balmSaved?.problems})`);
  assert(sql(`select array_to_string(shades, ',') || '|' || array_to_string(skin_types, ',') || '|' || returnable || '|' || return_note || '|' || warning_label from public.products where id = '${balmSaved.id}'`) === 'Ruby,Nude|Dry|false|Unopened only.|Contains shea nut butter.', 'filters, warning and return rule stored (trimmed)');
  await S.cat.rpc('admin_save_product', { p: { ...balm, id: balmSaved.id, warning_label: '', shades: [] } });
  assert(sql(`select coalesce(warning_label, 'none') || '|' || cardinality(shades) from public.products where id = '${balmSaved.id}'`) === 'none|0', 'clearing the warning and shades');
  sql(`update public.products set warning_label = 'Choking hazard: small parts. Not for children under 3.' where id = '${blocksId}'`);
  sql(`update public.products set returnable = false where id = '${lipId}'`);
  await createUser(`shopper+${stamp}@example.com`);
  const shopper = (await staffSession(`shopper+${stamp}@example.com`)).client;
  await shopper.rpc('set_bag', { p_items: [{ slug: 'wooden-stacking-blocks', size: null, quantity: 1 }] });
  const { data: bag } = await shopper.rpc('get_bag');
  assert(bag?.[0]?.warning_label?.startsWith('Choking hazard'), 'saved bag carries the warning label');

  // --- Banners (FR-010) -------------------------------------------------------------------------
  const live = async () => (await anon.from('banners').select('title')).data.map((b) => b.title);
  assert((await live()).length === 3, 'starter banners are live');
  const banner = { placement: 'home_promo', title: 'Weekend deal', cta_label: 'Shop', cta_href: '/shop?sale=1', theme: 'sale', is_active: true };
  assert((await errOf(S.ops.rpc('admin_save_banner', { p: banner })))?.code === '42501', 'operations cannot edit banners');
  assert((await errOf(S.cat.rpc('admin_save_banner', { p: { ...banner, cta_href: 'javascript:alert(1)' } })))?.message.includes('Links must start'), 'unsafe banner link refused');
  assert((await errOf(S.cat.rpc('admin_save_banner', { p: { ...banner, cta_href: '//evil.example' } })))?.message.includes('Links must start'), 'link to another site disguised as a page refused');
  assert((await errOf(S.cat.rpc('admin_save_banner', { p: { ...banner, cta_href: '' } })))?.message.includes('label and a link'), 'button needs label and link');
  assert((await errOf(S.cat.rpc('admin_save_banner', { p: { ...banner, starts_at: '2030-01-02T00:00:00Z', ends_at: '2030-01-01T00:00:00Z' } })))?.message.includes('end must be after'), 'end before start refused');
  const { data: bid } = await S.cat.rpc('admin_save_banner', { p: banner });
  assert((await live()).includes('Weekend deal'), 'new banner is live');
  await S.cat.rpc('admin_save_banner', { p: { ...banner, id: bid, starts_at: '2030-01-01T00:00:00Z' } });
  assert(!(await live()).includes('Weekend deal'), 'scheduled banner hidden until it starts');
  assert((await S.ro.from('banners').select('id').eq('id', bid)).data.length === 1, 'staff see scheduled banners');
  await S.cat.rpc('admin_save_banner', { p: { ...banner, id: bid, ends_at: '2020-01-01T00:00:00Z' } });
  assert(!(await live()).includes('Weekend deal'), 'ended banner hidden');
  await S.cat.rpc('admin_save_banner', { p: { ...banner, id: bid, is_active: false } });
  assert(!(await live()).includes('Weekend deal'), 'inactive banner hidden');
  await S.cat.rpc('admin_delete_banner', { p_id: bid });
  assert((await S.ro.from('banners').select('id').eq('id', bid)).data.length === 0, 'banner deleted');
  assert((await S.admin.from('audit_log').select('action').eq('entity_id', bid)).data.map((r) => r.action).join(',').includes('banner.deleted'), 'banner changes audited');

  // --- Featured collections ------------------------------------------------------------------------
  assert((await errOf(S.cat.rpc('admin_set_collection', { p_slot: 'home_hero', p_slugs: ['nope'] })))?.message.includes('nope'), 'unknown product refused');
  assert((await errOf(S.cat.rpc('admin_set_collection', { p_slot: 'secret', p_slugs: [] })))?.message.includes('Unknown collection'), 'unknown collection refused');
  assert((await errOf(S.ops.rpc('admin_set_collection', { p_slot: 'home_hero', p_slugs: [] })))?.code === '42501', 'operations cannot edit collections');
  await S.cat.rpc('admin_set_collection', { p_slot: 'home_hero', p_slugs: ['argan-hair-oil', 'velvet-matte-lip-colour', 'argan-hair-oil'] });
  const { data: hero } = await anon.from('merchandising_slots').select('position, products(slug)').eq('slot', 'home_hero').order('position');
  assert(hero.map((r) => r.products.slug).join(',') === 'argan-hair-oil,velvet-matte-lip-colour', 'collection saved in order, duplicates dropped');

  // --- Settings ----------------------------------------------------------------------------------
  assert((await errOf(S.ops.rpc('admin_update_settings', { p: { return_window_days: 10 } })))?.code === '42501', 'only admins change settings');
  assert((await errOf(S.admin.rpc('admin_update_settings', { p: { return_window_days: 500 } })))?.message.includes('allowed range'), 'out-of-range setting refused');
  assert((await errOf(S.admin.rpc('admin_update_settings', { p: { return_window_days: 'ten' } })))?.message.includes('whole numbers'), 'non-number setting refused');
  e = await errOf(S.admin.rpc('admin_update_settings', { p: { return_window_days: '14', support_phone: ' 030 123 4567 ', support_whatsapp: '024 000 1111' } }));
  assert(!e, `settings saved (${e?.message})`);
  const { data: st } = await anon.from('store_settings').select('return_window_days, support_phone, support_whatsapp, reservation_minutes').single();
  assert(st.return_window_days === 14 && st.support_phone === '030 123 4567' && st.reservation_minutes === 15, 'partial update keeps other settings; shoppers can read contacts');
  await S.admin.rpc('admin_update_settings', { p: { support_whatsapp: '' } });
  assert(sql('select coalesce(support_whatsapp, \'null\') from public.store_settings') === 'null', 'empty contact clears it');
  const audit = (await S.admin.from('audit_log').select('details').eq('action', 'settings.changed').order('at', { ascending: false }).limit(1)).data[0];
  assert(audit?.details?.before && audit?.details?.after, 'settings change audited with before and after');
  await S.admin.rpc('admin_update_settings', { p: { return_window_days: 7 } });

  // --- Order lookup ("Track an order") ----------------------------------------------------------
  const o1 = await placeAndPay([{ slug: 'velvet-matte-lip-colour', quantity: 2 }, { slug: 'wooden-stacking-blocks', quantity: 1 }], '024 555 0101');
  const find = async (n, p) => (await anon.rpc('find_order', { p_order_number: n, p_phone: p })).data;
  assert(await find(o1.order_number, '+233 24 555 0101') === o1.order_token, 'lookup matches the phone in another format');
  assert(await find(o1.order_number.toLowerCase(), '0245550101') === o1.order_token, 'order number is case-insensitive');
  assert(await find(o1.order_number, '024 555 0102') === null, 'wrong phone finds nothing');
  assert(await find(o1.order_number, '555') === null, 'too-short phone finds nothing');
  assert((await anon.from('order_lookup_failures').select('key')).error || (await anon.from('order_lookup_failures').select('key')).data.length === 0, 'lookup failures are private');
  for (let i = 0; i < 8; i++) await find('SC-999999', '020 777 0000');
  assert(await find(o1.order_number, '020 777 0000') === null && sql("select count(*) from public.order_lookup_failures where key = 'phone:207770000'") >= 8, 'misses recorded per phone');
  sql(`insert into public.order_lookup_failures (key) select 'order:${o1.order_number}' from generate_series(1, 8)`);
  assert(await find(o1.order_number, '024 555 0101') === null, 'after 8 misses for an order number, lookups pause');
  sql('delete from public.order_lookup_failures');
  assert(await find(o1.order_number, '024 555 0101') === o1.order_token, 'lookups resume after the pause');

  // --- Returns (FR-053, FR-054) ----------------------------------------------------------------------
  const { data: rider } = await S.ops.rpc('admin_save_rider', { p_id: null, p_name: 'Kofi Asante', p_phone: '020 111 2222', p_vehicle: 'Motorbike' });
  const items = (await anon.rpc('get_order', { p_order_token: o1.order_token })).data.items;
  const lipItem = items.find((i) => i.slug === 'velvet-matte-lip-colour'), blockItem = items.find((i) => i.slug === 'wooden-stacking-blocks');
  assert(lipItem.returnable === false && blockItem.warning_label?.startsWith('Choking'), 'order page shows return rule and warning per item');
  const req = (extra) => anon.rpc('request_return', { p_order_token: o1.order_token, p_items: [{ order_item_id: blockItem.id, quantity: 1 }], p_reason: 'damaged', p_photo_paths: [], ...extra });
  assert((await errOf(req()))?.message.includes('once the order has been delivered'), 'no returns before delivery');
  const early = await anon.storage.from('return-photos').upload(`${folder(o1.order_token)}/early.png`, png, { contentType: 'image/png' });
  assert(early.error, 'no photo uploads before delivery');
  await deliver(S, o1, rider);
  const page1 = (await anon.rpc('get_order', { p_order_token: o1.order_token })).data;
  assert(page1.return_open === true && page1.return_until, 'delivered order is open for returns');

  const p1 = `${folder(o1.order_token)}/${crypto.randomUUID()}.png`;
  const up = await anon.storage.from('return-photos').upload(p1, png, { contentType: 'image/png' });
  assert(!up.error, `customer uploads a photo into the order folder (${up.error?.message})`);
  const raw = await anon.storage.from('return-photos').upload(`${o1.order_token}/x.png`, png, { contentType: 'image/png' });
  assert(raw.error, 'the bare token is not a valid folder');
  const other = await placeAndPay([{ slug: 'argan-hair-oil', quantity: 1 }]);
  assert((await anon.storage.from('return-photos').upload(`${folder(other.order_token)}/x.png`, png, { contentType: 'image/png' })).error, 'no uploads for an undelivered order');
  assert((await anon.storage.from('return-photos').upload(`${folder(o1.order_token)}/x.txt`, Buffer.from('hi'), { contentType: 'text/plain' })).error, 'only images can be uploaded');
  assert((await anon.storage.from('return-photos').download(p1)).error, 'shoppers cannot download return photos');

  assert((await errOf(req({ p_photo_paths: [`${folder(o1.order_token)}/missing.png`] })))?.message.includes('didn'), 'photo that was never uploaded refused');
  assert((await errOf(req({ p_photo_paths: [`${folder(other.order_token)}/x.png`] })))?.message.includes('didn'), 'photo from another order refused');
  assert((await errOf(req({ p_reason: 'other' })))?.message.includes('what'), '"something else" needs details');
  assert((await errOf(req({ p_items: [{ order_item_id: blockItem.id, quantity: 2 }] })))?.message.includes('up to 1'), 'cannot return more than was bought');
  assert((await errOf(req({ p_items: [] })))?.message.includes('at least one'), 'needs an item');
  assert((await errOf(req({ p_items: [{ order_item_id: lipItem.id, quantity: 1 }], p_reason: 'changed_mind' })))?.message.includes('only be returned if'), 'non-returnable item refused for a change of mind');
  const { data: rt1, error: rtErr } = await req({ p_items: [{ order_item_id: lipItem.id, quantity: 2 }, { order_item_id: blockItem.id, quantity: 1 }], p_details: 'Box crushed', p_photo_paths: [p1] });
  assert(!rtErr && /^RT-\d+$/.test(rt1), `damaged items can be returned, case number given (${rtErr?.message})`);
  assert((await errOf(req()))?.message.includes('up to 0'), 'items already in a return cannot be returned again');
  const page2 = (await anon.rpc('get_order', { p_order_token: o1.order_token })).data;
  assert(page2.returns[0]?.case_number === rt1 && page2.returns[0].status === 'requested' && page2.items.every((i) => i.return_requested === i.quantity), 'order page shows the return');
  assert((await anon.from('return_requests').select('id')).data.length === 0, 'shoppers cannot list returns');
  const staffView = (await S.ro.from('return_requests').select('id, photo_paths, orders(order_number)').eq('case_number', rt1)).data[0];
  assert(staffView && !JSON.stringify(staffView).includes(o1.order_token), 'staff see the return without the order token');
  const { data: signed } = await S.ro.storage.from('return-photos').createSignedUrl(staffView.photo_paths[0], 60);
  assert(signed?.signedUrl && (await fetch(signed.signedUrl)).status === 200, 'staff can view the photo through a signed link');
  const rid = staffView.id;

  assert((await errOf(S.cat.rpc('admin_decide_return', { p_return_id: rid, p_approve: true })))?.code === '42501', 'catalogue staff cannot decide returns');
  assert((await errOf(S.sup.rpc('admin_decide_return', { p_return_id: rid, p_approve: false, p_note: ' ' })))?.message.includes('why'), 'declining needs a note');
  assert((await errOf(S.sup.rpc('admin_receive_return', { p_return_id: rid, p_outcomes: [] })))?.code === '42501', 'support cannot receive goods');
  assert((await errOf(S.ops.rpc('admin_receive_return', { p_return_id: rid, p_outcomes: [] })))?.message.includes('approved'), 'cannot receive before approval');
  assert(!(await errOf(S.sup.rpc('admin_decide_return', { p_return_id: rid, p_approve: true, p_note: 'Our rider will collect it tomorrow.' }))), 'support approves');
  assert((await errOf(S.sup.rpc('admin_decide_return', { p_return_id: rid, p_approve: false, p_note: 'x' })))?.message.includes('already'), 'cannot decide twice');
  const before = sql(`select on_hand from public.inventory_levels where product_id = '${blocksId}'`);
  assert((await errOf(S.ops.rpc('admin_receive_return', { p_return_id: rid, p_outcomes: [{ order_item_id: lipItem.id, outcome: 'quarantine' }] })))?.message.includes('every returned item'), 'every item needs an outcome');
  assert((await errOf(S.ops.rpc('admin_receive_return', { p_return_id: rid, p_outcomes: [{ order_item_id: lipItem.id, outcome: 'nonsense' }, { order_item_id: blockItem.id, outcome: 'restock' }] })))?.message.includes('every returned item'), 'unknown outcome refused');
  e = await errOf(S.ops.rpc('admin_receive_return', { p_return_id: rid, p_outcomes: [{ order_item_id: lipItem.id, outcome: 'quarantine' }, { order_item_id: blockItem.id, outcome: 'restock' }], p_note: 'Lipsticks scuffed' }));
  assert(!e, `operations receives the goods (${e?.message})`);
  assert(Number(sql(`select on_hand from public.inventory_levels where product_id = '${blocksId}'`)) === Number(before) + 1, 'restocked unit goes back on sale');
  assert(sql(`select batch_code || ':' || quantity || ':' || status from public.stock_batches where product_id = '${lipId}' and batch_code like '%-RET'`) === 'STARTER-RET:2:quarantined', 'quarantined units held in a -RET batch, off sale');
  assert(sql(`select string_agg(reason || ':' || quantity || ':' || sellable_change, ',' order by reason) from public.stock_movements where order_id = '${o1.id}' and reason = 'returned'`).split(',').length === 2, 'stock movements logged for the return');
  const ledger = sql(`select bool_and(ok) from (select i.on_hand = coalesce(sum(m.sellable_change), 0) as ok from public.inventory_levels i left join public.stock_movements m on m.product_id = i.product_id and m.size_code = i.size_code where i.product_id in ('${blocksId}', '${lipId}') group by i.product_id, i.size_code, i.on_hand) x`);
  assert(ledger === 't', 'stock ledger still adds up to what is on sale');
  const rec = sql(`select status || ':' || refund_amount_ghs from public.return_requests where id = '${rid}'`);
  const expected = sql(`select sum(unit_price_ghs * quantity) from public.order_items where order_id = '${o1.id}'`);
  assert(rec === `received:${expected}`, `refund due is the returned items' price (${rec} vs ${expected})`);
  assert((await errOf(S.ops.rpc('admin_mark_return_refunded', { p_return_id: rid, p_reference: '' })))?.message.includes('reference'), 'refund needs a reference');
  assert((await errOf(S.sup.rpc('admin_mark_return_refunded', { p_return_id: rid, p_reference: 'MP123' })))?.code === '42501', 'support cannot record refunds');
  assert(!(await errOf(S.fin.rpc('admin_mark_return_refunded', { p_return_id: rid, p_reference: 'MP123' }))), 'finance records the refund');
  const msgs = sql(`select string_agg(template, ',' order by created_at) from public.notifications where order_id = '${o1.id}' and channel = 'sms' and template like 'return%'`);
  assert(msgs === 'return_requested,return_approved,return_received,return_refunded', `customer told at every step (${msgs})`);
  assert(sql(`select payload->>'note' from public.notifications where order_id = '${o1.id}' and template = 'return_approved'`) === 'Our rider will collect it tomorrow.', 'approval message carries the note');
  assert((await S.admin.from('audit_log').select('action').eq('entity_id', rid)).data.length === 3, 'return decisions audited');

  // Window closes
  sql(`update public.orders set delivered_at = now() - interval '8 days' where id = '${o1.id}'`);
  const page3 = (await anon.rpc('get_order', { p_order_token: o1.order_token })).data;
  assert(page3.return_open === false, 'window closed after the return period');
  assert((await anon.storage.from('return-photos').upload(`${folder(o1.order_token)}/late.png`, png, { contentType: 'image/png' })).error, 'no uploads after the window');

  // --- Support cases (FR-055) ----------------------------------------------------------------------
  const kase = (extra) => anon.rpc('create_support_case', { p_topic: 'delivery', p_name: 'Ama Owusu', p_phone: '024 555 0101', p_message: 'Where is my parcel?', ...extra });
  assert((await errOf(kase({ p_phone: '123' })))?.message.includes('phone'), 'case needs a reachable phone');
  assert((await errOf(kase({ p_message: ' ' })))?.message.includes('message'), 'case needs a message');
  assert((await errOf(kase({ p_email: 'not-an-email' })))?.message.includes('email'), 'bad email refused');
  const { data: c1 } = await kase({ p_order_number: o1.order_number });
  assert(/^CS-\d+$/.test(c1), 'case number given');
  const { data: c2 } = await kase({ p_order_number: o1.order_number, p_phone: '020 999 8888' });
  const { data: c3 } = await kase({ p_order_token: other.order_token, p_phone: '020 999 8888' });
  const link = (c) => sql(`select coalesce((select order_number from public.orders o where o.id = s.order_id), 'none') || ':' || coalesce(order_reference, '-') from public.support_cases s where case_number = '${c}'`);
  assert(link(c1) === `${o1.order_number}:-`, 'order linked when the number and phone match');
  assert(link(c2) === `none:${o1.order_number}`, 'not linked when the phone differs (kept as typed)');
  assert(link(c3) === `${other.order_number}:-`, 'linked from the order page link');
  assert((await anon.from('support_cases').select('id')).data.length === 0, 'shoppers cannot read cases');
  await kase({ p_phone: '020 999 8888' });
  assert((await errOf(kase({ p_phone: '+233 20 999 8888' })))?.message.includes('several messages'), 'fourth message from a phone within the hour refused');
  const acks = sql(`select count(*) from public.notifications where template = 'support_received' and recipient like '%999 8888'`);
  assert(acks === '1', `only the first case from a phone each hour is acknowledged (${acks})`);
  const cid = sql(`select id from public.support_cases where case_number = '${c1}'`);
  assert((await errOf(S.cat.rpc('admin_reply_support_case', { p_case_id: cid, p_reply: 'Hi' })))?.code === '42501', 'catalogue staff cannot reply');
  assert((await errOf(S.sup.rpc('admin_reply_support_case', { p_case_id: cid, p_reply: ' ' })))?.message.includes('Write a reply'), 'empty reply refused');
  await S.sup.rpc('admin_reply_support_case', { p_case_id: cid, p_reply: 'It arrives today.' });
  assert(sql(`select status || ':' || replied_by from public.support_cases where id = '${cid}'`) === `answered:sup+${stamp}@example.com`, 'reply recorded');
  assert(sql(`select payload->>'note' from public.notifications where template = 'support_reply' and order_id = '${o1.id}'`) === 'It arrives today.', 'customer gets the reply');
  await S.ops.rpc('admin_reply_support_case', { p_case_id: cid, p_reply: '', p_close: true });
  assert(sql(`select status || ':' || staff_reply from public.support_cases where id = '${cid}'`) === 'closed:It arrives today.', 'closing keeps the last reply');

  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
