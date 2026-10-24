// Browser checks: terms and privacy pages, saved Mobile Money numbers, reviews with moderation, data export and deletion.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('playwright');
const { sql, admin, createUser, staffSession } = require('./lib.cjs');
const BASE = 'http://localhost:3000';
const OUT = process.argv[2] ?? path.resolve(__dirname, '.output');
fs.mkdirSync(OUT, { recursive: true });
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const stamp = Date.now();
const until = async (fn, ms = 8000) => { const end = Date.now() + ms; let v; while (Date.now() < end) { v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 250)); } return v; };
async function go(page, url) { await page.goto(url, { waitUntil: 'load' }); await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {}); }
const main = (page) => page.locator('main:visible').first();
const reviewsOf = (page) => page.getByRole('region', { name: 'Customer reviews' });
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

const deliver = (number) => sql(`update public.orders set status = 'delivered', delivered_at = now() where order_number = '${number}'`);
async function placeAndPay(client, slug, { deliverIt = true } = {}) {
  const { data: o, error } = await client.rpc('place_order', {
    p_customer: { name: 'Ama Owusu', phone: '024 123 4567', area: 'Osu', directions: 'Blue gate' },
    p_delivery_option: 'standard',
    p_payment: { method: 'momo', network: 'mtn', wallet: '024 765 4321' },
    p_items: [{ slug, size: null, quantity: 1 }], p_is_gift: false,
  }).single();
  if (error) throw error;
  const ref = `T-${o.order_number}`;
  await admin.rpc('start_payment', { p_order_token: o.order_token, p_provider: 'test', p_reference: ref });
  await admin.rpc('confirm_payment', { p_provider: 'test', p_reference: ref, p_status: 'succeeded', p_amount_ghs: o.total_ghs });
  if (deliverIt) deliver(o.order_number);
  return o;
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = async (cookies, viewport = { width: 1360, height: 900 }) => {
    const c = await browser.newContext({ viewport, acceptDownloads: true });
    if (cookies) await c.addCookies(cookies);
    const p = await c.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('dialog', (d) => d.accept());
    return p;
  };
  sql("update public.delivery_options set fee_ghs = 20 where id = 'standard'");
  const make = async (k, role) => {
    const u = await createUser(`${k}+${stamp}@example.com`, undefined, { full_name: `${k} Owusu` });
    if (role) sql(`insert into public.staff_members (email, role) values ('${k}+${stamp}@example.com', '${role}')`);
    else sql(`insert into public.profiles (id, confirmed_adult_at, accepted_terms_at) values ('${u.id}', now(), now())`);
    return { id: u.id, ...(await staffSession(`${k}+${stamp}@example.com`)) };
  };
  const ama = await make('ama');
  const esi = await make('esi');
  const kofi = await make('kofi');
  const cat = await make('cat', 'catalogue');

  // --- Terms of service and privacy notice (FR-003) ---------------------------------------------
  const guest = await ctx();
  for (const [url, heading, text] of [['/terms', 'Terms of service', 'Returns and refunds'], ['/privacy', 'Privacy notice', 'Your rights']]) {
    await go(guest, BASE + url);
    assert(await guest.getByRole('heading', { level: 1, name: heading }).isVisible() && (await main(guest).textContent()).includes(text) && await guest.getByRole('navigation', { name: 'Contents' }).isVisible(), `${url} is a real page with a contents list`);
  }
  assert((await main(guest).textContent()).includes('Data Protection Act, 2012') && await main(guest).getByRole('link', { name: 'Privacy and your data' }).isVisible(), 'the privacy notice names the law and links to the data tools');
  assert((await guest.locator('footer').getByRole('link', { name: 'Terms of service' }).getAttribute('href')) === '/terms' && (await guest.locator('footer').getByRole('link', { name: 'Privacy notice' }).getAttribute('href')) === '/privacy', 'the footer links to both');
  await go(guest, BASE + '/account');
  const consent = main(guest).locator('label', { hasText: 'I\'m 18 or older' });
  assert((await consent.getByRole('link', { name: 'Terms of Service' }).getAttribute('href')) === '/terms' && (await consent.getByRole('link', { name: 'Privacy Notice' }).getAttribute('href')) === '/privacy', 'the sign-in consent links to them');
  await shot(guest, 'privacy-notice');

  // --- Saved Mobile Money numbers (FR-021) -------------------------------------------------------
  const pe = await ctx(esi.cookies());
  await go(pe, BASE + '/account/payment-methods');
  assert(await main(pe).getByRole('heading', { name: 'Your Mobile Money numbers' }).isVisible(), 'the page opens for a signed-in shopper');
  await main(pe).getByLabel('Mobile Money number').fill('not a number');
  await main(pe).getByRole('button', { name: 'Save number' }).click();
  await main(pe).getByRole('alert').filter({ hasText: 'valid' }).waitFor();
  assert(true, 'a bad number is refused with a plain message');
  await main(pe).getByLabel('Mobile Money number').fill('024 765 4321');
  await main(pe).getByLabel('Name').fill('Mine');
  await main(pe).getByRole('button', { name: 'Save number' }).click();
  const card = main(pe).getByRole('listitem', { name: /Mine/ });
  await card.waitFor();
  assert((await card.textContent()).includes('•••• 4321') && !(await card.textContent()).includes('765') && (await card.textContent()).includes('Default'), 'the saved number shows only its last four digits, as the default');
  await shot(pe, 'payment-methods');

  // At checkout the saved number is ready; a new number can be saved too.
  await go(pe, BASE + '/products/argan-hair-oil');
  await pe.getByRole('button', { name: 'Add to bag' }).click();
  await go(pe, BASE + '/checkout');
  await pe.getByLabel('Full name').fill('Esi Mensah');
  await pe.getByLabel('Phone number').fill('024 555 0000');
  assert(await until(async () => (await pe.getByLabel('Wallet number').inputValue()) === '024 765 4321'), 'checkout fills in the default saved number');
  const picker = pe.getByLabel('Saved numbers');
  assert((await picker.locator('option:checked').textContent()).includes('•••• 4321') && (await pe.getByLabel('Save this number for next time').count()) === 0, 'it is picked in the list, and there is nothing new to save');
  await pe.getByLabel('Wallet number').fill('050 111 2222');
  await pe.getByRole('radio', { name: 'Telecel Cash' }).check();
  const saveBox = pe.getByLabel('Save this number for next time');
  assert(await saveBox.isChecked(), 'a new number offers to be saved, ticked by default');
  await shot(pe, 'checkout-saved-number');
  await pe.getByRole('button', { name: 'Pay with Telecel Cash' }).click();
  await pe.locator('aside:visible').getByRole('status').filter({ hasText: 'Check your phone' }).waitFor();
  assert(await until(() => sql(`select count(*) from public.saved_payment_methods where user_id = '${esi.id}'`) === '2'), 'placing the order saves the new number');
  assert(sql(`select network from public.saved_payment_methods where user_id = '${esi.id}' and wallet_number = '050 111 2222'`) === 'telecel', 'with its network');
  await go(pe, BASE + '/account/payment-methods');
  await main(pe).getByRole('listitem', { name: /Telecel/ }).getByRole('button', { name: 'Remove' }).click();
  assert(await until(async () => (await main(pe).getByRole('listitem').count()) === 1), 'a number can be removed');

  // --- Reviews with moderation (FR-065) ----------------------------------------------------------
  const slug = 'vitamin-c-brightening-serum';
  await placeAndPay(ama.client, slug);
  const pa = await ctx(ama.cookies());
  const pk = await ctx(kofi.cookies());
  await go(guest, BASE + `/products/${slug}`);
  assert((await reviewsOf(guest).textContent()).includes('No reviews yet.') && await reviewsOf(guest).getByRole('link', { name: 'Sign in' }).isVisible(), 'guests see no reviews yet and are asked to sign in to review');
  await go(pk, BASE + `/products/${slug}`);
  await pk.getByText('Only customers who have received this product can review it.').waitFor();
  assert(await pk.getByRole('form', { name: 'Write a review' }).count() === 0, 'a shopper who hasn’t received it can’t write one');
  await go(pa, BASE + `/products/${slug}`);
  const form = pa.getByRole('form', { name: 'Write a review' });
  await form.waitFor();
  assert(await form.getByRole('button', { name: 'Submit review' }).isDisabled(), 'the review needs a rating first');
  await form.getByRole('radio', { name: '5 stars' }).check();
  await form.getByLabel('Title').fill('Glowing skin');
  await form.getByLabel('Your review').fill('My skin looks brighter after two weeks of daily use.');
  await form.getByRole('button', { name: 'Submit review' }).click();
  const mine = pa.getByLabel('Your review', { exact: true }).filter({ hasText: 'Waiting to be checked' });
  await mine.waitFor();
  assert(true, 'the author sees their review as waiting to be checked');
  await go(guest, BASE + `/products/${slug}`);
  assert(!(await reviewsOf(guest).textContent()).includes('brighter after two weeks'), 'nobody else sees it yet');

  const ps = await ctx(cat.cookies());
  await go(ps, BASE + '/admin/reviews');
  const item = ps.getByRole('region', { name: /Review of Vitamin C Brightening Serum by Ama O\./ });
  await item.waitFor();
  assert((await item.textContent()).includes('My skin looks brighter') && (await item.textContent()).includes('verified purchase') && !(await item.textContent()).includes(`ama+${stamp}`), 'staff see the review, the short name and “verified purchase”, not the account');
  assert(await ps.getByRole('link', { name: 'Reviews' }).first().isVisible(), 'Reviews is in the admin menu');
  await item.getByRole('button', { name: 'Reject' }).click();
  await ps.getByRole('alert').filter({ hasText: 'reason' }).waitFor();
  assert(true, 'rejecting needs a reason');
  await item.getByLabel(/Reason/).fill('Please describe the serum itself.');
  await item.getByRole('button', { name: 'Reject' }).click();
  await ps.getByText('Review rejected.').waitFor();
  await go(pa, BASE + `/products/${slug}`);
  await pa.getByText('Our team said: Please describe the serum itself.').waitFor();
  assert(true, 'the author is told why it was rejected');
  await pa.getByRole('button', { name: 'Edit' }).click();
  await pa.getByRole('form', { name: 'Write a review' }).getByLabel('Your review').fill('The serum absorbs quickly and my skin looks brighter and more even.');
  await pa.getByRole('button', { name: 'Submit review' }).click();
  await pa.getByLabel('Your review', { exact: true }).filter({ hasText: 'Waiting to be checked' }).waitFor();
  await go(ps, BASE + '/admin/reviews');
  await ps.getByRole('region', { name: /Review of Vitamin C/ }).getByRole('button', { name: 'Publish' }).click();
  await ps.getByText('Review published.').waitFor();
  assert(true, 'staff publish the edited review');
  assert(await until(async () => { await go(guest, BASE + `/products/${slug}`); return (await reviewsOf(guest).textContent()).includes('absorbs quickly'); }, 20000), 'everyone now sees it on the product page');
  const text = await reviewsOf(guest).textContent();
  assert(text.includes('5.0') && text.includes('1 review') && text.includes('Ama O.') && text.includes('Verified purchase'), 'with the rating summary and the short name');
  assert((await main(guest).getByRole('link', { name: /5\.0 \(1 review\)/ }).count()) === 1, 'the rating shows near the product name');
  const ld = (await guest.locator('script[type="application/ld+json"]').allTextContents()).map((t) => JSON.parse(t)).find((d) => d['@type'] === 'Product');
  assert(ld.aggregateRating?.ratingValue === '5.0' && ld.aggregateRating.reviewCount === 1 && ld.review?.[0]?.author?.name === 'Ama O.', 'search engines get the rating in the structured data');
  await shot(guest, 'product-reviews');
  await go(ps, BASE + '/admin');
  assert((await ps.getByText('Reviews to check').count()) === 1, 'the dashboard counts reviews to check');

  // --- Your data: export and delete (FR-057) -----------------------------------------------------
  await placeAndPay(ama.client, 'whipped-shea-body-butter', { deliverIt: false });
  await go(pa, BASE + '/account/privacy');
  const [download] = await Promise.all([pa.waitForEvent('download'), pa.getByRole('link', { name: 'Download my data' }).click()]);
  const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  assert(/^sleek-connect-store-data-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()) && exported.account.email === `ama+${stamp}@example.com` && exported.orders.length === 2 && exported.reviews.length === 1, 'the data downloads as a file with the account, orders and reviews');
  assert(!JSON.stringify(exported).includes('public_token') && !JSON.stringify(exported).includes('delivery_code'), 'without the order link or delivery code');
  assert((await guest.request.get(BASE + '/account/privacy/export')).status() === 401, 'guests can’t download anything');
  const blocked = main(pa).getByRole('status').filter({ hasText: 'still in progress' });
  await blocked.waitFor();
  assert(await main(pa).getByRole('button', { name: 'Delete my account' }).count() === 0, 'an order in progress blocks deletion, and says so');
  await shot(pa, 'account-privacy');
  const inProgress = sql(`select order_number from public.orders where user_id = '${ama.id}' and status <> 'delivered'`);
  deliver(inProgress);
  await go(pa, BASE + '/account/privacy');
  const del = main(pa).getByRole('button', { name: 'Delete my account' });
  assert(await del.isDisabled(), 'deleting needs you to type DELETE');
  await main(pa).getByLabel('Type DELETE to confirm').fill('delete');
  assert(await del.isEnabled(), 'in any case');
  await del.click();
  await pa.waitForURL(/\/account\/deleted/);
  assert(await pa.getByRole('heading', { name: 'Your account has been deleted' }).isVisible(), 'the shopper is told it is done');
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 200 });
  assert(!users.users.some((u) => u.email === `ama+${stamp}@example.com`), 'the sign-in is gone');
  assert(sql(`select count(*) from public.orders where customer_name = 'Ama Owusu'`) === '0' && sql(`select count(*) from public.orders where customer_name = 'Deleted customer' and phone = '' and user_id is null`) === '2', 'her orders stay for the shop’s records without her details');
  assert(sql(`select count(*) from public.product_reviews`) === '0', 'her review is gone');
  await go(guest, BASE + `/products/${slug}`);
  assert(await until(async () => { await go(guest, BASE + `/products/${slug}`); return (await reviewsOf(guest).textContent()).includes('No reviews yet.'); }, 20000), 'and the product page no longer shows it');

  // Phones: the new pages fit.
  const mp = await ctx(esi.cookies(), { width: 390, height: 844 });
  for (const url of ['/terms', '/privacy', '/account/payment-methods', '/account/privacy', `/products/${slug}`]) {
    await go(mp, BASE + url);
    const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(overflow <= 1, `${url} fits a phone screen (overflow ${overflow}px)`);
  }

  assert(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
