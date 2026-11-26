// Database checks for abandoned bag reminders: only shoppers who agreed to offers, only in daytime, once per bag, never after an order,
// and nobody outside the server can run the job.
const { URL_, KEY, sql, createUser, staffSession, createClient } = require('./lib.cjs');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const anon = createClient(URL_, KEY, { auth: { persistSession: false } });
const stamp = Date.now();

(async () => {
  const optIn = await createUser(`opt+${stamp}@example.com`, 'correct-horse-battery', { full_name: 'Ama Mensah', marketing_email_opted_in: true });
  const noOpt = await createUser(`no+${stamp}@example.com`);
  const buyer = await createUser(`buyer+${stamp}@example.com`, 'correct-horse-battery', { marketing_email_opted_in: true });
  const shopper = (await staffSession(`no+${stamp}@example.com`)).client;
  const sku = sql(`select p.id || '|' || s.code from public.products p join public.product_sizes s on s.product_id = p.id
                   join public.inventory_levels il on il.product_id = p.id and il.size_code = s.code and il.in_stock where p.is_published limit 1`);
  const [productId, size] = sku.split('|');
  const noon = `(date_trunc('day', now()) + interval '12 hours')`;
  for (const u of [optIn, noOpt, buyer]) {
    sql(`insert into public.bag_items (user_id, product_id, size_code, quantity, updated_at) values ('${u.id}', '${productId}', '${size}', 2, ${noon} - interval '5 hours')`);
  }
  sql(`alter table public.orders disable trigger user;
       insert into public.orders (user_id, customer_name, phone, area, delivery_option_id, payment_method, subtotal_ghs, created_at)
       select '${buyer.id}', 'B', '0240000003', (select name from public.delivery_areas limit 1), 'standard', 'cod', 10, ${noon} - interval '1 hour';
       alter table public.orders enable trigger user;`);

  assert(Number(sql(`select public.queue_bag_reminders(${noon} + interval '11 hours')`)) === 0, 'nothing is queued at night');
  assert(Number(sql(`select public.queue_bag_reminders(${noon})`)) === 1, 'by day, one shopper is reminded');
  assert(Number(sql(`select count(*) from public.notifications where template = 'bag_reminder' and recipient = 'opt+${stamp}@example.com' and channel = 'email'`)) === 1, 'the one who agreed to offers gets an email');
  assert(Number(sql(`select count(*) from public.notifications where template = 'bag_reminder' and recipient like 'no+${stamp}%'`)) === 0, 'a shopper who did not agree gets nothing');
  assert(Number(sql(`select count(*) from public.notifications where template = 'bag_reminder' and recipient like 'buyer+${stamp}%'`)) === 0, 'and neither does one who ordered since');
  assert(Number(sql(`select public.queue_bag_reminders(${noon})`)) === 0, 'the same bag is not reminded twice');
  assert(sql(`select payload::text from public.notifications where template = 'bag_reminder' and recipient = 'opt+${stamp}@example.com'`).includes('Ama Mensah'), 'the message is addressed by name');
  assert(!sql(`select payload::text from public.notifications where template = 'bag_reminder' and recipient = 'opt+${stamp}@example.com'`).includes('order_token'), 'and carries no order link');

  const run = await shopper.rpc('queue_bag_reminders');
  assert(run.error?.code === '42501' || run.error?.code === 'PGRST202', 'shoppers cannot run the job');
  assert((await anon.rpc('queue_bag_reminders')).error !== null, 'neither can guests');
  assert((await shopper.from('bag_reminders').select('user_id')).error?.code === '42501', 'the reminder log is not readable from the apps');

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll bag reminder checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
