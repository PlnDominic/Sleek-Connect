// Database checks for the shopper's account pages: reviews still to write, and the items in each order.
const { URL_, KEY, createUser, staffSession, createClient } = require('./lib.cjs');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const errOf = async (p) => { const r = await p; return r.error; };
const anon = createClient(URL_, KEY, { auth: { persistSession: false } });
const stamp = Date.now();


(async () => {
  await createUser(`kofi+${stamp}@example.com`);
  const kofi = (await staffSession(`kofi+${stamp}@example.com`)).client;

  // --- Pending reviews (account page) -------------------------------------------------------------
  assert((await errOf(anon.rpc('my_pending_reviews')))?.code !== undefined, 'guests have no pending reviews list');
  assert((await kofi.rpc('my_pending_reviews')).data.length === 0, 'a shopper with no delivered orders has nothing to review');

  assert((await errOf(anon.rpc('my_order_items')))?.code !== undefined, 'guests cannot read order items');
  assert(Object.keys((await kofi.rpc('my_order_items')).data).length === 0, 'a shopper with no orders has no order items');

  // --- The seller side is switched off ----------------------------------------------------------------
  for (const fn of ['follow_store', 'store_directory', 'vendor_apply', 'record_product_view']) {
    const err = await errOf(kofi.rpc(fn, {}));
    assert(err && (err.code === '42501' || err.code === 'PGRST202'), `${fn} can no longer be called`);
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll account checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
