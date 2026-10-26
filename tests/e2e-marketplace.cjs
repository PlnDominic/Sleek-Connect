// Screens: the sell page, applying for a store, the owner's approval, payment and product review, the storefront and
// "Sold by" on a product page.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { sql, createUser, staffSession } = require('./lib.cjs');
const BASE = 'http://localhost:3000';
const OUT = process.argv[2] ?? path.resolve(__dirname, '.output');
fs.mkdirSync(OUT, { recursive: true });
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const stamp = Date.now();
async function go(page, url) { await page.goto(url, { waitUntil: 'load' }); await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {}); }
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = async (cookies) => {
    const c = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    if (cookies) await c.addCookies(cookies);
    const p = await c.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    return p;
  };

  await createUser(`boss+${stamp}@example.com`, undefined, { full_name: 'Boss' });
  sql(`insert into public.staff_members (email, role) values ('boss+${stamp}@example.com', 'admin')`);
  await createUser(`ama+${stamp}@example.com`, undefined, { full_name: 'Ama' });
  const bossSession = await staffSession(`boss+${stamp}@example.com`);
  const amaSession = await staffSession(`ama+${stamp}@example.com`);

  // --- Public pages ------------------------------------------------------------------------------
  const guest = await ctx();
  await go(guest, BASE + '/sell');
  assert(await guest.getByRole('heading', { name: 'Open your own store on Sleek Connect' }).isVisible(), 'the sell page invites vendors');
  assert(/GH₵\s?300/.test(await guest.locator('main').innerText()), 'it shows the yearly fee');
  await shot(guest, 'sell');
  await go(guest, BASE + '/vendor');
  const signIn = guest.getByRole('link', { name: 'Sign in to continue' });
  assert(await signIn.isVisible() && (await signIn.getAttribute('href')).includes('next=/vendor'), 'a signed-out visitor is asked to sign in first');
  await go(guest, BASE + '/store/sleek-connect');
  assert(await guest.getByRole('heading', { name: 'Sleek Connect', exact: true }).isVisible(), 'our own range has a store page too');
  assert((await guest.goto(BASE + '/store/no-such-store')).status() === 404, 'a store that does not exist is a 404');

  // --- Applying ----------------------------------------------------------------------------------
  const ama = await ctx(amaSession.cookies());
  await go(ama, BASE + '/vendor');
  assert(await ama.getByRole('heading', { name: 'Open your store' }).isVisible(), 'a signed-in shopper sees the application form');
  await ama.getByLabel('Store name').fill("Ama's Beauty Hub");
  await ama.getByLabel('Phone number we can reach you on').fill('024 123 4567');
  await ama.getByLabel(/I agree to the/).check();
  await ama.getByRole('button', { name: 'Send application' }).click();
  await ama.getByText(/Application sent/).waitFor({ timeout: 8000 });
  await go(ama, BASE + '/vendor');
  assert(await ama.getByText(/reviewing your application/).isVisible(), 'the vendor then sees that the application is being reviewed');
  await shot(ama, 'vendor-pending');

  // --- The owner approves and records the payment ------------------------------------------------
  const boss = await ctx(bossSession.cookies());
  await go(boss, BASE + '/admin/vendors');
  assert(await boss.getByRole('heading', { name: "Ama's Beauty Hub" }).isVisible(), 'the owner sees the application');
  await boss.getByRole('button', { name: 'Approve', exact: true }).click();
  await boss.getByText('Vendor approved.').waitFor({ timeout: 8000 });
  await boss.getByRole('button', { name: /Record payment/ }).click();
  await boss.getByText(/Payment recorded/).waitFor({ timeout: 8000 });
  await shot(boss, 'admin-vendors');
  await go(boss, BASE + '/admin');
  assert(await boss.getByRole('heading', { name: 'Needs attention' }).isVisible() && await boss.getByRole('heading', { name: 'Analytics' }).isVisible(), 'the dashboard shows sales and what needs attention');
  assert(await boss.getByRole('link', { name: 'Skip to content' }).count() === 1, 'there is a skip link for keyboard users');

  await go(ama, BASE + '/vendor');
  assert(await ama.getByRole('link', { name: 'Add a product' }).first().isVisible(), 'once paid, the vendor can add products');
  await shot(ama, 'vendor-dashboard');

  // --- A product: reviewed, marked up, on sale ---------------------------------------------------
  const { data: saved, error } = await amaSession.client.rpc('vendor_save_product', { p: {
    name: 'Shea Body Butter', brand: 'Ama Naturals', department: 'beauty', kind: 'jar', category_id: 'beauty-kits', price_ghs: 100, publish: true,
    description: 'Rich, unrefined shea butter.', ingredients: 'Shea butter', warnings: 'For external use only.', country_of_origin: 'Ghana', regulatory_reference: 'FDA/GH/2026/0001',
  } });
  assert(!error && saved?.slug, 'a vendor product can be added');
  sql(`update public.inventory_levels set on_hand = 10 where product_id = '${saved.id}'`);
  await go(boss, BASE + '/admin/search?q=shea');
  assert(await boss.getByRole('link', { name: 'Shea Body Butter' }).isVisible(), 'the admin search finds a product by name');
  await go(boss, BASE + '/admin/vendors?tab=products');
  assert(await boss.getByRole('heading', { name: 'Shea Body Butter' }).isVisible(), 'it appears in the owner\'s review queue');
  await boss.getByLabel('Your markup (%)').fill('15');
  await boss.getByRole('button', { name: 'Approve at this markup' }).click();
  await boss.getByText('Product approved.').waitFor({ timeout: 8000 });

  const shopper = await ctx();
  await go(shopper, BASE + '/products/' + saved.slug);
  assert(await shopper.getByText('GH₵115.00').first().isVisible(), 'shoppers see the vendor price plus the markup');
  assert(await shopper.getByRole('link', { name: "Ama's Beauty Hub" }).isVisible(), 'the product page says who sells it');
  await shot(shopper, 'product-sold-by');
  await shopper.getByRole('link', { name: "Ama's Beauty Hub" }).click();
  await shopper.waitForURL('**/store/amas-beauty-hub');
  assert(await shopper.getByRole('heading', { name: "Ama's Beauty Hub" }).isVisible() && await shopper.getByText('Shea Body Butter').first().isVisible(), 'the storefront lists the product');
  await shot(shopper, 'storefront');
  await go(shopper, BASE + '/search?q=shea');
  assert(await shopper.getByText('Shea Body Butter').first().isVisible(), 'vendor products appear in the main search');

  assert(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join('; ') : ''));
  await browser.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll marketplace screen checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
