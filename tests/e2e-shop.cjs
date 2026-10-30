const path = require('path');
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const BASE = 'http://localhost:3000';
const ROOT = path.resolve(__dirname, '..');
const OUT = process.argv[2] ?? path.resolve(__dirname, '.output');
fs.mkdirSync(OUT, { recursive: true });
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const sql = (q) => execSync(`docker exec supabase_db_Sleek-Connect psql -U postgres -At -c "${q}"`).toString().trim();
const simulate = (order, status, extra = '') => {
  try { return execSync(`npm run -s payments:simulate -- ${order} ${status} ${extra}`, { cwd: ROOT }).toString().trim(); }
  catch (e) { return 'ERR ' + e.stdout?.toString() + e.stderr?.toString(); }
};
const env = Object.fromEntries(fs.readFileSync(ROOT + '/apps/web/.env.local', 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const stock = (slug, size = '') => sql(`select on_hand || '/' || reserved from public.inventory_levels i join public.products p on p.id = i.product_id where p.slug = '${slug}' and i.size_code = '${size}'`);

async function fillDetails(page, { option = 'Same day', email } = {}) {
  await page.getByLabel('Full name').fill('Ama Owusu');
  await page.getByLabel('Phone number').fill('024 123 4567');
  if (email) await page.getByLabel('Email (optional)').fill(email);
  await page.getByLabel('Area in Accra').selectOption('Osu');
  await page.getByRole('radio', { name: new RegExp(option) }).check();
  await page.getByLabel('Wallet number').fill('024 765 4321');
}
async function go(page, url) {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
}
const bagCount = (page) => page.evaluate(() => {
  const key = Object.keys(localStorage).find(k => k.includes('bag'));
  return key ? JSON.parse(localStorage.getItem(key)).reduce((n, i) => n + i.qty, 0) : 0;
});
const statusPanel = (page) => page.locator('aside:visible').getByRole('status').filter({ hasNotText: 'Loading' });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const bag = page.locator('header a[aria-label^="Bag"]:visible');

  // --- #10 Shop by age -------------------------------------------------------
  await go(page, BASE + '/');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Shop by Age' }).click();
  await page.waitForURL('**/shop-by-age/1-2y');
  assert(await page.getByRole('heading', { name: '3 products for 1–2 years' }).or(page.getByRole('heading', { name: /3 products for/ })).isVisible(), 'shop by age lists the 1-2y products');
  const bandNav = page.getByRole('navigation', { name: 'Age band' });
  assert((await bandNav.locator('[aria-current="page"]').textContent()).includes('1'), 'current age band is marked');
  await page.getByRole('button', { name: 'Toys' }).click();
  assert(await page.getByRole('heading', { name: /2 products for/ }).isVisible(), 'toys filter narrows to 2');
  assert(await page.getByText('Sold out').first().isVisible(), 'sold-out puzzle is labelled');
  assert(await page.getByRole('button', { name: 'Wooden Number Puzzle is sold out' }).isDisabled(), 'sold-out add button disabled');
  await page.getByRole('button', { name: 'Clothing' }).click();
  assert(await page.getByText('Nothing here yet for this age').isVisible(), 'empty filter shows a message');
  await page.getByRole('button', { name: 'All' }).click();
  await bandNav.getByRole('link').first().click();
  await page.waitForURL('**/shop-by-age/0-6m');
  assert(await page.getByRole('link', { name: 'Newborn Gift Hamper' }).isVisible(), '0-6m band shows the hamper');
  await page.getByRole('button', { name: 'Add Organic Cotton Bodysuits, 3-pack to bag' }).click();
  assert((await bag.getAttribute('aria-label')) === 'Bag, 1 item', 'add to bag from shop by age');
  await page.screenshot({ path: OUT + '/shop-by-age.png' });
  const notFound = await page.request.get(BASE + '/shop-by-age/99y');
  assert((await notFound.text()).includes('could not be found'), 'unknown age band shows not found');

  // --- Sold out on the product page ----------------------------------------
  await go(page, BASE + '/products/gentle-baby-wash-shampoo');
  await page.getByRole('button', { name: '400 ml (sold out)' }).click();
  assert(await page.getByRole('button', { name: 'Sold out', exact: true }).first().isDisabled(), 'sold-out size disables add to bag');
  await page.getByRole('button', { name: '200 ml' }).click();
  await page.getByRole('button', { name: 'Increase quantity' }).click();
  await page.getByRole('button', { name: 'Add to bag' }).click();
  assert((await bag.getAttribute('aria-label')) === 'Bag, 3 items', 'two 200 ml added');

  // --- #16 Bag page ------------------------------------------------------------
  await bag.click();
  await page.waitForURL('**/bag');
  const lines = page.getByRole('list', { name: 'Items in your bag' }).getByRole('listitem');
  assert((await lines.count()) === 2, 'bag page lists 2 lines');
  const summary = page.getByRole('complementary', { name: 'Bag summary' });
  const subtotal = async () => (await summary.locator('dd').first().textContent()).trim();
  assert(await subtotal() === 'GH₵ 260', `subtotal 160 + 2 x 50 = 260 (${await subtotal()})`);
  await page.getByRole('button', { name: 'Increase quantity of Gentle Baby Wash & Shampoo, 200 ml' }).click();
  assert(await subtotal() === 'GH₵ 310', 'increase quantity updates subtotal');
  await page.getByRole('button', { name: 'Decrease quantity of Gentle Baby Wash & Shampoo, 200 ml' }).click();
  await page.getByRole('button', { name: 'Decrease quantity of Gentle Baby Wash & Shampoo, 200 ml' }).click();
  assert((await page.getByLabel('Quantity of Gentle Baby Wash & Shampoo, 200 ml', { exact: true }).textContent()) === '1', 'decrease quantity');
  assert(await page.getByRole('button', { name: 'Decrease quantity of Gentle Baby Wash & Shampoo, 200 ml' }).isDisabled(), 'cannot go below 1');
  await page.getByRole('button', { name: 'Remove Organic Cotton Bodysuits, 3-pack' }).click();
  assert((await lines.count()) === 1 && (await subtotal()) === 'GH₵ 50', 'remove a line');
  await page.reload({ waitUntil: 'networkidle' });
  assert((await lines.count()) === 1, 'bag edits persist across reload');
  await page.screenshot({ path: OUT + '/bag.png' });

  // A sold-out item that is already in the bag blocks checkout.
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.includes('bag'));
    const items = JSON.parse(localStorage.getItem(key));
    items.push({ ...items[0], slug: 'wooden-number-puzzle', name: 'Wooden Number Puzzle', sizeId: undefined, sizeLabel: undefined, unitPrice: 95, qty: 1 });
    localStorage.setItem(key, JSON.stringify(items));
  });
  await go(page, BASE + '/checkout');
  await fillDetails(page);
  await page.getByRole('button', { name: 'Pay with MTN MoMo' }).click();
  const alert = page.locator('aside:visible').getByRole('alert');
  await alert.waitFor();
  assert((await alert.textContent()) === 'Wooden Number Puzzle is sold out.', `database refuses sold-out stock (${await alert.textContent()})`);
  await go(page, BASE + '/bag');
  await page.getByRole('button', { name: 'Remove Wooden Number Puzzle' }).click();

  // --- #19 + #26: reserve stock, pay, confirm via signed webhook -------------
  if (process.env.DEBUG_NET) {
    const pendingReqs = new Map();
    page.on('request', r => pendingReqs.set(r, Date.now()));
    page.on('requestfinished', r => pendingReqs.delete(r));
    page.on('requestfailed', r => { console.log('  failed', r.url().slice(0, 100), r.failure()?.errorText); pendingReqs.delete(r); });
    setTimeout(() => { for (const [r, t] of pendingReqs) console.log('  pending', Date.now() - t, r.method(), r.url().slice(0, 120), r.headers()['next-router-prefetch'] ?? ''); }, 15000);
  }
  const before = stock('gentle-baby-wash-shampoo', '200');
  await go(page, BASE + '/checkout');
  assert(await page.getByLabel('Email (optional)').isVisible(), 'checkout asks for an optional email');
  await fillDetails(page, { email: 'Ama.Guest@Example.com' });
  await page.getByRole('button', { name: 'Pay with MTN MoMo' }).click();
  await statusPanel(page).filter({ hasText: 'Check your phone' }).waitFor();
  const text = await statusPanel(page).textContent();
  const order1 = text.match(/SC-\d+/)?.[0];
  assert(!!order1 && /held until \d{1,2}:\d{2}/.test(text), `payment requested for ${order1}, held-until shown`);
  assert(text.includes('Test mode'), 'test mode note shown');
  assert(stock('gentle-baby-wash-shampoo', '200') === before.replace(/\/(\d+)$/, (_, r) => '/' + (Number(r) + 1)), `stock reserved (${before} -> ${stock('gentle-baby-wash-shampoo', '200')})`);
  assert(sql(`select o.total_ghs || ' ' || p.amount_ghs || ' ' || p.status from public.orders o join public.payments p on p.order_id = o.id where o.order_number = '${order1}'`) === '80.00 80.00 pending', 'payment recorded for DB total 50 + 30 fee');
  assert(sql(`select string_agg(n.channel || ':' || n.recipient, ',') from public.notifications n join public.orders o on o.id = n.order_id where o.order_number = '${order1}' and n.template = 'order_received'`) === 'email:ama.guest@example.com', 'placing the order queued an "order received" email for the guest');
  assert(await bagCount(page) === 1, 'bag kept while payment is pending');
  await page.screenshot({ path: OUT + '/checkout-pending.png' });
  console.log('   simulate:', simulate(order1, 'succeeded'));
  await statusPanel(page).filter({ hasText: 'Payment received' }).waitFor({ timeout: 10000 });
  assert(true, 'checkout shows payment received');
  assert(sql(`select status from public.orders where order_number = '${order1}'`) === 'paid', 'order is paid');
  assert(sql(`select contact_email from public.orders where order_number = '${order1}'`) === 'ama.guest@example.com', 'the guest\'s email is kept on the order, in lower case');
  assert(sql(`select string_agg(n.channel || ':' || n.recipient, ',' order by n.channel) from public.notifications n join public.orders o on o.id = n.order_id where o.order_number = '${order1}' and n.template = 'order_confirmed'`) === 'email:ama.guest@example.com,sms:024 123 4567', 'a guest gets the confirmation by email as well as SMS');
  assert(stock('gentle-baby-wash-shampoo', '200') === `${Number(before.split('/')[0]) - 1}/${before.split('/')[1]}`, `reservation converted to sale (${stock('gentle-baby-wash-shampoo', '200')})`);
  await page.waitForTimeout(300);
  assert(await bagCount(page) === 0, 'bag cleared once paid');
  await page.screenshot({ path: OUT + '/checkout-paid.png' });
  console.log('   replay:', simulate(order1, 'succeeded'));

  // Replays and forgeries
  const ref1 = sql(`select provider_reference from public.payments p join public.orders o on o.id = p.order_id where o.order_number = '${order1}'`);
  const post = async (body, secret = env.PAYMENT_WEBHOOK_SECRET) => {
    const raw = JSON.stringify(body);
    const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
    const r = await page.request.post(BASE + '/api/payments/webhook', { data: raw, headers: { 'content-type': 'application/json', 'x-sleek-signature': sig } });
    return r.status();
  };
  assert(await post({ reference: ref1, status: 'succeeded', amount_ghs: 80 }) === 200, 'replayed success is accepted idempotently');
  assert(await post({ reference: ref1, status: 'failed', amount_ghs: 80 }) === 200 && sql(`select status from public.orders where order_number = '${order1}'`) === 'paid', 'late failure does not undo a paid order');
  assert(await post({ reference: ref1, status: 'succeeded', amount_ghs: 80 }, 'wrong-secret') === 401, 'forged signature rejected');
  assert(await post({ reference: 'nope', status: 'succeeded', amount_ghs: 80 }) === 422, 'unknown payment reference rejected');

  // Failed payment releases stock and keeps the bag
  await go(page, BASE + '/products/vitamin-c-brightening-serum');
  await page.getByRole('button', { name: 'Add to bag' }).click();
  const serumBefore = stock('vitamin-c-brightening-serum', '30');
  await go(page, BASE + '/checkout');
  await fillDetails(page);
  await page.getByRole('button', { name: 'Pay with MTN MoMo' }).click();
  await statusPanel(page).filter({ hasText: 'Check your phone' }).waitFor();
  const order2 = (await statusPanel(page).textContent()).match(/SC-\d+/)?.[0];
  console.log('   simulate:', simulate(order2, 'failed'));
  await statusPanel(page).filter({ hasText: 'Payment not completed' }).waitFor({ timeout: 10000 });
  assert(stock('vitamin-c-brightening-serum', '30') === serumBefore, `failed payment releases stock (${serumBefore})`);
  assert(await bagCount(page) === 1, 'bag kept after failed payment');
  await page.screenshot({ path: OUT + '/checkout-failed.png' });
  await page.getByRole('button', { name: 'Try again' }).click();
  assert(await page.getByRole('button', { name: 'Pay with MTN MoMo' }).isEnabled(), 'try again re-opens the form');

  // Wrong amount: flagged for review, not marked paid
  await page.getByRole('button', { name: 'Pay with MTN MoMo' }).click();
  await statusPanel(page).filter({ hasText: 'Check your phone' }).waitFor();
  const order3 = (await statusPanel(page).textContent()).match(/SC-\d+/)?.[0];
  assert(order3 && order3 !== order2, `retry places a new order (${order3})`);
  console.log('   simulate:', simulate(order3, 'succeeded', '--amount 1'));
  await statusPanel(page).filter({ hasText: 'checking your payment' }).waitFor({ timeout: 10000 });
  assert(sql(`select status || ' ' || needs_review from public.orders where order_number = '${order3}'`) === 'pending_payment true', 'amount mismatch is flagged for review, not paid');

  // Unpaid order expires and releases stock
  await go(page, BASE + '/checkout');
  await fillDetails(page);
  await page.getByRole('button', { name: 'Pay with MTN MoMo' }).click();
  await statusPanel(page).filter({ hasText: 'Check your phone' }).waitFor();
  const order4 = (await statusPanel(page).textContent()).match(/SC-\d+/)?.[0];
  sql(`update public.orders set reservation_expires_at = now() - interval '1 second' where order_number = '${order4}'`);
  sql('select public.expire_unpaid_orders()');
  await statusPanel(page).filter({ hasText: 'Order expired' }).waitFor({ timeout: 10000 });
  assert(sql(`select o.status || ' ' || p.status from public.orders o join public.payments p on p.order_id = o.id where o.order_number = '${order4}'`) === 'cancelled expired', 'expired order cancelled, payment expired');
  assert(simulate(order4, 'succeeded').startsWith('ERR'), 'no pending payment left to simulate after expiry');

  // Delivery option with no fee yet: order placed, honest message, no prompt
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.getByRole('radio', { name: /Standard/ }).check();
  await page.getByRole('button', { name: 'Pay with MTN MoMo' }).click();
  await statusPanel(page).filter({ hasText: 'placed' }).waitFor();
  const t5 = await statusPanel(page).textContent();
  assert(t5.includes('Delivery fees aren’t set yet') && t5.includes('held until'), 'no-fee order explains why no prompt was sent');
  const order5 = t5.match(/SC-\d+/)?.[0];
  assert(sql(`select count(*) from public.payments p join public.orders o on o.id = p.order_id where o.order_number = '${order5}'`) === '0', 'no payment started without a total');

  // Pay on delivery: no payment prompt; the bag is cleared; the order waits for staff to confirm it.
  await go(page, BASE + '/products/vitamin-c-brightening-serum');
  await page.getByRole('button', { name: 'Add to bag' }).click();
  await go(page, BASE + '/checkout');
  await fillDetails(page, { email: 'cod.guest@example.com' });
  await page.getByRole('radio', { name: /Pay on delivery/ }).check();
  assert(await page.getByText('Have GH₵').isVisible(), 'pay on delivery tells the shopper to have the cash ready');
  assert(!(await page.getByLabel('Wallet number').isVisible()), 'and hides the wallet number');
  await page.getByRole('button', { name: 'Place order, pay on delivery' }).click();
  await statusPanel(page).filter({ hasText: 'received' }).waitFor();
  const codText = await statusPanel(page).textContent();
  const codOrder = codText.match(/SC-\d+/)?.[0];
  assert(!!codOrder && codText.includes('call you to confirm'), `pay on delivery order ${codOrder} is placed, and says we will call`);
  assert(sql(`select o.status || ' ' || o.payment_method || ' ' || (select count(*) from public.payments p where p.order_id = o.id) from public.orders o where o.order_number = '${codOrder}'`) === 'pending_payment cod 0', 'it waits for confirmation with no payment started');
  assert(await bagCount(page) === 0, 'the bag is cleared at once: there is no payment to retry');

  assert(errors.length === 0, 'no page errors ' + errors.join(' | '));
  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
  process.exitCode = failures ? 1 : 0;
})();
