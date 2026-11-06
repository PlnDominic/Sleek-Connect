// Customers can type their own delivery area: a listed area keeps its zone's rates, any other uses the option's standard fee.
const { URL_, KEY, sql, createClient } = require('./lib.cjs');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const anon = createClient(URL_, KEY, { auth: { persistSession: false } });

const order = (area) => anon.rpc('place_order', {
  p_customer: { name: 'Esi Mensah', phone: '024 123 4567', area, adult_confirmed: true },
  p_delivery_option: 'same_day',
  p_payment: { method: 'momo', network: 'mtn', wallet: '024 765 4321' },
  p_items: [{ slug: 'argan-hair-oil', quantity: 1 }],
  p_is_gift: false,
}).single();

(async () => {
  sql("update public.delivery_options set fee_ghs = 30 where id = 'same_day'");
  const typed = await order('Behind the Shell filling station, Weija');
  assert(!typed.error, 'an area the store does not list is accepted');
  assert(Number(typed.data.delivery_fee_ghs) === 30, 'and is priced at the option\'s standard fee');
  assert(sql(`select area from public.orders where order_number = '${typed.data.order_number}'`) === 'Behind the Shell filling station, Weija', 'the typed area is kept on the order');
  assert((await order('')).error?.message.includes('Enter the area'), 'an empty area is refused');
  assert((await order('x'.repeat(81))).error?.message.includes('80 characters'), 'so is an over-long one');
  const listed = await order('Osu');
  assert(!listed.error, 'a listed area still works');
  process.exit(failures ? 1 : 0);
})();
