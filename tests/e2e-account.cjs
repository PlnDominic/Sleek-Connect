const path = require('path');
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { createServerClient } = require('@supabase/ssr');
const { execSync } = require('child_process');
const fs = require('fs');
const BASE = 'http://localhost:3000';
const OUT = process.argv[2] ?? path.resolve(__dirname, '.output');
fs.mkdirSync(OUT, { recursive: true });
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const sql = (q) => execSync(`docker exec supabase_db_Sleek-Connect psql -U postgres -At -c "${q}"`).toString().trim();
const env = Object.fromEntries(fs.readFileSync(path.resolve(__dirname, '../apps/web/.env.local'), 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

async function go(page, url) {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
}
const bagCount = (page) => page.evaluate(() => {
  const raw = localStorage.getItem('sleek-connect:bag:v1');
  return raw ? JSON.parse(raw).reduce((n, i) => n + i.qty, 0) : 0;
});
const savedBag = (userId) => sql(`select coalesce(string_agg(p.slug || ':' || b.size_code || 'x' || b.quantity, ',' order by p.slug), '') from public.bag_items b join public.products p on p.id = b.product_id where b.user_id = '${userId}'`);
const until = async (fn, ms = 5000) => { const end = Date.now() + ms; let v; while (Date.now() < end) { v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 200)); } return v; };

/** Signs in with a password the way the web app's server client would, and returns the session cookies. */
async function sessionCookies(email, password) {
  const jar = [];
  const client = createServerClient(URL_, KEY, { cookies: { getAll: () => jar, setAll: (cs) => cs.forEach(c => { const i = jar.findIndex(j => j.name === c.name); if (i >= 0) jar.splice(i, 1); if (c.value) jar.push({ name: c.name, value: c.value }); }) } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return jar.map(c => ({ name: c.name, value: c.value, domain: 'localhost', path: '/', sameSite: 'Lax' }));
}

(async () => {
  const admin = createClient(URL_, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
  const email = `shopper+${Date.now()}@example.com`, password = 'correct-horse-battery';
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: 'Esi Mensah' } });
  if (error) throw error;
  const userId = created.user.id;
  const cookies = await sessionCookies(email, password);
  assert(cookies.length > 0 && cookies[0].name.startsWith('sb-'), `session cookie created (${cookies.map(c => c.name).join(',')})`);

  const browser = await chromium.launch();
  const errors = [];
  const newPage = async (ctx) => { const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); return p; };

  // --- Signed out: consent gate before Google ---------------------------------
  const anon = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const ap = await newPage(anon);
  let authorizeUrl = null;
  await ap.route('**/auth/v1/authorize**', (route) => { authorizeUrl = route.request().url(); route.fulfill({ status: 200, body: 'stub' }); });
  await go(ap, BASE + '/products/argan-hair-oil');
  await ap.getByRole('button', { name: 'Add to bag' }).click();
  await go(ap, BASE + '/bag');
  await ap.getByRole('link', { name: 'Sign in with Google' }).click();
  await ap.waitForURL('**/account?next=/bag');
  const google = ap.getByRole('button', { name: 'Continue with Google' });
  await google.waitFor();
  assert(await google.isDisabled(), 'Google button disabled until consent is ticked');
  await ap.getByLabel(/18 or older/).check();
  assert(await google.isEnabled(), 'ticking consent enables Google sign-in');
  await ap.screenshot({ path: OUT + '/account-signed-out.png' });
  await google.click();
  await until(() => authorizeUrl);
  const auth = authorizeUrl && new URL(authorizeUrl);
  const redirectTo = auth && new URL(auth.searchParams.get('redirect_to'));
  assert(auth?.searchParams.get('provider') === 'google', 'redirects to Supabase Google sign-in');
  assert(redirectTo?.pathname === '/auth/callback' && redirectTo.searchParams.get('next') === '/bag' && redirectTo.searchParams.get('consent') === '1', `callback carries next and consent (${redirectTo})`);
  await go(ap, BASE + '/account?error=signin');
  assert((await ap.getByRole('alert').filter({ hasText: 'sign you in' }).count()) === 1, 'sign-in error is shown');
  const cb = await ap.request.get(BASE + '/auth/callback?code=bogus&next=//evil.example', { maxRedirects: 0 });
  assert(cb.status() === 307 && cb.headers().location.endsWith('/account?error=signin'), `bad code goes back to the account page (${cb.headers().location})`);

  // --- Device A: signed in, not yet consented -----------------------------------
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxA.addCookies(cookies);
  const pa = await newPage(ctxA);
  await go(pa, BASE + '/products/vitamin-c-brightening-serum');
  await pa.getByRole('button', { name: 'Add to bag' }).click();
  await go(pa, BASE + '/account');
  await pa.getByRole('heading', { name: 'Hello, Esi Mensah' }).waitFor();
  assert(await pa.getByText(email, { exact: true }).isVisible(), 'account shows the signed-in email');
  const confirm = pa.getByRole('button', { name: 'Confirm' });
  assert(await confirm.isDisabled(), 'confirm disabled until consent ticked');
  assert(savedBag(userId) === '', 'nothing saved to the account before consent');
  await pa.getByLabel(/18 or older/).check();
  await confirm.click();
  await pa.getByText('Your bag is saved to this account').waitFor();
  assert(sql(`select (confirmed_adult_at is not null and accepted_terms_at is not null)::text from public.profiles where id = '${userId}'`) === 'true', 'consent recorded in profiles');
  assert(await until(() => savedBag(userId) === 'vitamin-c-brightening-serum:30x1'), `device bag uploaded after consent (${savedBag(userId)})`);
  await pa.screenshot({ path: OUT + '/account-signed-in.png' });

  // --- Device B: anonymous bag, then sign in: bags merge -------------------------
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pb = await newPage(ctxB);
  await go(pb, BASE + '/products/argan-hair-oil');
  await pb.getByRole('button', { name: 'Add to bag' }).click();
  await ctxB.addCookies(cookies);
  await go(pb, BASE + '/bag');
  await pb.getByText('Your bag is saved to your account').waitFor();
  const linesB = pb.getByRole('list', { name: 'Items in your bag' }).getByRole('listitem');
  assert(await until(async () => (await linesB.count()) === 2), 'device B shows both bags merged');
  assert(await until(() => savedBag(userId) === 'argan-hair-oil:x1,vitamin-c-brightening-serum:30x1'), `merged bag saved (${savedBag(userId)})`);
  await pb.getByRole('button', { name: /Increase quantity of Argan/ }).click();
  assert(await until(() => savedBag(userId) === 'argan-hair-oil:x2,vitamin-c-brightening-serum:30x1'), `quantity change saved (${savedBag(userId)})`);
  await pb.screenshot({ path: OUT + '/bag-signed-in.png' });

  // Device A picks the change up when its tab becomes visible again.
  await go(pa, BASE + '/bag');
  await pa.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  assert(await until(async () => (await bagCount(pa)) === 3), `device A sees the other device's changes (${await bagCount(pa)})`);

  // Removing on A reaches B after it refocuses.
  await pa.getByRole('button', { name: /Remove Argan/ }).click();
  assert(await until(() => savedBag(userId) === 'vitamin-c-brightening-serum:30x1'), 'remove saved to account');
  await pb.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  assert(await until(async () => (await bagCount(pb)) === 1), 'device B sees the removal');

  // --- Signed-in checkout links the order to the account --------------------------
  await go(pa, BASE + '/checkout');
  await pa.getByLabel('Full name').fill('Esi Mensah');
  await pa.getByLabel('Phone number').fill('024 555 0000');
  await pa.getByRole('radio', { name: /Same day/ }).check();
  await pa.getByLabel('Wallet number').fill('024 555 0000');
  await pa.getByRole('button', { name: 'Pay with MTN MoMo' }).click();
  const panel = pa.locator('aside:visible').getByRole('status').filter({ hasText: 'Check your phone' });
  await panel.waitFor();
  const order = (await panel.textContent()).match(/SC-\d+/)[0];
  assert(sql(`select user_id from public.orders where order_number = '${order}'`) === userId, `order ${order} linked to the account`);
  execSync(`npm run -s payments:simulate -- ${order} succeeded`, { cwd: path.resolve(__dirname, '..') });
  await pa.locator('aside:visible').getByRole('status').filter({ hasText: 'Payment received' }).waitFor({ timeout: 10000 });
  assert(await until(() => savedBag(userId) === ''), 'paid order empties the saved bag too');

  // --- Sign out on B empties that device only -------------------------------------
  await go(pb, BASE + '/products/argan-hair-oil');
  await pb.getByRole('button', { name: 'Add to bag' }).click();
  assert(await until(() => savedBag(userId) === 'argan-hair-oil:x1'), 'new item saved before sign-out');
  await go(pb, BASE + '/account');
  await pb.getByRole('button', { name: 'Sign out' }).click();
  await pb.getByRole('button', { name: 'Continue with Google' }).waitFor();
  assert(await until(async () => (await bagCount(pb)) === 0), 'signing out empties the bag on this device');
  await new Promise(r => setTimeout(r, 800));
  assert(savedBag(userId) === 'argan-hair-oil:x1', 'saved bag kept in the account after sign-out');

  // RLS: another account can't see this bag.
  const other = await admin.auth.admin.createUser({ email: `other+${Date.now()}@example.com`, password, email_confirm: true });
  const otherClient = createClient(URL_, KEY, { auth: { persistSession: false } });
  await otherClient.auth.signInWithPassword({ email: other.data.user.email, password });
  const { data: otherBag } = await otherClient.rpc('get_bag');
  const { data: otherRows } = await otherClient.from('bag_items').select('*');
  assert(otherBag.length === 0 && otherRows.length === 0, 'another account cannot read this bag');

  assert(errors.length === 0, 'no page errors ' + errors.join(' | '));
  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
  process.exitCode = failures ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });
