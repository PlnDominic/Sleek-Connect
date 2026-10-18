// Batch 4 browser checks: delivery zones and free delivery, product photos, wishlist, saved addresses, customer
// cancellation, "Buy again" and the audit log.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { URL_, KEY, sql, admin, createUser, staffSession, createClient } = require('./lib.cjs');
const BASE = 'http://localhost:3000';
const OUT = process.argv[2] ?? path.resolve(__dirname, '.output');
fs.mkdirSync(OUT, { recursive: true });
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const stamp = Date.now();
const anonDb = createClient(URL_, KEY, { auth: { persistSession: false } });
async function go(page, url) { await page.goto(url, { waitUntil: 'load' }); await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {}); }
const main = (page) => page.locator('main:visible').first();
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
const until = async (fn, ms = 8000) => { const end = Date.now() + ms; let v; while (Date.now() < end) { v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 250)); } return v; };
// A 64×64 orange PNG, so the photo is visible in screenshots.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsAtkMpMbwwi+hcEKLNP1WgQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQELguyp+FacRid1AAAAABJRU5ErkJggg==', 'base64');

async function placeOrder(items, { area = 'Osu', pay = true } = {}) {
  const { data: order, error } = await anonDb.rpc('place_order', {
    p_customer: { name: 'Efua Mensah', phone: '055 222 3333', area },
    p_delivery_option: 'standard',
    p_payment: { method: 'momo', network: 'mtn', wallet: '055 222 3333' },
    p_items: items,
    p_is_gift: false,
  }).single();
  if (error) throw error;
  if (pay) {
    const ref = `T-${order.order_number}`;
    await admin.rpc('start_payment', { p_order_token: order.order_token, p_provider: 'test', p_reference: ref });
    await admin.rpc('confirm_payment', { p_provider: 'test', p_reference: ref, p_status: 'succeeded', p_amount_ghs: order.total_ghs });
  }
  return { ...order, id: sql(`select id from public.orders where order_number = '${order.order_number}'`) };
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = async (cookies, viewport = { width: 1360, height: 900 }) => {
    const c = await browser.newContext({ viewport });
    if (cookies) await c.addCookies(cookies);
    const p = await c.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    return p;
  };

  await createUser(`boss+${stamp}@example.com`);
  sql(`insert into public.staff_members (email, role) values ('boss+${stamp}@example.com', 'admin')`);
  const boss = await staffSession(`boss+${stamp}@example.com`);
  const staff = await ctx(boss.cookies());

  // --- Delivery settings (FR-040/041) --------------------------------------------------------------
  await go(staff, BASE + '/admin/delivery');
  const standard = staff.locator('form', { has: staff.getByRole('button', { name: 'Save Standard' }) });
  await standard.getByLabel('Standard fee (GH₵)').fill('20');
  await standard.getByLabel('Fastest (days)').fill('1');
  await standard.getByLabel('Slowest (days)').fill('2');
  await standard.getByRole('button', { name: 'Save Standard' }).click();
  await standard.getByRole('status').filter({ hasText: 'Saved.' }).waitFor();
  const sameDay = staff.locator('form', { has: staff.getByRole('button', { name: 'Save Same day' }) });
  await sameDay.getByLabel('Fastest (days)').fill('0');
  await sameDay.getByLabel('Slowest (days)').fill('0');
  await sameDay.getByLabel('Cut-off time').fill('23:59');
  await sameDay.getByRole('button', { name: 'Save Same day' }).click();
  await sameDay.getByRole('status').filter({ hasText: 'Saved.' }).waitFor();
  const free = staff.locator('form', { has: staff.getByRole('button', { name: 'Save threshold' }) });
  await free.getByLabel(/Free delivery on orders of at least/).fill('200');
  await free.getByRole('button', { name: 'Save threshold' }).click();
  await free.getByRole('status').filter({ hasText: 'threshold saved' }).waitFor();
  const newZone = staff.locator('form', { has: staff.getByRole('button', { name: 'Add zone' }) });
  await newZone.getByLabel('New zone').fill('Outer Accra');
  await newZone.getByRole('button', { name: 'Add zone' }).click();
  await newZone.getByRole('status').filter({ hasText: 'Zone added' }).waitFor();
  const zone = staff.locator('details', { hasText: 'Outer Accra' });
  await zone.locator('summary').click();
  await zone.getByLabel('Standard fee in Outer Accra').fill('45');
  await zone.getByLabel('Offer Same day in Outer Accra').uncheck();
  await zone.getByRole('button', { name: 'Save Outer Accra fees' }).click();
  await zone.getByRole('status').filter({ hasText: 'Fees saved.' }).waitFor();
  const spintex = staff.locator('form', { has: staff.locator('input[name="name"][value="Spintex"]') });
  await spintex.getByLabel('Zone').selectOption({ label: 'Outer Accra' });
  await spintex.getByRole('button', { name: 'Save' }).click();
  await spintex.getByRole('status').filter({ hasText: 'Area saved.' }).waitFor();
  assert(sql("select zone_id from public.delivery_areas where name = 'Spintex'") === 'outer-accra', 'admin sets fees, free delivery, a zone and its areas');
  await shot(staff, 'admin-delivery');

  // Checkout follows the zone, free delivery and estimates
  const shopper = await ctx();
  await go(shopper, BASE + '/products/argan-hair-oil');
  await main(shopper).getByRole('button', { name: 'Add to bag' }).click();
  await go(shopper, BASE + '/checkout');
  const window = (name) => shopper.locator('label', { has: shopper.getByRole('radio') }).filter({ hasText: name });
  await shopper.getByLabel('Area in Accra').selectOption('Osu');
  assert((await window('Standard').textContent()).includes('1–2 working days · GH₵ 20'), `standard: estimate and fee (${await window('Standard').textContent()})`);
  assert((await window('Same day').textContent()).includes('Today if you order by 11:59 pm'), 'same day: cut-off shown');
  assert((await main(shopper).textContent()).includes('Add GH₵ 70 more for free standard delivery'), 'free-delivery nudge');
  await shopper.getByLabel('Area in Accra').selectOption('Spintex');
  assert((await window('Standard').textContent()).includes('GH₵ 45'), 'zone fee for an outer area');
  assert((await window('Same day').textContent()).includes('Not available in Spintex') && await window('Same day').getByRole('radio').isDisabled(), 'option the zone doesn’t get is disabled');
  const summary = shopper.locator('aside:visible');
  assert((await summary.textContent()).includes('DeliveryGH₵ 45'), 'summary uses the zone fee');
  await go(shopper, BASE + '/products/argan-hair-oil');
  await main(shopper).getByRole('button', { name: 'Increase quantity' }).click();
  await main(shopper).getByRole('button', { name: 'Add to bag' }).click();
  await go(shopper, BASE + '/checkout');
  await shopper.getByLabel('Area in Accra').selectOption('Spintex');
  assert((await window('Standard').textContent()).includes('Free'), 'standard delivery free over the threshold');
  await shot(shopper, 'checkout-zones');
  await go(shopper, BASE + '/');
  assert((await shopper.locator('body').textContent()).includes('Free delivery in Accra on orders over GH₵ 200'), 'announcement shows the real threshold');

  // --- Product photos (NFR-P2) ---------------------------------------------------------------------
  const serum = sql("select id from public.products where slug = 'vitamin-c-brightening-serum'");
  await go(staff, BASE + `/admin/products/${serum}`);
  const photos = staff.getByRole('region', { name: 'Photos' });
  await photos.locator('input[type="file"]').setInputFiles([
    { name: 'front.png', mimeType: 'image/png', buffer: png },
    { name: 'back.png', mimeType: 'image/png', buffer: png },
  ]);
  await photos.getByRole('status').filter({ hasText: '2 photos added.' }).waitFor({ timeout: 15000 });
  assert(await until(async () => (await photos.getByRole('img').count()) === 2), 'staff upload two photos');
  await photos.getByLabel('Description (for screen readers)').first().fill('Serum bottle, front');
  await photos.getByRole('button', { name: 'Move photo 2 earlier' }).click();
  await photos.getByRole('button', { name: 'Save order and descriptions' }).click();
  await photos.getByRole('status').filter({ hasText: 'Photos saved.' }).waitFor();
  const firstAlt = sql(`select coalesce(alt, '') from public.product_images where product_id = '${serum}' order by sort_order limit 1`);
  assert(firstAlt === '', `reordered: the second photo is now main (${firstAlt})`);
  await shot(staff, 'admin-photos');
  await go(shopper, BASE + '/products/vitamin-c-brightening-serum');
  const mainPhoto = shopper.locator('main img[src*="product-images"]').first();
  await mainPhoto.waitFor();
  assert(await mainPhoto.evaluate((img) => img.complete && img.naturalWidth > 0), 'product page shows the uploaded photo (optimised by Next.js)');
  assert(await until(async () => (await shopper.getByRole('button', { name: 'Serum bottle, front' }).count()) === 1), 'gallery thumbnails use the descriptions');
  await go(shopper, BASE + '/shop/beauty/skincare');
  assert(await main(shopper).locator('article img[src*="product-images"]').count() >= 1, 'listing cards show the main photo');

  // --- Wishlist (FR-063) -------------------------------------------------------------------------------
  const guest = await ctx();
  await go(guest, BASE + '/shop');
  const heart = main(guest).getByRole('button', { name: 'Save Argan Hair Oil, 250 ml' });
  await heart.click();
  await main(guest).getByRole('button', { name: 'Remove Argan Hair Oil, 250 ml from saved items' }).waitFor();
  assert(await guest.getByRole('link', { name: 'Saved items, 1 item' }).isVisible(), 'header counts saved items');
  await go(guest, BASE + '/saved');
  await main(guest).getByRole('heading', { name: '1 saved product' }).waitFor();
  assert(await main(guest).getByRole('link', { name: /Argan Hair Oil/ }).first().isVisible(), 'saved page lists the product');
  // Signing in moves the device's list into the account.
  await createUser(`esi+${stamp}@example.com`);
  const esi = await staffSession(`esi+${stamp}@example.com`);
  await esi.client.rpc('record_signup_consent');
  const esiId = sql(`select id from auth.users where email = 'esi+${stamp}@example.com'`);
  await guest.context().addCookies(esi.cookies());
  await go(guest, BASE + '/saved');
  assert(await until(() => sql(`select count(*) from public.wishlist_items where user_id = '${esiId}'`) === '1'), 'signing in saves the list to the account');
  await main(guest).getByRole('button', { name: 'Remove Argan Hair Oil, 250 ml from saved items' }).click();
  await main(guest).getByText('Nothing saved yet').waitFor();
  assert(await until(() => sql(`select count(*) from public.wishlist_items where user_id = '${esiId}'`) === '0'), 'removing syncs to the account');

  // --- Saved addresses (FR-023) ----------------------------------------------------------------------------
  await go(guest, BASE + '/account/addresses');
  const add = guest.getByRole('region', { name: 'Add an address' });
  await add.getByLabel(/Name for this address/).fill('Home');
  await add.getByLabel('Recipient’s name').fill('Esi Mensah');
  await add.getByLabel('Phone number').fill('024 555 0101');
  await add.getByLabel('Area in Accra').selectOption('East Legon');
  await add.getByLabel(/GhanaPost GPS/).fill('ga-123-4567');
  await add.getByRole('button', { name: 'Save address' }).click();
  await add.getByRole('status').filter({ hasText: 'Address saved.' }).waitFor();
  const card = guest.getByRole('listitem', { name: 'Home' });
  await card.waitFor();
  assert((await card.textContent()).includes('Default') && (await card.textContent()).includes('GA-123-4567'), 'address saved as the default');
  await add.getByLabel('Recipient’s name').fill('Kojo');
  await add.getByLabel('Phone number').fill('12');
  await add.getByRole('button', { name: 'Save address' }).click();
  await add.getByRole('alert').filter({ hasText: 'phone' }).waitFor();
  assert(await add.getByLabel('Recipient’s name').inputValue() === 'Kojo', 'refused address keeps what was typed');
  await shot(guest, 'addresses');
  await go(guest, BASE + '/products/argan-hair-oil');
  await main(guest).getByRole('button', { name: 'Add to bag' }).click();
  await go(guest, BASE + '/checkout');
  await guest.getByLabel('Saved addresses').waitFor();
  assert(await until(async () => (await guest.getByLabel('Full name').inputValue()) === 'Esi Mensah'), 'checkout fills in the default address');
  assert(await guest.getByLabel('Area in Accra').inputValue() === 'East Legon' && await guest.getByLabel('Phone number').inputValue() === '024 555 0101', 'area and phone filled in too');

  // --- Customer cancels (FR-052) -----------------------------------------------------------------------------
  const paid = await placeOrder([{ slug: 'velvet-matte-lip-colour', quantity: 1 }]);
  const visitor = await ctx();
  await go(visitor, BASE + `/orders/${paid.order_token}`);
  await visitor.getByRole('button', { name: 'Cancel order' }).click();
  const box = visitor.getByRole('group', { name: 'Cancel this order?' });
  assert((await box.textContent()).includes('refund your payment'), 'paid orders are told about the refund');
  await box.getByLabel('Reason').selectOption('Changed my mind');
  await box.getByRole('button', { name: 'Yes, cancel order' }).click();
  await visitor.locator('main').getByText('Cancelled', { exact: true }).first().waitFor({ timeout: 10000 });
  assert(sql(`select status || '|' || refund_due from public.orders where id = '${paid.id}'`) === 'cancelled|true', 'order cancelled and flagged for a refund');
  assert(await visitor.getByRole('button', { name: 'Cancel order' }).count() === 0, 'no cancel button once cancelled');

  // --- Buy again (FR-051) ------------------------------------------------------------------------------------
  assert(await visitor.getByRole('button', { name: 'Buy again' }).isVisible(), 'cancelled orders offer "Buy again"');
  await visitor.getByRole('button', { name: 'Buy again' }).click();
  await visitor.waitForURL(/\/bag$/);
  await visitor.getByRole('link', { name: 'Velvet Matte Lip Colour' }).first().waitFor();
  assert(true, '"Buy again" puts the items back in the bag');
  const other = await placeOrder([{ slug: 'wooden-stacking-blocks', quantity: 1 }, { slug: 'argan-hair-oil', quantity: 1 }]);
  await admin.rpc('cancel_my_order', { p_order_token: other.order_token });
  sql("update public.products set is_published = false where slug = 'wooden-stacking-blocks'");
  // Any admin save refreshes the store's cached catalogue.
  await go(staff, BASE + '/admin/content');
  const best = staff.locator('div:has(> h3:text-is("Best Sellers"))');
  await best.getByRole('button', { name: 'Save Best Sellers' }).click();
  await best.getByRole('status').waitFor();
  const v2 = await ctx();
  await go(v2, BASE + `/orders/${other.order_token}`);
  await v2.getByRole('button', { name: 'Buy again' }).click();
  await v2.getByRole('status').filter({ hasText: 'Not available right now: Wooden Stacking Blocks' }).waitFor();
  assert(await v2.evaluate(() => JSON.parse(localStorage.getItem('sleek-connect:bag:v1') ?? '[]').map((i) => i.slug).join()) === 'argan-hair-oil', 'unavailable items are named and skipped');
  sql("update public.products set is_published = true where slug = 'wooden-stacking-blocks'");

  // --- Audit log (FR-109) ---------------------------------------------------------------------------------
  await go(staff, BASE + '/admin/audit?family=delivery');
  const rows = await staff.locator('tbody tr').count();
  assert(rows >= 5 && (await staff.locator('tbody').textContent()).includes('delivery.zone_saved'), `audit log lists delivery changes (${rows})`);
  await staff.locator('tbody tr').first().getByText('Show').click();
  assert((await staff.locator('tbody tr').first().locator('pre').textContent()).includes('{'), 'details can be expanded');
  await shot(staff, 'admin-audit');

  // Phone layout
  const phone = await ctx(null, { width: 390, height: 844 });
  for (const p of ['/saved', '/checkout', '/account/addresses']) {
    await go(phone, BASE + p);
    const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(overflow <= 1, `${p} fits a phone (overflow ${overflow}px)`);
  }

  assert(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
