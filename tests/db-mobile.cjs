// Database checks for the mobile app: registering phones for push notifications, which status changes queue a push and
// for whom, who can see or remove a registration, and what deleting an account leaves behind.
const { URL_, KEY, sql, admin, createUser, staffSession, createClient } = require('./lib.cjs');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const errOf = async (p) => { const r = await p; return r.error; };
const rows = async (q) => (await q).data ?? [];
const anon = createClient(URL_, KEY, { auth: { persistSession: false } });
const stamp = Date.now();
const token = (name) => `ExponentPushToken[${name}${stamp}xxxxxxxx]`;

const order = (client) => client.rpc('place_order', {
  p_customer: { name: 'Kofi Mensah', phone: '024 123 4567', area: 'East Legon' },
  p_delivery_option: 'standard', p_payment: { method: 'momo', network: 'mtn', wallet: '024 765 4321' },
  p_items: [{ slug: 'argan-hair-oil', quantity: 1 }], p_is_gift: false,
}).single();
const pay = async (o) => {
  const ref = `T-${o.order_number}`;
  await admin.rpc('start_payment', { p_order_token: o.order_token, p_provider: 'test', p_reference: ref });
  await admin.rpc('confirm_payment', { p_provider: 'test', p_reference: ref, p_status: 'succeeded', p_amount_ghs: o.total_ghs });
};
const pushes = (orderNumber) => sql(`select coalesce(string_agg(n.recipient || ':' || n.template, ',' order by n.recipient), '')
  from public.notifications n join public.orders o on o.id = n.order_id where o.order_number = '${orderNumber}' and n.channel = 'push'`);

(async () => {
  sql("update public.delivery_options set fee_ghs = 20 where id = 'standard'");
  await createUser(`ama+${stamp}@example.com`);
  await createUser(`kofi+${stamp}@example.com`);
  const ama = (await staffSession(`ama+${stamp}@example.com`)).client;
  const kofi = (await staffSession(`kofi+${stamp}@example.com`)).client;

  // --- Registering ---------------------------------------------------------------------------------
  assert((await errOf(anon.rpc('register_push_device', { p_token: 'not-a-token', p_platform: 'ios' })))?.message.includes('valid push token'), 'only real Expo push tokens are accepted');
  assert((await errOf(anon.rpc('register_push_device', { p_token: token('a'), p_platform: 'windows' })))?.message.includes('platform'), 'the platform must be ios or android');
  assert(!(await errOf(ama.rpc('register_push_device', { p_token: token('ama'), p_platform: 'ios' }))), 'a signed-in phone registers');
  assert(!(await errOf(ama.rpc('register_push_device', { p_token: token('ama'), p_platform: 'ios' }))), 'registering twice is harmless');
  assert(sql(`select user_id is not null from public.push_devices where token = '${token('ama')}'`) === 't', 'and belongs to the signed-in shopper');
  assert((await rows(anon.from('push_devices').select('token'))).length === 0 && (await rows(ama.from('push_devices').select('token'))).length === 0, 'tokens cannot be read directly, even by their owner');
  assert((await errOf(anon.rpc('forget_push_device', { p_token: token('ama') }))) !== null, 'forgetting a device is for the server only');

  // --- A guest order, followed by one phone --------------------------------------------------------
  const guest = (await order(anon)).data;
  assert(!(await errOf(anon.rpc('register_push_device', { p_token: token('guest'), p_platform: 'android', p_order_token: guest.order_token }))), 'a guest phone follows an order with its private token');
  assert((await errOf(anon.rpc('register_push_device', { p_token: token('other'), p_platform: 'android', p_order_token: '00000000-0000-0000-0000-000000000099' })))?.message.includes('find that order'), 'a wrong order token is refused');
  assert(sql(`select count(*) from public.push_devices where token = '${token('other')}'`) === '0', 'and leaves nothing behind');
  await pay(guest);
  assert(pushes(guest.order_number) === `${token('guest')}:order_confirmed`, 'a paid order pushes only to the phone that follows it');

  // --- A signed-in order reaches the shopper's phones ----------------------------------------------
  const mine = (await order(ama)).data;
  assert(sql(`select user_id is not null from public.orders where order_number = '${mine.order_number}'`) === 't', 'orders placed from the app are linked to the account');
  await ama.rpc('register_push_device', { p_token: token('ama2'), p_platform: 'android' });
  await pay(mine);
  assert(pushes(mine.order_number) === [token('ama'), token('ama2')].sort().map((t) => `${t}:order_confirmed`).join(','), 'all of a signed-in shopper\'s phones get the push');
  assert(sql(`select count(*) from public.notifications n join public.orders o on o.id = n.order_id where o.order_number = '${mine.order_number}' and n.channel in ('sms', 'email')`) !== '0', 'SMS and email still go out as before');
  const claimed = (await admin.rpc('claim_notifications', { p_limit: 50 })).data;
  const first = claimed.find((n) => n.channel === 'push');
  assert(first && first.payload.order_token, 'the dispatcher gets the order token to open on tap');

  // --- Another shopper's phone gets nothing ---------------------------------------------------------
  await kofi.rpc('register_push_device', { p_token: token('kofi'), p_platform: 'ios' });
  assert(!pushes(mine.order_number).includes(token('kofi')), 'another shopper\'s phone does not receive it');

  // --- Signing out and removing -----------------------------------------------------------------------
  await anon.rpc('register_push_device', { p_token: token('ama'), p_platform: 'ios' });
  assert(sql(`select user_id is null from public.push_devices where token = '${token('ama')}'`) === 't', 'registering again as a guest detaches the phone from the account');
  await anon.rpc('unregister_push_device', { p_token: token('ama2') });
  assert(sql(`select count(*) from public.push_devices where token = '${token('ama2')}'`) === '0', 'a phone can switch notifications off');
  await admin.rpc('forget_push_device', { p_token: token('guest') });
  assert(sql(`select count(*) from public.push_device_orders`) === '0', 'forgetting a device also forgets the orders it followed');

  // --- Data rights --------------------------------------------------------------------------------------
  await ama.rpc('register_push_device', { p_token: token('ama3'), p_platform: 'android' });
  await anon.rpc('register_push_device', { p_token: token('follower'), p_platform: 'ios', p_order_token: mine.order_token });
  assert(sql('select count(*) from public.push_device_orders') === '1', 'a guest phone can follow a signed-in shopper\'s order too');
  const exported = (await ama.rpc('export_my_data')).data;
  assert(Array.isArray(exported.devices) && exported.devices.length === 1 && exported.devices[0].platform === 'android' && !JSON.stringify(exported.devices).includes('Expo'), 'the data export lists registered phones without their tokens');
  sql(`update public.orders set status = 'cancelled' where status = 'pending_payment'`);
  sql(`update public.orders set status = 'delivered', delivered_at = now() where order_number = '${mine.order_number}'`);
  const deleted = await ama.rpc('delete_my_account');
  assert(!deleted.error, 'a shopper can delete their account');
  assert(sql(`select count(*) from public.push_devices where token = '${token('ama3')}'`) === '0', 'deleting the account removes their phones');
  assert(sql('select count(*) from public.push_device_orders') === '0', 'and keeps nothing that points at their orders');

  // --- An optional email at checkout (mobile and web) -----------------------------------------------
  const withEmail = (email) => anon.rpc('place_order', {
    p_customer: { name: 'Esi Mensah', phone: '024 123 4567', area: 'East Legon', email },
    p_delivery_option: 'standard', p_payment: { method: 'momo', network: 'mtn', wallet: '024 765 4321' },
    p_items: [{ slug: 'argan-hair-oil', quantity: 1 }], p_is_gift: false,
  }).single();
  assert((await withEmail('not-an-email')).error?.message.includes('email address'), 'a malformed email is refused');
  assert((await withEmail(`${'a'.repeat(250)}@example.com`)).error?.message.includes('email address'), 'and so is an over-long one');
  const emailed = (await withEmail('  Esi.Guest@Example.COM ')).data;
  assert(emailed?.order_number && sql(`select contact_email from public.orders where order_number = '${emailed.order_number}'`) === 'esi.guest@example.com', 'a valid one is trimmed and stored in lower case');
  assert((await rows(anon.from('orders').select('contact_email'))).length === 0 && (await rows(kofi.from('orders').select('contact_email'))).length === 0, 'it cannot be read from the browser, by anyone');
  await pay(emailed);
  assert(sql(`select string_agg(n.channel || ':' || n.recipient, ',' order by n.channel) from public.notifications n join public.orders o on o.id = n.order_id where o.order_number = '${emailed.order_number}' and n.channel <> 'push'`) === 'email:esi.guest@example.com,sms:024 123 4567', 'order updates go to that address by email as well as SMS');
  const noEmail = (await withEmail('')).data;
  await pay(noEmail);
  assert(sql(`select count(*) from public.notifications n join public.orders o on o.id = n.order_id where o.order_number = '${noEmail.order_number}' and n.channel = 'email'`) === '0', 'without one, a guest still gets SMS only');

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll mobile database checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
