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

  const { purchaseUnits, removePurchasedUnits } = load('packages/shared/src/bag.tsx', { react: { createContext: () => ({}) } });
  const first = { slug: 'blocks', qty: 2, unitPrice: 35, purchaseUnits: ['old-1', 'old-2'], inStock: true };
  const updated = { ...first, qty: 3, purchaseUnits: ['old-1', 'old-2', 'new-1'] };
  const settled = removePurchasedUnits([updated], purchaseUnits(first));
  assert.equal(settled[0].qty, 1);
  assert.deepEqual(settled[0].purchaseUnits, ['new-1']);
  assert.deepEqual(removePurchasedUnits(settled, purchaseUnits(first)), settled);
  const readded = { ...first, qty: 1, purchaseUnits: ['new-2'] };
  assert.deepEqual(removePurchasedUnits([readded], purchaseUnits(first)), [readded]);

  const { bagLineChanges, refreshBagLines } = load('apps/mobile/src/lib/bag-checkout.ts', {
    '@sleek/shared/bag': { bagItemFrom: (product, sizeId, qty) => ({ ...product, sizeId, qty }) },
    './catalog': { getBagProducts: async () => [{ ...first, unitPrice: 42, name: 'Blocks' }] },
  });
  const stale = [first, { slug: 'missing', name: 'Discontinued', unitPrice: 10, qty: 2, inStock: true }];
  const fresh = await refreshBagLines(stale);
  assert.deepEqual(bagLineChanges(stale, fresh), [
    { name: 'Blocks', unavailable: false, price: 42 },
    { name: 'Discontinued', unavailable: true, price: 10 },
  ]);
  assert.equal(fresh[0].qty, first.qty);

  const { getProductReviews } = load('apps/mobile/src/lib/reviews.ts', {
    './supabase': { supabase: { rpc(name, args) {
      if (name === 'get_review_summary') return { single: async () => ({ data: { review_count: 13, average: 4.8 } }) };
      assert.equal(name, 'get_product_reviews_page');
      assert.equal(args.p_offset, 5);
      return Promise.resolve({ data: [{ id: 'second-page', rating: 5, body: 'Arrived on time' }] });
    } } },
  });
  assert.equal((await getProductReviews('blocks', 1)).reviews[0].id, 'second-page');

  const shelf = new Map();
  const deviceStorage = { getItem: (key) => shelf.get(key) ?? null, setItem: (key, value) => shelf.set(key, value) };
  const providerCalls = [];
  let failRemoval = false;
  const { registerForPush, unregisterPush, pushAllowed } = load('apps/mobile/src/lib/push.tsx', {
    'react-native': { Platform: { OS: 'android' } },
    'expo-device': { isDevice: true },
    'expo-constants': { __esModule: true, default: { easConfig: { projectId: 'test-project' } } },
    'expo-notifications': {
      AndroidImportance: { DEFAULT: 1 }, setNotificationHandler() {}, setNotificationChannelAsync: async () => {},
      getPermissionsAsync: async () => ({ status: 'granted' }), getExpoPushTokenAsync: async () => ({ data: 'fixture-push-token' }),
    },
    './storage': { deviceStorage },
    './supabase': { supabase: { async rpc(name) {
      providerCalls.push(name);
      return name === 'unregister_push_device' && failRemoval ? { error: new Error('Offline') } : { error: null };
    } } },
  });
  assert.equal(await registerForPush('order'), 'granted');
  failRemoval = true;
  assert.equal(await unregisterPush(), false);
  assert.equal(await pushAllowed(), false);
  failRemoval = false;
  assert.equal(await registerForPush('order'), 'denied');
  assert.deepEqual(providerCalls, ['register_push_device', 'unregister_push_device', 'unregister_push_device']);
  assert.equal(await registerForPush('order', { enable: true }), 'granted');

  let owner = null;
  const remote = new Map([['a', new Set(['web-a'])], ['b', new Set(['web-b'])]]);
  const { useSaved } = load('apps/mobile/src/lib/saved.ts', {
    react: { useCallback: (fn) => fn, useSyncExternalStore: () => {} },
    './auth': { useAuth: () => ({ user: owner ? { id: owner } : null, consented: Boolean(owner) }) },
    './storage': { deviceStorage },
    './query': { useQuery: (key, fn) => ({ refetch: () => key && fn() }) },
    './supabase': {
      supabase: { auth: { getSession: async () => ({ data: { session: { access_token: owner, user: { id: owner } } } }) } },
      shopperClient: (id) => ({
      async rpc(name, args) {
        const list = remote.get(id);
        if (name === 'set_wishlist') for (const slug of args.p_slugs) args.p_saved ? list.add(slug) : list.delete(slug);
        return { data: [...list].map((slug) => ({ slug })) };
      },
      }),
    },
  });
  useSaved().toggle('guest-item');
  owner = 'a';
  await useSaved().refetch();
  assert.deepEqual(useSaved().slugs, ['web-a', 'guest-item']);
  owner = 'b';
  assert.deepEqual(useSaved().slugs, []);
  await useSaved().refetch();
  assert.deepEqual(useSaved().slugs, ['web-b']);

  console.log('Mobile shopping checks passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
