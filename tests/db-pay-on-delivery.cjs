const { URL_, KEY, sql, admin, createUser, staffSession, createClient } = require('./lib.cjs');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const errOf = async (p) => { const r = await p; return r.error; };
const anon = createClient(URL_, KEY, { auth: { persistSession: false } });
const stamp = Date.now();
const SLUG = 'argan-hair-oil';
const stock = () => sql(`select i.on_hand || '/' || i.reserved from public.inventory_levels i join public.products p on p.id = i.product_id where p.slug = '${SLUG}' and i.size_code = ''`);
const row = (id, cols) => sql(`select ${cols} from public.orders where id = '${id}'`);

async function place(method, opts = {}) {
  const { data, error } = await anon.rpc('place_order', {
    p_customer: { name: 'Esi Mensah', phone: opts.phone ?? '024 123 4567', area: 'East Legon', email: opts.email },
    p_delivery_option: opts.option ?? 'same_day',
    p_payment: method === 'cod' ? { method: 'cod' } : { method: 'momo', network: 'mtn', wallet: '024 765 4321' },
    p_items: [{ slug: SLUG, quantity: opts.qty ?? 1 }],
    p_is_gift: false,
  }).single();
  if (error) return { error };
  const id = sql(`select id from public.orders where order_number = '${data.order_number}'`);
  return { ...data, id };
}

(async () => {
  sql("update public.delivery_options set fee_ghs = 30 where id = 'same_day'");
  sql('update public.store_settings set require_delivery_code = true, free_delivery_threshold_ghs = null');
  const users = {};
  for (const [k, role] of [['admin', 'admin'], ['ops', 'operations'], ['ro', 'read_only']]) {
    users[k] = await createUser(`cod-${k}+${stamp}@example.com`, undefined, { full_name: k });
    sql(`insert into public.staff_members (email, role) values ('cod-${k}+${stamp}@example.com', '${role}')`);
  }
  const S = {};
  for (const k of ['admin', 'ops', 'ro']) S[k] = (await staffSession(`cod-${k}+${stamp}@example.com`)).client;

  // --- Placing ---------------------------------------------------------------
  const before = stock();
  const a = await place('cod', { email: 'esi.cod@example.com' });
  assert(!a.error && a.total_ghs !== null, `a pay on delivery order is placed (${a.error?.message ?? a.order_number})`);
  assert(row(a.id, 'status || \'/\' || payment_method || \'/\' || (paid_at is null)') === 'pending_payment/cod/true', 'it waits for confirmation and nothing is marked paid');
  assert(sql(`select count(*) from public.payments where order_id = '${a.id}'`) === '0', 'no payment is recorded');
  assert(Number(sql(`select extract(epoch from reservation_expires_at - now()) / 3600 from public.orders where id = '${a.id}'`)) > 23, 'the stock is held for the confirmation window (24 hours), not minutes');
  const [onHand0, reserved0] = before.split('/').map(Number);
  assert(stock() === `${onHand0}/${reserved0 + 1}`, 'the unit is reserved');
  assert(sql(`select payload ->> 'pay_on_delivery' from public.notifications where order_id = '${a.id}' and template = 'order_received'`) === 'true', 'the "order received" email says it is pay on delivery');
  assert((await errOf(admin.rpc('start_payment', { p_order_token: a.order_token, p_provider: 'test', p_reference: `COD-X-${stamp}` })))?.message.includes('paid on delivery'), 'an online payment cannot be started for it');

  // --- Rules ----------------------------------------------------------------
  sql('update public.store_settings set pay_on_delivery_enabled = false');
  assert((await place('cod', { phone: '024 000 0001' })).error?.message.includes('isn\'t available'), 'refused while the option is switched off');
  sql('update public.store_settings set pay_on_delivery_enabled = true, pay_on_delivery_max_ghs = 100');
  assert((await place('cod', { phone: '024 000 0002', qty: 5 })).error?.message.includes('up to GH₵ 100.00'), 'refused above the largest order');
  sql('update public.store_settings set pay_on_delivery_max_ghs = null');
  sql("update public.delivery_options set fee_ghs = null where id = 'standard'");
  assert((await place('cod', { phone: '024 000 0003', option: 'standard' })).error?.message.match(/delivery fee|not configured/), 'refused while the delivery fee is not set (the cash amount would be unknown)');
  sql("update public.delivery_options set fee_ghs = 20 where id = 'standard'");
  const extra = [];
  for (let i = 0; i < 2; i++) extra.push(await place('cod'));
  assert(extra.every((o) => !o.error), 'a phone number can have three unconfirmed orders');
  assert((await place('cod')).error?.message.includes('waiting for our confirmation'), 'a fourth is refused');
  sql(`update public.orders set status = 'cancelled' where id in ('${extra[0].id}', '${extra[1].id}')`);

  // --- Confirming -------------------------------------------------------------
  const m = await place('momo', { phone: '024 000 0004' });
  assert((await errOf(S.ops.rpc('admin_confirm_cod_order', { p_order_id: m.id })))?.message.includes('paid for online'), 'an online order cannot be confirmed by hand');
  assert((await errOf(S.ro.rpc('admin_confirm_cod_order', { p_order_id: a.id }))) !== null, 'read-only staff cannot confirm');
  assert((await errOf(anon.rpc('admin_confirm_cod_order', { p_order_id: a.id }))) !== null, 'shoppers cannot confirm');
  const reservedBefore = stock();
  assert(!(await errOf(S.ops.rpc('admin_confirm_cod_order', { p_order_id: a.id, p_note: 'Called Esi' }))), 'operations staff confirm the order');
  assert(row(a.id, "status || '/' || (paid_at is null) || '/' || (cod_confirmed_at is not null) || '/' || (reservation_expires_at is null)") === 'paid/true/true/true', 'it moves to the to-pack queue; still nothing paid');
  const [oh1, rs1] = reservedBefore.split('/').map(Number);
  assert(stock() === `${oh1 - 1}/${rs1 - 1}`, 'the reservation became a sale');
  assert(sql(`select count(*) from public.stock_movements where order_id = '${a.id}' and reason = 'sold'`) === '1', 'the sale is in the stock ledger');
  assert(sql(`select count(*) from public.audit_log where action = 'order.cod_confirmed' and entity_id = '${a.id}'`) === '1', 'the confirmation is audited');
  assert(sql(`select string_agg(channel, ',' order by channel) from public.notifications where order_id = '${a.id}' and template = 'order_confirmed' and payload ->> 'pay_on_delivery' = 'true'`) === 'email,sms', 'the shopper is told, by text and email');
  const { data: view } = await anon.rpc('get_order', { p_order_token: a.order_token });
  assert(view.cod_confirmed_at && view.paid_at === null && /^\d{4}$/.test(view.delivery_code ?? ''), 'the order page shows when it was confirmed, and the delivery code, though nothing is paid');
  assert((await errOf(S.ops.rpc('admin_confirm_cod_order', { p_order_id: a.id })))?.message.includes('paid'), 'it cannot be confirmed twice');
  const cols = await S.ops.from('orders').select('cod_confirmed_at, cash_collected_ghs').eq('id', a.id).single();
  assert(!cols.error, 'staff can read the new columns');
  assert((await S.ops.from('orders').select('delivery_code').eq('id', a.id)).error !== null, 'staff still cannot read the delivery code');

  // --- Delivery and cash -----------------------------------------------------
  const code = sql(`select delivery_code from public.orders where id = '${a.id}'`);
  sql(`update public.orders set status = 'out_for_delivery' where id = '${a.id}'`);
  assert((await errOf(S.ops.rpc('admin_mark_delivered', { p_order_id: a.id, p_recipient: 'Esi', p_code: code })))?.message.includes('in cash'), 'delivery needs "cash collected" for a pay on delivery order');
  assert((await S.ops.rpc('admin_mark_delivered', { p_order_id: a.id, p_recipient: 'Esi', p_code: '0000', p_cash_collected: true })).data === 'wrong_code', 'the delivery code is still checked');
  assert((await S.ops.rpc('admin_mark_delivered', { p_order_id: a.id, p_recipient: 'Esi', p_code: code, p_cash_collected: true })).data === 'delivered', 'delivered with the cash collected');
  assert(row(a.id, "status || '/' || (paid_at is not null) || '/' || (cash_collected_ghs = total_ghs) || '/' || refund_due") === 'delivered/true/true/false', 'the cash is recorded at the order total, with no refund due');
  assert(sql(`select provider || ':' || provider_reference || ':' || status from public.payments where order_id = '${a.id}'`) === `cash:COD-${a.order_number}:succeeded`, 'a cash payment row is written');
  assert(sql(`select count(*) from public.audit_log where action = 'order.cash_collected' and entity_id = '${a.id}'`) === '1', 'the cash collection is audited');

  // --- Cancelling ------------------------------------------------------------
  const c = await place('cod', { phone: '024 000 0005' });
  await S.ops.rpc('admin_confirm_cod_order', { p_order_id: c.id });
  const heldBefore = stock();
  assert(!(await errOf(anon.rpc('cancel_my_order', { p_order_token: c.order_token }))), 'a shopper can cancel a confirmed order before packing');
  assert(row(c.id, "status || '/' || refund_due") === 'cancelled/false', 'no refund is flagged: nothing was paid');
  const [oh2] = heldBefore.split('/').map(Number);
  assert(stock().split('/')[0] === String(oh2 + 1), 'the unit goes back on sale');

  const d = await place('cod', { phone: '024 000 0006' });
  assert(!(await errOf(S.ops.rpc('admin_cancel_order', { p_order_id: d.id, p_reason: 'Could not reach the customer' }))), 'staff can cancel an unconfirmed order');
  assert(row(d.id, "status || '/' || refund_due") === 'cancelled/false', 'with no refund');

  // --- The hold runs out -----------------------------------------------------
  const e = await place('cod', { phone: '024 000 0007' });
  sql(`update public.orders set reservation_expires_at = now() - interval '1 minute' where id = '${e.id}'`);
  sql('select public.expire_unpaid_orders()');
  assert(row(e.id, 'status') === 'cancelled', 'an order nobody confirmed in time is cancelled by the scheduled job, and its stock released');

  if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
  console.log('all pay on delivery checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
