const path = require('path');
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const { URL_, KEY, sql, createUser, staffSession, createClient } = require('./lib.cjs');
const BASE = 'http://localhost:3000';
const ROOT = path.resolve(__dirname, '..');
const OUT = process.argv[2] ?? path.resolve(__dirname, '.output');
fs.mkdirSync(OUT, { recursive: true });
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const stamp = Date.now();
const until = async (fn, ms = 8000) => { const end = Date.now() + ms; let v; while (Date.now() < end) { v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 250)); } return v; };
async function go(page, url) { await page.goto(url, { waitUntil: 'load' }); await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {}); }
const visible = (page) => page.locator('main:visible, [role="main"]:visible').first();
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = async (cookies) => { const c = await browser.newContext({ viewport: { width: 1360, height: 900 } }); if (cookies) await c.addCookies(cookies); const p = await c.newPage(); p.on('pageerror', (e) => errors.push(e.message)); return p; };

  // People
  for (const [k, role] of [['boss', 'admin'], ['ops', 'operations'], ['cat', 'catalogue'], ['rookie', 'operations'], ['stranger', null], ['buyer', null]]) {
    await createUser(`${k}+${stamp}@example.com`, undefined, { full_name: k });
    if (role) sql(`insert into public.staff_members (email, role) values ('${k}+${stamp}@example.com', '${role}')`);
  }
  const ops = await staffSession(`ops+${stamp}@example.com`);
  const cat = await staffSession(`cat+${stamp}@example.com`);
  const boss = await staffSession(`boss+${stamp}@example.com`);

  // --- Gate --------------------------------------------------------------------------------
  const anon = await ctx();
  let authorizeUrl = null;
  await anon.route('**/auth/v1/authorize**', (route) => { authorizeUrl = route.request().url(); route.fulfill({ status: 200, body: 'stub' }); });
  await go(anon, BASE + '/admin');
  assert(await anon.getByRole('heading', { name: 'Welcome back' }).isVisible() && await anon.getByRole('button', { name: 'Continue with Google' }).isVisible(), 'signed-out visitors see the staff sign-in with Google');
  assert((await anon.locator('nav[aria-label="Admin"]').count()) === 0, 'no admin navigation before sign-in');
  assert((await anon.getByText(/two-step|authenticator|6-digit/i).count()) === 0 && (await anon.getByRole('textbox').count()) === 0, 'the sign-in asks for nothing but Google');
  await shot(anon, 'admin-signin');
  await anon.getByRole('button', { name: 'Continue with Google' }).click();
  await until(() => authorizeUrl);
  const auth = authorizeUrl && new URL(authorizeUrl);
  const redirectTo = auth && new URL(auth.searchParams.get('redirect_to'));
  assert(auth?.searchParams.get('provider') === 'google' && redirectTo?.pathname === '/auth/callback' && redirectTo.searchParams.get('next') === '/admin', 'Google sign-in returns to the console');
  assert(!redirectTo.searchParams.has('consent') && !auth.searchParams.has('prompt'), 'staff aren’t asked for shopper consent, and Google picks the signed-in account');
  const failed = await ctx();
  await go(failed, BASE + '/auth/callback?code=bogus&next=/admin');
  assert(failed.url().endsWith('/admin?error=signin') && await failed.getByText('We couldn’t complete that sign-in').isVisible(), 'a failed Google sign-in returns to the staff sign-in with a message');
  const stranger = await ctx((await staffSession(`stranger+${stamp}@example.com`)).cookies());
  await go(stranger, BASE + '/admin/orders');
  assert(await stranger.getByRole('heading', { name: 'No staff access' }).isVisible() && await stranger.getByText(`stranger+${stamp}@example.com`).isVisible(), 'non-staff accounts are turned away, showing which account it was');
  assert(await stranger.getByRole('button', { name: 'Use a different Google account' }).isVisible() && await stranger.getByRole('button', { name: 'Sign out' }).isVisible(), 'they can switch account or sign out');
  await shot(stranger, 'admin-nostaff');
  let switchUrl = null;
  await stranger.route('**/auth/v1/authorize**', (route) => { switchUrl = route.request().url(); route.fulfill({ status: 200, body: 'stub' }); });
  await stranger.getByRole('button', { name: 'Use a different Google account' }).click();
  await until(() => switchUrl);
  assert(new URL(switchUrl).searchParams.get('prompt') === 'select_account', 'switching accounts makes Google show the account chooser');
  // A staff member goes straight in: no code to enter, nothing to set up.
  const rookie = await ctx((await staffSession(`rookie+${stamp}@example.com`)).cookies());
  await go(rookie, BASE + '/admin');
  await rookie.getByRole('heading', { name: 'Dashboard' }).waitFor({ timeout: 10000 });
  assert(await rookie.getByRole('navigation', { name: 'Admin' }).isVisible(), 'staff reach the console straight after signing in with Google');
  assert((await rookie.getByText(/two-step|authenticator|6-digit/i).count()) === 0, 'no second step anywhere');
  assert((await rookie.getByRole('link', { name: 'Staff' }).count()) === 0, 'Staff page hidden from non-admins');
  await rookie.getByRole('button', { name: 'Sign out' }).click();
  await rookie.getByRole('heading', { name: 'Welcome back' }).waitFor();
  assert(true, 'signing out returns to the sign-in');

  // --- Customer places and pays --------------------------------------------------------------
  const shopper = await ctx();
  await go(shopper, BASE + '/products/vitamin-c-brightening-serum');
  await shopper.getByRole('button', { name: 'Add to bag' }).click();
  await go(shopper, BASE + '/checkout');
  await shopper.getByLabel('Full name').fill('Ama Owusu');
  await shopper.getByLabel('Phone number').fill('024 123 4567');
  await shopper.getByLabel('Area in Accra').selectOption('Osu');
  await shopper.getByRole('radio', { name: /Same day/ }).check();
  await shopper.getByLabel('Wallet number').fill('024 765 4321');
  await shopper.getByLabel('This is a gift (wrap it and hide prices)').check();
  await shopper.getByRole('button', { name: 'Pay with MTN MoMo' }).click();
  const panel = shopper.locator('aside:visible').getByRole('status');
  await panel.filter({ hasText: 'Check your phone' }).waitFor();
  const orderNumber = (await panel.textContent()).match(/SC-\d+/)[0];
  execSync(`npm run -s payments:simulate -- ${orderNumber} succeeded`, { cwd: ROOT });
  await panel.filter({ hasText: 'Payment received' }).waitFor({ timeout: 10000 });
  await shopper.getByRole('link', { name: 'View order and receipt' }).click();
  await shopper.waitForURL('**/orders/*');
  const orderUrl = shopper.url();
  await shopper.getByRole('heading', { name: 'Order confirmed' }).waitFor();
  const code = sql(`select delivery_code from public.orders where order_number = '${orderNumber}'`);
  assert((await shopper.getByText(code, { exact: true }).count()) === 1, 'order page shows the delivery code');
  assert(await shopper.getByRole('heading', { name: `Order ${orderNumber}` }).isVisible(), 'confirmation shows the order number');
  const steps = await shopper.locator('ol li').allTextContents();
  assert(steps[0].startsWith('✓Order placed') && steps[1].includes('Payment confirmed') && steps.some((s) => s.includes('Delivered')), `timeline shows progress (${steps.map((s) => s.slice(0, 22)).join(' | ')})`);
  await shot(shopper, 'order-confirmed');
  assert(await until(() => sql(`select count(*) from public.notifications where order_id = (select id from public.orders where order_number = '${orderNumber}') and status = 'sent'`) === '1'), 'confirmation SMS sent through the console provider');
  await shopper.getByRole('link', { name: 'View receipt' }).click();
  await shopper.getByRole('heading', { name: 'Receipt' }).waitFor();
  assert(await shopper.getByRole('button', { name: 'Print or save as PDF' }).isVisible() && (await shopper.getByText('Total paid').count()) === 1, 'receipt page with print button');
  await shot(shopper, 'receipt');

  // --- Operations: pack, dispatch, deliver -------------------------------------------------------
  const op = await ctx(ops.cookies());
  await go(op, BASE + '/admin');
  const toPack = op.getByRole('link', { name: /To pack/ });
  assert((await toPack.textContent()).includes('1'), 'dashboard counts the order to pack');
  await shot(op, 'admin-dashboard');
  await go(op, BASE + '/admin/riders');
  await op.getByRole('textbox', { name: 'Name' }).first().fill('Kofi Asante');
  await op.getByRole('textbox', { name: 'Phone' }).first().fill('020 111 2222');
  await op.getByRole('button', { name: 'Add rider' }).click();
  await op.getByText('Rider added.').waitFor();
  await go(op, BASE + '/admin/orders');
  await op.getByRole('checkbox', { name: `Select order ${orderNumber}` }).check();
  await shot(op, 'admin-orders');
  await op.getByRole('button', { name: 'Mark selected as packed' }).click();
  await op.getByText('1 order packed.').waitFor();
  assert(true, 'bulk pack from the queue');
  await go(op, `${BASE}/admin/orders/${orderNumber}`);
  assert((await op.getByText(/Packed from 1 × batch STARTER/).count()) === 1, 'order shows the batch it was packed from');
  assert((await op.getByText(code, { exact: true }).count()) === 0, 'staff never see the delivery code');
  await op.getByLabel('Rider').selectOption({ label: 'Kofi Asante · Motorbike' });
  await op.getByRole('button', { name: 'Hand over for delivery' }).click();
  await op.getByText(/Out for delivery/).first().waitFor();
  await op.getByRole('heading', { name: 'Delivered' }).waitFor();
  await op.getByLabel('Customer’s delivery code').fill(code === '0000' ? '1111' : '0000');
  await op.getByRole('button', { name: 'Mark as delivered' }).click();
  await op.getByRole('alert').filter({ hasText: /doesn.t match/ }).waitFor();
  assert(true, 'wrong code refused in the console');
  await go(shopper, orderUrl);
  await shopper.getByRole('heading', { name: 'On the way' }).waitFor();
  assert(await shopper.getByText('Kofi Asante', { exact: true }).isVisible(), 'customer sees the rider');
  await op.getByLabel('Customer’s delivery code').fill(code);
  await op.getByRole('button', { name: 'Mark as delivered' }).click();
  await op.getByText('Marked as delivered.').waitFor();
  await shot(op, 'admin-order-delivered');
  await go(shopper, orderUrl);
  await shopper.getByRole('heading', { name: 'Delivered' }).first().waitFor();
  assert((await shopper.getByText(/Batch STARTER/).count()) >= 1, 'customer sees the batch and expiry of what they got');
  assert(await until(() => sql(`select string_agg(template, ',' order by created_at) from public.notifications where order_id = (select id from public.orders where order_number = '${orderNumber}') and channel = 'sms' and status = 'sent'`) === 'order_confirmed,order_packed,out_for_delivery,order_delivered'), 'each customer message was sent');
  await go(op, `${BASE}/admin/orders/${orderNumber}/slip`);
  assert(await op.getByText('A gift for you').isVisible() && (await op.getByText('Amount').count()) === 0, 'gift packing slip hides prices');

  // --- Catalogue: create, fix, publish ---------------------------------------------------------------
  const ct = await ctx(cat.cookies());
  await go(ct, BASE + '/admin/products/new');
  await ct.getByRole('textbox', { name: 'Name', exact: true }).fill('Moringa Face Mist');
  await ct.getByRole('combobox', { name: 'Category' }).selectOption('skincare');
  await ct.getByRole('textbox', { name: 'Price (GH₵)' }).fill('75');
  await ct.getByRole('checkbox', { name: 'Show on the store' }).check();
  await ct.getByRole('button', { name: 'Create product' }).click();
  await ct.waitForURL('**/admin/products/*?done=*');
  assert(await ct.getByText(/Product created as a draft/).isVisible(), 'new product starts as a draft');
  assert((await ct.locator('p').filter({ hasText: 'Needed before it can go on the store' }).textContent()).includes('FDA registration number'), 'missing compliance fields listed');
  await ct.getByRole('textbox', { name: 'Brand' }).fill('Accra Botanics');
  await ct.getByRole('textbox', { name: 'Description' }).fill('A refreshing moringa mist.');
  await ct.getByRole('textbox', { name: /Ingredients/ }).fill('Aqua, Moringa Oleifera Leaf Extract');
  await ct.getByRole('textbox', { name: 'Safety notes' }).fill('Avoid contact with eyes.');
  await ct.getByRole('textbox', { name: 'Country of origin' }).fill('Ghana');
  await ct.getByRole('textbox', { name: 'FDA registration number' }).fill('FDA/CB.24-777');
  await ct.getByRole('checkbox', { name: 'Show on the store' }).check();
  await ct.getByRole('button', { name: 'Save changes' }).click();
  await ct.getByText('Saved. It’s live on the store.').waitFor();
  await shot(ct, 'admin-product-edit');
  const store = await ctx();
  await go(store, BASE + '/products/moringa-face-mist');
  assert(await store.getByRole('heading', { name: 'Moringa Face Mist' }).isVisible(), 'published product appears on the store');
  await store.getByRole('tab', { name: 'Safety & age' }).click();
  assert(await store.getByText('FDA/CB.24-777').isVisible(), 'product page shows the FDA number from the catalogue');
  // CSV import
  const csv = 'slug,name,brand,department,category,kind,price,description,ingredients,warnings,country_of_origin,regulatory_reference,sizes,publish\n' +
    'neem-soap,Neem Soap,Accra Botanics,beauty,skincare,jar,,Gentle neem soap.,"Sodium Palmate, Neem Oil",External use only.,Ghana,FDA/CB.24-778,"*100:100 g:30;200:200 g:55",yes\n' +
    'bad-row,Bad Row,X,beauty,skincare,spaceship,10,,,,,,,no\n';
  fs.writeFileSync(`${OUT}/import.csv`, csv);
  await go(ct, BASE + '/admin/products/import');
  await ct.getByLabel('CSV file').setInputFiles(`${OUT}/import.csv`);
  await ct.getByText('2 rows: 1 ready to import').waitFor();
  assert((await ct.getByRole('row').filter({ hasText: 'Bad Row' }).textContent()).includes('kind must be one of'), 'import preview flags the bad row');
  await ct.getByRole('button', { name: 'Import 1 row' }).click();
  await ct.getByText(/Done: 1 published, 0 saved as drafts, 1 not imported/).waitFor();
  assert(sql("select is_published::text || ' ' || price_ghs from public.products where slug = 'neem-soap'") === 'true 30.00', 'imported row published with its default size price');
  await shot(ct, 'admin-import');
  await go(ct, `${BASE}/admin/orders/${orderNumber}`);
  assert(await ct.getByText('Your role can view this order but not move it along.').isVisible(), 'catalogue role cannot fulfil orders');

  // --- Inventory: receive, quarantine ------------------------------------------------------------------
  const pid = sql("select id from public.products where slug = 'moringa-face-mist'");
  await go(op, `${BASE}/admin/inventory/${pid}`);
  await op.getByText('Receive stock').first().click();
  await op.getByLabel('Batch number').fill('mfm-01');
  await op.getByLabel('Units received').fill('12');
  await op.getByRole('button', { name: 'Receive stock' }).click();
  await op.getByRole('alert').filter({ hasText: 'expiry date' }).waitFor();
  assert(true, 'receiving a cosmetic without expiry is refused');
  await op.getByLabel('Expiry date').fill('2027-08-31');
  await op.getByRole('button', { name: 'Receive stock' }).click();
  await op.getByText('Received 12 into batch MFM-01.').waitFor();
  await go(op, `${BASE}/admin/inventory/${pid}`);
  assert((await op.getByRole('region', { name: 'Batches' }).getByRole('row').filter({ hasText: 'MFM-01' }).textContent()).includes('12'), 'batch listed with its units');
  await op.getByRole('region', { name: 'Batches' }).getByRole('row').filter({ hasText: 'MFM-01' }).getByText('Change').click();
  await op.getByRole('region', { name: 'Batches' }).getByRole('row').filter({ hasText: 'MFM-01' }).getByLabel('Note').nth(1).fill('Seal check');
  await op.getByRole('button', { name: 'Quarantine (take off sale)' }).click();
  await op.getByText('Batch quarantined.').waitFor();
  assert(sql(`select on_hand from public.inventory_levels where product_id = '${pid}'`) === '0', 'quarantine takes the stock off sale');
  await shot(op, 'admin-batches');
  await go(op, BASE + '/admin/inventory');
  await shot(op, 'admin-inventory');
  const exp = await op.request.get(BASE + '/admin/inventory/export?type=movements');
  assert(exp.status() === 200 && (await exp.text()).includes('quarantined'), 'movement log exports as CSV');
  assert((await anon.request.get(BASE + '/admin/inventory/export?type=movements')).status() === 401, 'export refused without staff sign-in');

  // --- Staff management -----------------------------------------------------------------------------------
  const bs = await ctx(boss.cookies());
  await go(bs, BASE + '/admin/staff');
  await bs.getByLabel('Google account email').fill(`New.Hire+${stamp}@Example.com`);
  await bs.getByRole('button', { name: 'Add', exact: true }).click();
  await bs.getByText(/Added\. They can now sign in/).waitFor();
  assert(sql(`select role from public.staff_members where email = 'new.hire+${stamp}@example.com'`) === 'operations', 'admin adds staff');
  await go(op, BASE + '/admin/staff');
  assert(await op.getByText('Only admins can manage staff.').isVisible(), 'non-admins cannot manage staff');

  // --- Shopper's order history ---------------------------------------------------------------------------
  const buyerSession = await staffSession(`buyer+${stamp}@example.com`);
  await buyerSession.client.rpc('place_order', { p_customer: { name: 'Buyer', phone: '0241234567', area: 'Osu' }, p_delivery_option: 'same_day', p_payment: { method: 'momo', network: 'mtn', wallet: '0241234567' }, p_items: [{ slug: 'argan-hair-oil', quantity: 2 }], p_is_gift: false });
  const buyer = await ctx(buyerSession.cookies());
  await go(buyer, BASE + '/account/orders');
  const row = buyer.getByRole('list', { name: 'Orders, newest first' }).getByRole('link');
  assert((await row.count()) === 1 && (await row.textContent()).includes('2 items') && (await row.textContent()).includes('Awaiting payment'), 'account lists the shopper’s orders');
  await shot(buyer, 'account-orders');
  await row.click();
  await buyer.getByRole('heading', { name: 'Waiting for payment' }).waitFor();
  assert(true, 'order history links to the order page');
  await go(anon, BASE + '/account/orders');
  assert(await anon.getByRole('link', { name: 'Sign in with Google' }).isVisible(), 'signed-out visitors are asked to sign in');

  assert(errors.length === 0, 'no page errors ' + errors.join(' | '));
  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
  process.exitCode = failures ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });
