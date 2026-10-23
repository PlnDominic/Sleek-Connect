const fs = require('fs');
const path = require('path');
// Batch 3 browser checks: shop pages, filters, search, banners, warnings, tracking, returns, help centre, support.
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
const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
const count = (page) => page.locator('#results-count:visible').first().textContent();

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

  // Data: 20 extra products for paging, a warning label, a shade and a product that can't be returned.
  sql(`insert into public.products (slug, name, brand, department, category_id, kind, price_ghs, tag, summary, tint, is_published, created_at)
       select 'test-product-' || n, 'Test Product ' || n, 'Test Brand', 'beauty', 'skincare', 'bottle', n, 'Test', 'A test product.', '#EEEEEE', true, now() - make_interval(days => 30 + n)
       from generate_series(1, 20) n`);
  sql(`insert into public.inventory_levels (product_id, size_code, on_hand) select id, '', 5 from public.products where slug like 'test-product-%' on conflict (product_id, size_code) do update set on_hand = 5`);
  sql("update public.products set warning_label = 'Choking hazard: small parts. Not for children under 3.' where slug = 'wooden-stacking-blocks'");
  sql("update public.products set returnable = false, shades = '{Ruby,Nude}' where slug = 'velvet-matte-lip-colour'");
  await createUser(`boss+${stamp}@example.com`);
  sql(`insert into public.staff_members (email, role) values ('boss+${stamp}@example.com', 'admin')`);
  const boss = await staffSession(`boss+${stamp}@example.com`);
  const staff = await ctx(boss.cookies());

  // --- Content: banners and featured products (FR-010) ------------------------------------------
  await go(staff, BASE + '/admin/content');
  const hero = staff.locator('details', { has: staff.locator('summary', { hasText: 'Home page hero' }) }).first();
  await hero.locator('summary').click();
  await hero.getByLabel('Title').fill('Fresh Picks\nFor You');
  await hero.getByRole('button', { name: 'Save banner' }).click();
  await hero.getByRole('status').filter({ hasText: 'Banner saved.' }).waitFor();
  assert(true, 'staff edit the hero banner');
  const add = staff.locator('details', { hasText: 'Add a banner' });
  await add.locator('summary').click();
  await add.getByLabel('Small heading').fill('This weekend');
  await add.getByLabel('Title').fill('Weekend Deal');
  await add.getByLabel('Button label', { exact: true }).fill('Shop deals');
  await add.getByLabel('Button link', { exact: true }).fill('javascript:alert(1)');
  await add.getByLabel('Countdown to').fill('2030-01-01T18:00');
  await add.getByRole('button', { name: 'Add banner' }).click();
  await add.getByRole('alert').filter({ hasText: 'Links must start' }).waitFor();
  assert(await add.getByLabel('Title').inputValue() === 'Weekend Deal', 'unsafe link refused, form keeps what was typed');
  await add.getByLabel('Button link', { exact: true }).fill('/shop?sale=1');
  await add.getByRole('button', { name: 'Add banner' }).click();
  await staff.getByRole('status').filter({ hasText: 'Banner added.' }).waitFor();
  assert(true, 'staff add a promo banner');
  await go(staff, BASE + '/admin/content?tab=products');
  const best = staff.locator('article', { has: staff.locator('h2:text-is("Best Sellers")') });
  await best.locator('summary', { hasText: 'Edit list' }).click();
  await best.getByLabel('Products').fill('argan-hair-oil\n/products/vitamin-c-brightening-serum');
  await best.getByRole('button', { name: 'Save Best Sellers' }).click();
  await best.getByRole('status').filter({ hasText: 'Saved 2 products.' }).waitFor();
  assert(await best.locator('ol li').count() === 2, 'Best Sellers saved (product links accepted)');
  await shot(staff, 'admin-content');

  const shopper = await ctx();
  await go(shopper, BASE + '/');
  assert((await shopper.locator('h1').first().textContent()).includes('Fresh Picks'), 'home hero shows the edited banner');
  const promo = shopper.locator('div', { hasText: 'Weekend Deal' }).filter({ has: shopper.getByRole('link', { name: 'Shop deals' }) }).last();
  assert(await promo.isVisible() && await promo.getByRole('timer').count() === 1, 'new promo card shows with a countdown');
  assert(await shopper.locator('#best-sellers article').count() === 2, 'Best Sellers grid follows the admin list');
  await shot(shopper, 'home-banners');

  // --- Category pages, filters, sort, pages (FR-011, FR-013) ------------------------------------------
  await go(shopper, BASE + '/shop');
  assert((await count(shopper)).includes('1–24 of 30 products'), `shop lists every product, 24 per page (${await count(shopper)})`);
  await shopper.getByRole('navigation', { name: 'Pages' }).getByRole('link', { name: '2', exact: true }).click();
  await shopper.waitForURL(/page=2/);
  await shopper.locator('#results-count:visible', { hasText: '25–30 of 30' }).waitFor();
  assert(true, 'page 2 shows the rest');
  await go(shopper, BASE + '/shop');
  await main(shopper).getByRole('checkbox', { name: /Test Brand/ }).check();
  await shopper.waitForURL(/brand=Test/);
  await shopper.locator('#results-count:visible', { hasText: '20 products' }).waitFor();
  assert(true, 'brand filter narrows the results');
  await main(shopper).getByLabel('Sort by').selectOption('price-asc');
  await shopper.waitForURL(/sort=price-asc/);
  await shopper.waitForLoadState('networkidle').catch(() => {});
  assert((await main(shopper).locator('article').first().textContent()).includes('GH₵ 1'), 'sorted by price, lowest first');
  await main(shopper).getByRole('checkbox', { name: /GH₵ 50 – 100/ }).check();
  await shopper.locator('#results-count:visible', { hasText: 'No products' }).waitFor();
  assert(await main(shopper).getByRole('link', { name: 'Clear all filters' }).first().isVisible(), 'impossible combination shows no products and a way back');
  await go(shopper, BASE + '/shop/beauty/makeup');
  assert(await shopper.getByRole('heading', { level: 1, name: 'Makeup' }).isVisible(), 'category page');
  await main(shopper).getByRole('checkbox', { name: /Ruby/ }).check();
  await shopper.locator('#results-count:visible', { hasText: '1 product' }).waitFor();
  assert(true, 'shade filter on makeup');
  await go(shopper, BASE + '/shop/kids');
  assert(!(await main(shopper).textContent()).includes('Test Product'), 'department page only shows its products');
  await shot(shopper, 'shop-kids');

  // --- Search with typos and recent searches (FR-012) ---------------------------------------------------
  await go(shopper, BASE + '/search?q=serun');
  assert(await main(shopper).getByRole('link', { name: 'Vitamin C Brightening Serum' }).first().isVisible(), 'typo search finds the serum');
  await go(shopper, BASE + '/search');
  const box = main(shopper).getByRole('searchbox');
  await box.fill('argan oyl');
  await box.press('Enter');
  await shopper.waitForURL(/q=argan/);
  await main(shopper).getByRole('link', { name: /Argan Hair Oil/ }).first().waitFor();
  assert(true, 'search box finds "argan oyl"');
  await go(shopper, BASE + '/search');
  await main(shopper).getByRole('searchbox').fill('');
  await main(shopper).getByRole('searchbox').focus();
  const recent = shopper.getByRole('group', { name: 'Recent searches' });
  await recent.waitFor();
  assert(await recent.getByRole('button', { name: 'argan oyl' }).isVisible(), 'recent searches remembered');
  await recent.getByRole('button', { name: 'Clear recent searches' }).click();
  assert(await recent.count() === 0, 'recent searches can be cleared');

  // --- Suggestions, synonyms and "did you mean" -------------------------------------------------------
  await go(shopper, BASE + '/search');
  const sbox = main(shopper).getByRole('searchbox');
  await sbox.click();
  await sbox.pressSequentially('serun', { delay: 40 });
  const suggestions = shopper.getByRole('listbox', { name: 'Suggestions' });
  await suggestions.waitFor();
  assert(await suggestions.getByRole('option', { name: /Vitamin C Brightening Serum/ }).isVisible(), 'typing (with a typo) suggests the product as you go');
  assert((await suggestions.getByRole('option').last().textContent()).includes('See all results for “serun”'), 'the last suggestion searches for what was typed');
  await sbox.press('ArrowDown');
  assert((await suggestions.getByRole('option').first().getAttribute('aria-selected')) === 'true' && Boolean(await sbox.getAttribute('aria-activedescendant')), 'arrow keys move through the suggestions');
  await sbox.press('Enter');
  await shopper.waitForURL(/\/products\/vitamin-c-brightening-serum/);
  assert(true, 'choosing a suggestion with the keyboard opens that product');
  await go(shopper, BASE + '/search');
  await main(shopper).getByRole('searchbox').pressSequentially('shea', { delay: 40 });
  await suggestions.waitFor();
  await main(shopper).getByRole('searchbox').press('Escape');
  assert((await suggestions.count()) === 0, 'Escape closes the suggestions');
  await main(shopper).getByRole('searchbox').fill('');
  await main(shopper).getByRole('searchbox').pressSequentially('little ne', { delay: 40 });
  await suggestions.getByRole('option', { name: /Little Nest/ }).click();
  await shopper.waitForURL(/\/shop\?brand=Little/);
  assert(true, 'a brand suggestion opens that brand’s products');
  await go(shopper, BASE + '/search?q=onesie');
  assert(await main(shopper).getByRole('link', { name: /Organic Cotton Bodysuits/ }).first().isVisible(), 'synonyms: "onesie" finds the bodysuits');
  await go(shopper, BASE + '/search?q=vitmnc');
  assert((await main(shopper).textContent()).includes('No results for “vitmnc”') && await main(shopper).getByRole('link', { name: 'Vitamin C Brightening Serum' }).first().isVisible(), '"Did you mean" offers the closest product when nothing matched');

  // --- Search engines: robots, sitemap, structured data, canonical links -----------------------------
  const robots = await (await fetch(BASE + '/robots.txt')).text();
  assert(/Disallow: \/admin/.test(robots) && /Disallow: \/checkout/.test(robots) && /Sitemap: \S+\/sitemap\.xml/.test(robots), 'robots.txt keeps crawlers out of private pages and points to the sitemap');
  const sitemap = await (await fetch(BASE + '/sitemap.xml')).text();
  assert(sitemap.includes('/products/vitamin-c-brightening-serum') && sitemap.includes('/shop/beauty/skincare') && sitemap.includes('/shop-by-age/1-2y'), 'the sitemap lists products, categories and age bands');
  assert(!/\/(admin|checkout|bag|account|orders)/.test(sitemap), 'the sitemap leaves private pages out');
  for (const path of ['/admin', '/bag', '/checkout', '/account', '/saved', '/track', '/api/search/suggest']) {
    const res = await fetch(BASE + path, { redirect: 'manual' });
    assert((res.headers.get('x-robots-tag') ?? '').includes('noindex'), `${path} is marked noindex`);
  }
  await go(shopper, BASE + '/products/vitamin-c-brightening-serum');
  const ld = (await shopper.locator('script[type="application/ld+json"]').allTextContents()).map((t) => JSON.parse(t));
  const productLd = ld.find((d) => d['@type'] === 'Product');
  const offers = productLd?.offers;
  assert(productLd?.name === 'Vitamin C Brightening Serum' && offers?.priceCurrency === 'GHS' && Number(offers.price ?? offers.lowPrice) > 0 && /schema\.org\/(InStock|OutOfStock)$/.test(offers.availability ?? 'schema.org/InStock'), 'product pages carry Product structured data with a price in cedis');
  assert((ld.find((d) => d['@type'] === 'BreadcrumbList')?.itemListElement.length ?? 0) >= 3, 'and a breadcrumb trail');
  assert((await shopper.locator('link[rel="canonical"]').getAttribute('href')).endsWith('/products/vitamin-c-brightening-serum'), 'the product has a canonical link');
  assert(Boolean(await shopper.locator('meta[property="og:title"]').getAttribute('content')) && Boolean(await shopper.locator('meta[property="og:image"]').count()), 'and share previews (title and picture)');
  await go(shopper, BASE + '/shop?brand=Little+Nest&sort=newest');
  assert((await shopper.locator('link[rel="canonical"]').getAttribute('href')).endsWith('/shop'), 'filtered listings point search engines at the plain page');
  await go(shopper, BASE + '/');
  const homeLd = (await shopper.locator('script[type="application/ld+json"]').allTextContents()).map((t) => JSON.parse(t)).flatMap((d) => d['@graph'] ?? [d]);
  assert(homeLd.some((d) => d['@type'] === 'WebSite' && d.potentialAction?.target?.urlTemplate?.includes('/search?q={search_term_string}')) && homeLd.some((d) => d['@type'] === 'Organization'), 'the home page describes the store and its search to search engines');
  const ogImage = await fetch(BASE + '/opengraph-image');
  assert(ogImage.ok && (ogImage.headers.get('content-type') ?? '').includes('image/png'), 'the store has a share picture');

  // --- Safety warnings (FR-017) ----------------------------------------------------------------------
  await go(shopper, BASE + '/products/wooden-stacking-blocks');
  const warning = shopper.locator('#safety-warning:visible');
  assert((await warning.textContent()).includes('Choking hazard'), 'warning shown on the product page');
  const addBtn = main(shopper).getByRole('button', { name: 'Add to bag' });
  assert(await addBtn.getAttribute('aria-describedby') === 'safety-warning', 'Add to bag is described by the warning');
  const wbox = await warning.boundingBox(), abox = await addBtn.boundingBox();
  assert(wbox.y < abox.y, 'warning sits above Add to bag');
  await addBtn.click();
  await go(shopper, BASE + '/bag');
  assert((await main(shopper).textContent()).includes('Choking hazard'), 'warning shown in the bag');
  await go(shopper, BASE + '/products/velvet-matte-lip-colour');
  assert((await main(shopper).textContent()).includes('Can’t be returned once delivered'), 'product page says it can’t be returned');

  // --- Settings → help centre (FR-055) ---------------------------------------------------------------
  await go(shopper, BASE + '/help');
  assert((await main(shopper).textContent()).includes('[Support phone number]'), 'help centre shows a placeholder until contacts are set');
  await go(staff, BASE + '/admin/settings');
  await staff.getByLabel('Phone').fill('030 123 4567');
  await staff.getByLabel('WhatsApp number').fill('024 000 1111');
  await staff.getByLabel('Opening hours').fill('Mon–Sat, 8am–6pm');
  await staff.getByLabel('Return window (days)').fill('10');
  await staff.getByRole('button', { name: 'Save settings' }).click();
  await staff.getByRole('status').filter({ hasText: 'Settings saved.' }).waitFor();
  await go(shopper, BASE + '/help');
  assert(await main(shopper).locator('a[href="tel:+233301234567"]').count() === 1, 'help centre has a call link');
  assert(await main(shopper).locator('a[href^="https://wa.me/233240001111"]').count() === 1, 'help centre has a WhatsApp link');
  assert((await main(shopper).locator('#returns').textContent()).includes('within 10 days'), 'returns answer uses the return window');
  await shot(shopper, 'help');

  // --- Track an order --------------------------------------------------------------------------------
  const { data: order } = await anonDb.rpc('place_order', {
    p_customer: { name: 'Efua Mensah', phone: '055 222 3333', area: 'Osu' },
    p_delivery_option: 'same_day',
    p_payment: { method: 'momo', network: 'mtn', wallet: '055 222 3333' },
    p_items: [{ slug: 'wooden-stacking-blocks', quantity: 1 }, { slug: 'velvet-matte-lip-colour', quantity: 1 }],
    p_is_gift: false,
  }).single();
  const ref = `T-${order.order_number}`;
  await admin.rpc('start_payment', { p_order_token: order.order_token, p_provider: 'test', p_reference: ref });
  await admin.rpc('confirm_payment', { p_provider: 'test', p_reference: ref, p_status: 'succeeded', p_amount_ghs: order.total_ghs });
  const orderId = sql(`select id from public.orders where order_number = '${order.order_number}'`);
  const db = boss.client;
  await db.rpc('admin_start_packing', { p_order_ids: [orderId] });
  await db.rpc('admin_pack_orders', { p_order_ids: [orderId] });
  const { data: rider } = await db.rpc('admin_save_rider', { p_id: null, p_name: 'Kofi', p_phone: '020 111 2222', p_vehicle: 'Motorbike' });
  await db.rpc('admin_dispatch_order', { p_order_id: orderId, p_rider_id: rider });
  const code = sql(`select delivery_code from public.orders where id = '${orderId}'`);
  const { data: delivered } = await db.rpc('admin_mark_delivered', { p_order_id: orderId, p_recipient: 'Efua', p_code: code });
  assert(delivered === 'delivered', 'order delivered');

  const visitor = await ctx();
  await go(visitor, BASE + '/track');
  await visitor.getByLabel('Order number').fill(order.order_number);
  await visitor.getByLabel('Phone number used at checkout').fill('055 999 9999');
  await visitor.getByRole('button', { name: 'Track order' }).click();
  await visitor.getByRole('alert').filter({ hasText: 'couldn’t find' }).waitFor();
  assert(await visitor.getByLabel('Order number').inputValue() === order.order_number, 'wrong phone refused, form keeps the order number');
  await visitor.getByLabel('Phone number used at checkout').fill('+233 55 222 3333');
  await visitor.getByRole('button', { name: 'Track order' }).click();
  await visitor.waitForURL(new RegExp(`/orders/${order.order_token}`));
  await visitor.getByRole('heading', { name: `Order ${order.order_number}` }).waitFor();
  assert(true, 'order number + phone opens the order page');

  // --- Return request with a photo (FR-053) --------------------------------------------------------------
  await visitor.getByRole('link', { name: 'Request a return' }).click();
  await visitor.getByRole('heading', { name: 'Request a return' }).waitFor();
  await visitor.getByLabel('How many of Wooden Stacking Blocks to return').selectOption('1');
  await visitor.getByLabel('Reason').selectOption('changed_mind');
  await visitor.getByLabel('How many of Velvet Matte Lip Colour to return').selectOption('1');
  await visitor.getByRole('button', { name: 'Request return' }).click();
  await visitor.getByRole('alert').filter({ hasText: 'only be returned if it arrived damaged' }).waitFor();
  assert(true, 'non-returnable item refused for a change of mind');
  await visitor.getByLabel('How many of Velvet Matte Lip Colour to return').selectOption('0');
  await visitor.getByLabel('Reason').selectOption('damaged');
  await visitor.getByRole('button', { name: 'Request return' }).click();
  await visitor.getByRole('alert').filter({ hasText: 'Add at least one photo' }).waitFor();
  assert(true, 'damage needs a photo');
  await visitor.getByLabel('Add photos').setInputFiles({ name: 'box.png', mimeType: 'image/png', buffer: png });
  assert(await visitor.getByRole('img', { name: /Photo 1: box.png/ }).isVisible(), 'photo preview shown');
  await visitor.locator('textarea[name="details"]').fill('One block was split.');
  await visitor.getByRole('button', { name: 'Request return' }).click();
  const doneBox = visitor.getByRole('status').filter({ hasText: 'Return requested' });
  await doneBox.waitFor({ timeout: 10000 });
  const caseNumber = (await doneBox.textContent()).match(/RT-\d+/)?.[0];
  assert(caseNumber, `return number shown (${caseNumber})`);
  await shot(visitor, 'return-done');
  await visitor.getByRole('link', { name: 'Back to your order' }).click();
  const returnsPanel = visitor.getByRole('region', { name: 'Returns' });
  await returnsPanel.waitFor();
  assert((await returnsPanel.textContent()).includes(caseNumber) && (await returnsPanel.textContent()).includes('Waiting for review'), 'order page lists the return');

  // --- Admin: review, receive, refund (FR-054) -------------------------------------------------------------
  await go(staff, BASE + '/admin/returns');
  await staff.getByRole('link', { name: caseNumber }).click();
  await staff.getByRole('heading', { name: new RegExp(`Return ${caseNumber}`) }).waitFor();
  const photo = staff.getByRole('img', { name: 'Customer photo 1' });
  await photo.waitFor();
  assert(await photo.evaluate((img) => img.complete && img.naturalWidth > 0), 'staff see the customer’s photo');
  await staff.getByLabel('Note to the customer').fill('Our rider will collect it tomorrow.');
  await staff.getByRole('button', { name: 'Approve return' }).click();
  await staff.getByRole('status').filter({ hasText: 'Return approved' }).waitFor();
  await staff.getByLabel(/1 × Wooden Stacking Blocks/).selectOption('restock');
  await staff.getByRole('button', { name: 'Mark as received' }).click();
  await staff.getByRole('status').filter({ hasText: 'Return received' }).waitFor();
  assert((await staff.locator('main, [role="main"], body').first().textContent()).includes('refund due GH₵ 120'), 'refund due is the item price');
  await staff.getByLabel('Refund reference').fill('MP240101.1234');
  await staff.getByRole('button', { name: 'Mark as refunded' }).click();
  await staff.getByRole('status').filter({ hasText: 'Refund recorded' }).waitFor();
  assert(true, 'staff approve, receive and refund the return');
  await shot(staff, 'admin-return');
  await go(visitor, BASE + `/orders/${order.order_token}`);
  assert((await visitor.getByRole('region', { name: 'Returns' }).textContent()).includes('Refunded'), 'customer sees the refund');

  // --- Report a problem → support case (FR-055) ------------------------------------------------------------
  await visitor.getByRole('link', { name: 'Report a problem' }).click();
  await visitor.getByRole('heading', { name: 'Report a problem' }).waitFor();
  assert(await visitor.getByLabel('Your name').inputValue() === 'Efua Mensah' && await visitor.getByLabel(/Order number/).inputValue() === order.order_number, 'report form prefilled from the order');
  await visitor.getByLabel('What is it about?').selectOption('delivery');
  await visitor.getByLabel('Message').fill('The rider was very late.');
  await visitor.getByRole('button', { name: 'Send message' }).click();
  const sent = visitor.getByRole('status').filter({ hasText: 'Message sent' });
  await sent.waitFor();
  const supportCase = (await sent.textContent()).match(/CS-\d+/)?.[0];
  assert(supportCase, `case number shown (${supportCase})`);
  await go(staff, BASE + '/admin/support');
  await staff.getByRole('link', { name: supportCase }).click();
  await staff.getByRole('heading', { name: new RegExp(`Case ${supportCase}`) }).waitFor();
  assert((await staff.locator('body').textContent()).includes('The rider was very late.'), 'staff read the case');
  await staff.getByLabel('Reply to the customer').fill('Sorry! We have spoken to the rider.');
  await staff.getByRole('button', { name: 'Send reply' }).click();
  await staff.getByRole('status').filter({ hasText: 'Reply sent' }).waitFor();
  assert(sql(`select count(*) from public.notifications where template = 'support_reply' and order_id = '${orderId}'`) === '1', 'reply queued for the customer');

  // Anonymous report without an order
  const guest = await ctx();
  await go(guest, BASE + '/help/report?topic=product_question');
  assert(await guest.getByLabel('What is it about?').inputValue() === 'product_question', 'topic prefilled from the link');
  await guest.getByLabel('Your name').fill('Kwame');
  await guest.getByLabel('Phone number').fill('12');
  await guest.getByLabel('Message').fill('Is the serum safe in pregnancy?');
  await guest.getByRole('button', { name: 'Send message' }).click();
  await guest.getByRole('alert').filter({ hasText: 'phone number' }).waitFor();
  assert(await guest.getByLabel('Message').inputValue() === 'Is the serum safe in pregnancy?', 'refused report keeps the message');

  // Mobile layout
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const mp = await phone.newPage();
  mp.on('pageerror', (e) => errors.push(e.message));
  for (const path of ['/shop', '/help', '/track']) {
    await go(mp, BASE + path);
    const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(overflow <= 1, `${path} fits a phone screen (overflow ${overflow}px)`);
  }
  await shot(mp, 'mobile-track');

  assert(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
