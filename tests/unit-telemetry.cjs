// What may leave the site for Sentry and PostHog: order tokens, phone numbers, email addresses, cookies and request bodies
// are removed, and nothing is collected in the admin console.
process.env.TSX_TSCONFIG_PATH ??= require('path').resolve(__dirname, '../apps/web/tsconfig.json');
require('tsx/cjs');
const { redactText, scrubUrl, isPrivatePath, scrubAnalyticsEvent, scrubMonitoringEvent } = require('../apps/web/src/lib/telemetry/scrub.ts');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const TOKEN = '0b8f0f8e-9e1e-4f1a-9d0e-0d1b0c1a1a11';

assert(scrubUrl(`https://shop.example/orders/${TOKEN}/receipt`) === 'https://shop.example/orders/:token/receipt', 'an order link loses its token');
assert(scrubUrl(`/orders/${TOKEN}`) === '/orders/:token', 'in a path on its own too');
assert(scrubUrl('https://shop.example/track?order=SC-1006&phone=024+123+4567&page=2') === 'https://shop.example/track?order=%5Bremoved%5D&phone=%5Bremoved%5D&page=2', 'sensitive query values are removed, others kept');
assert(scrubUrl('https://shop.example/products/serum?utm_source=fb') === 'https://shop.example/products/serum?utm_source=fb', 'ordinary addresses are unchanged');
assert(scrubUrl('/help/report?order=' + TOKEN) === '/help/report?order=%5Bremoved%5D', 'including the order link on the report page');
assert(redactText(`Call 024 123 4567 or ama@example.com about SC-1006 (${TOKEN})`) === 'Call [number] or [email] about [order] ([token])', 'free text loses numbers, emails, order numbers and tokens');
assert(redactText('Product slug vitamin-c-serum, GH₵ 150, 2 items') === 'Product slug vitamin-c-serum, GH₵ 150, 2 items', 'and everything else is left alone');
assert(isPrivatePath('/admin/orders') && isPrivatePath('/auth/callback') && !isPrivatePath('/products/x') && !isPrivatePath('/account'), 'the admin console and sign-in callbacks are private; the store is not');

const page = (url, extra = {}) => ({ event: '$pageview', properties: { $current_url: url, $pathname: new URL(url).pathname, $referrer: `https://shop.example/orders/${TOKEN}`, ...extra } });
assert(scrubAnalyticsEvent(page('https://shop.example/admin/orders')) === null, 'nothing is recorded in the admin console');
const sent = scrubAnalyticsEvent(page(`https://shop.example/orders/${TOKEN}`));
assert(sent.properties.$current_url === 'https://shop.example/orders/:token' && sent.properties.$pathname === '/orders/:token' && sent.properties.$referrer === 'https://shop.example/orders/:token', 'a page view of an order carries no token, as page or referrer');
assert(scrubAnalyticsEvent(null) === null && scrubAnalyticsEvent({ event: 'x' }).event === 'x', 'empty events pass through');
assert(scrubAnalyticsEvent({ event: 'added_to_bag', properties: { product: 'serum', quantity: 1 } }).properties.product === 'serum', 'named events keep their labels');

const error = scrubMonitoringEvent({
  user: { email: 'ama@example.com', ip_address: '1.2.3.4' },
  message: 'Order SC-1006 failed for 024 123 4567',
  transaction: `/orders/${TOKEN}`,
  request: { url: `https://shop.example/orders/${TOKEN}?phone=0241234567`, cookies: { session: 'x' }, headers: { cookie: 'x' }, data: { name: 'Ama' }, query_string: 'phone=0241234567' },
  exception: { values: [{ value: `No order for ${TOKEN} (ama@example.com)` }] },
  breadcrumbs: [{ message: 'tapped 024 123 4567', data: { url: `/api/payments/webhook?token=${TOKEN}`, body: '{"phone":"024"}' } }],
  extra: { reference: 'SC-1006-abc', count: 3 },
});
assert(!('user' in error), 'the person is dropped');
assert(!error.request.cookies && !error.request.headers && !error.request.data && !error.request.query_string, 'cookies, headers, request bodies and query strings are dropped');
assert(error.request.url === `https://shop.example/orders/:token?phone=%5Bremoved%5D` && error.transaction === '/orders/:token', 'addresses are scrubbed');
assert(error.message === 'Order [order] failed for [number]' && error.exception.values[0].value === 'No order for [token] ([email])', 'messages are redacted');
assert(error.breadcrumbs[0].message === 'tapped [number]' && error.breadcrumbs[0].data.url === '/api/payments/webhook?token=%5Bremoved%5D' && !('body' in error.breadcrumbs[0].data), 'breadcrumbs are redacted and carry no bodies');
assert(error.extra.reference === '[order]-abc' && error.extra.count === 3, 'extra context is redacted, not removed');

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll telemetry checks passed');
process.exit(failures ? 1 : 0);
