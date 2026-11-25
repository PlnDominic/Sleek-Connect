const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Run the screen's rendering logic with fixture query responses, without a device or live payment provider.
function load(file, imports = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {};
  new Function('require', 'exports', outputText)((name) => imports[name] ?? {}, exports);
  return exports;
}

const jsx = (type, props) => ({ type, props });
const native = { FlatList: 'List', View: 'View', TextInput: 'Input', ScrollView: 'ScrollView', StyleSheet: { create: (styles) => styles } };
const department = (value) => ['kids', 'beauty'].includes(value);
const products = [
  { slug: 'blocks', department: 'kids', price: 35, was: 50, rating: 5 },
  { slug: 'balls', department: 'kids', price: 25, was: 30, rating: 3 },
  { slug: 'train', department: 'kids', price: 10, rating: 4 },
  { slug: 'soap', department: 'beauty', price: 10, was: 20 },
];

function renderShop({ text = '', searchSort = 'relevance', matches = {}, params = {} } = {}) {
  const { default: Shop } = load('apps/mobile/src/app/(tabs)/shop.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': native,
    react: {
      useCallback: (fn) => fn, useEffect: () => {}, useMemo: (fn) => fn(), useRef: () => ({}),
      useState: (initial) => [initial === '' ? text : searchSort, () => {}],
    },
    'expo-router': { useLocalSearchParams: () => params },
    '@sleek/shared': { isDepartment: department, departmentIds: [], departmentLabels: {} },
    '@/components/ui': { useScreenTop: () => 0 },
    '@/components/States': { EmptyState: 'State' },
    '@/lib/useDebounced': { useDebounced: (value) => value },
    '@/theme/theme': { useColors: () => ({}), useStyles: () => ({}) },
    '@/lib/query': {
      useQuery: (key) => key === 'products:all' ? { data: products } : key === 'categories' ? { data: [] } : matches,
    },
  });
  const child = Shop();
  return child.type(child.props).props;
}

const slugs = (list) => list.data.map((product) => product.slug);

(async () => {
  let retried = false;
  const failed = renderShop({ text: 'toy', matches: { error: new Error('Search offline'), refetch: () => { retried = true; } } });
  assert.deepEqual(slugs(failed), []);
  assert.equal(failed.ListEmptyComponent.props.title, 'Search is temporarily unavailable');
  failed.ListEmptyComponent.props.action.onPress();
  assert.equal(retried, true);

  const matches = { data: ['blocks', 'balls'] };
  assert.deepEqual(slugs(renderShop({ text: 'toy', matches })), ['blocks', 'balls']);
  assert.deepEqual(slugs(renderShop({ text: 'toy', matches, searchSort: 'price-asc' })), ['balls', 'blocks']);
  assert.deepEqual(slugs(renderShop({ text: 'toy', matches: { data: [] } })), []);

  const { appHref } = load('apps/mobile/src/lib/links.ts', { '@sleek/shared': { isDepartment: department } });
  const sale = appHref('/shop/kids?sale=1');
  assert.equal(sale.params.department, 'kids');
  assert.equal(sale.params.sale, '1');
  assert.deepEqual(slugs(renderShop({ params: sale.params })), ['blocks', 'balls']);

  const { checkoutPaymentState } = load('apps/mobile/src/lib/orders.ts');
  assert.equal(checkoutPaymentState({ status: 'cancelled', paymentStatus: null }), 'expired');
  assert.equal(checkoutPaymentState({ status: 'cancelled', paymentStatus: 'expired' }), 'verifying');
  assert.equal(checkoutPaymentState({ status: 'cancelled', paymentStatus: 'failed' }), 'verifying');
  assert.equal(checkoutPaymentState({ status: 'cancelled', paymentStatus: 'succeeded' }), 'review');
  assert.equal(checkoutPaymentState({ status: 'paid', paymentStatus: 'succeeded' }), 'confirmed');

  const { getPaymentOptions, selectDeliveryQuote } = load('apps/mobile/src/lib/checkout.ts', {
    './site': { siteConfigured: true, siteAddress: (url) => url },
  });
  global.fetch = async () => { throw new Error('Offline'); };
  await assert.rejects(getPaymentOptions(), /Offline/);
  global.fetch = async () => ({ ok: false });
  await assert.rejects(getPaymentOptions(), /Could not check payment options/);
  global.fetch = async () => ({ ok: true, json: async () => ({ online: false, card: false, hosted: false }) });
  assert.equal((await getPaymentOptions()).online, false);
  global.fetch = async () => ({ ok: true, json: async () => ({ online: true, card: true, hosted: true }) });
  assert.equal((await getPaymentOptions()).card, true);

  const quote = (id, available, fee) => ({ option: { id }, q: { available, fee } });
  const standard = quote('standard', true, 20);
  const express = quote('express', true, 30);
  assert.equal(selectDeliveryQuote([standard, express], 'express'), express);
  assert.equal(selectDeliveryQuote([quote('express', false, 30), standard], 'express'), standard);
  assert.equal(selectDeliveryQuote([quote('express', true, null), standard], 'express'), standard);
  assert.equal(selectDeliveryQuote([], 'express'), undefined);

  const calls = [];
  const { placeOrder } = load('apps/mobile/src/lib/checkout.ts', {
    './supabase': { supabase: { rpc(name, args) {
      calls.push([name, args]);
      return { single: async () => ({ error: { code: '22023', message: 'That promo code is invalid or has expired.' } }) };
    } } },
  });
  await assert.rejects(placeOrder({
    customer: { name: 'Guest', phone: '0245550123', area: 'Osu', adultConfirmed: true },
    deliveryOption: 'standard', payment: { card: true }, items: [{ slug: 'blocks', quantity: 1 }],
    promoCode: ' EXPIRED ',
  }), /invalid or has expired/);
  assert.deepEqual(calls.map(([name, args]) => [name, args.p_promo_code]), [['place_order', 'EXPIRED']]);

  console.log('Mobile shopping checks passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
