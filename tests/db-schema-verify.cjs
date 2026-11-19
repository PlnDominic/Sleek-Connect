// The launch schema check: it passes on a fresh database and names what is wrong when a grant or table is broken.
const { URL_, KEY, sql, createClient } = require('./lib.cjs');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const anon = createClient(URL_, KEY, { auth: { persistSession: false } });
const report = async () => (await anon.rpc('verify_launch_schema')).data;

(async () => {
  let r = await report();
  assert(r && r.ok === true, 'a fresh database passes the launch schema check');
  assert(Object.entries(r).filter(([k]) => k !== 'ok').every(([, v]) => Array.isArray(v) && v.length === 0), 'and nothing is listed as missing or wrongly granted');

  sql('grant execute on function public.confirm_payment(text, text, text, numeric, jsonb) to anon');
  r = await report();
  assert(r.ok === false && r.grant_problems.includes('anon may run confirm_payment'), 'a server-only function opened to the public is reported by name');
  sql('revoke execute on function public.confirm_payment(text, text, text, numeric, jsonb) from anon');

  sql('alter table public.promotions disable row level security');
  r = await report();
  assert(r.ok === false && r.tables_without_rls.includes('promotions'), 'a table without row level security is reported by name');
  sql('alter table public.promotions enable row level security');

  sql('revoke execute on function public.find_order(text, text) from anon');
  r = await report();
  assert(r.grant_problems.includes('anon cannot run find_order'), 'a storefront function shoppers can no longer run is reported');
  sql('grant execute on function public.find_order(text, text) to anon');

  sql("grant select (delivery_code) on public.orders to anon");
  r = await report();
  assert(r.exposed_secret_columns.includes('anon:orders.delivery_code'), 'a readable delivery code is reported');
  sql('revoke select (delivery_code) on public.orders from anon');

  r = await report();
  assert(r.ok === true, 'putting everything back makes it pass again');

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll schema verification checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
