// The Hubtel provider: what it asks Hubtel for, how it reads the callback, and that nothing is trusted without the
// secret in the callback address and a matching answer from Hubtel's status check. Hubtel is replaced by a fake fetch.
process.env.TSX_TSCONFIG_PATH ??= require('path').resolve(__dirname, '../apps/web/tsconfig.json');
process.env.SITE_URL = 'https://shop.example';
require('tsx/cjs');
const { hubtelConfig, createHubtelProvider, hubtelCallbackToken, hubtelMsisdn } = require('../apps/web/src/lib/payments/hubtel.ts');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const rejects = async (p) => p.then(() => null, (e) => e);

const env = { HUBTEL_API_ID: 'id1', HUBTEL_API_KEY: 'key1', HUBTEL_MERCHANT_ACCOUNT: '11684', PAYMENT_WEBHOOK_SECRET: 'sekret' };

(async () => {
  assert(hubtelConfig({}) === null && hubtelConfig({ ...env, HUBTEL_API_KEY: ' ' }) === null, 'without all four settings, Hubtel is off');
  const config = hubtelConfig(env);
  assert(config.card === true && config.skipStatusCheck === false, 'cards are on and the status check is on by default');
  assert(hubtelConfig({ ...env, HUBTEL_CARD: 'off' }).card === false && hubtelConfig({ ...env, HUBTEL_SKIP_STATUS_CHECK: 'true' }).skipStatusCheck === true, 'both can be switched');
  assert(hubtelMsisdn('024 123 4567') === '233241234567' && hubtelMsisdn('+233 24 123 4567') === '233241234567', 'phone numbers are sent as 233XXXXXXXXX');

  // --- Starting a payment ----------------------------------------------------
  const calls = [];
  let reply = { ok: true, status: 200, json: { responseCode: '0000', status: 'Success', data: { checkoutId: 'c1', clientReference: 'SC-1001-abc', checkoutUrl: 'https://pay.hubtel.example/c1' } } };
  const fake = async (url, init) => { calls.push({ url, init }); return { ok: reply.ok, status: reply.status, json: async () => reply.json }; };
  const provider = createHubtelProvider(config, fake);
  assert(provider.name === 'hubtel' && provider.supportsCard && provider.hostedCheckout && !provider.testMode, 'it is a real provider with a hosted page and cards');
  const out = await provider.requestPayment({ reference: 'SC-1001-abc', orderNumber: 'SC-1001', amountGhs: 130, method: 'momo', network: 'mtn', wallet: '024 123 4567', returnPath: '/orders/tok' });
  assert(out.checkoutUrl === 'https://pay.hubtel.example/c1', 'the shopper is sent to the checkout address Hubtel returns');
  const sent = JSON.parse(calls[0].init.body);
  assert(calls[0].url === 'https://payproxyapi.hubtel.com/items/initiate' && calls[0].init.headers.Authorization === `Basic ${Buffer.from('id1:key1').toString('base64')}`, 'the request goes to Hubtel with the API ID and key');
  assert(sent.totalAmount === 130 && sent.clientReference === 'SC-1001-abc' && sent.merchantAccountNumber === '11684', 'it carries our amount, our reference and the merchant account');
  assert(sent.returnUrl === 'https://shop.example/orders/tok' && sent.cancellationUrl === 'https://shop.example/orders/tok', 'and the shopper comes back to their order');
  assert(sent.callbackUrl === `https://shop.example/api/payments/webhook?token=${hubtelCallbackToken('sekret')}` && !sent.callbackUrl.includes('sekret'), 'the callback address has a secret derived from, not equal to, the webhook secret');
  assert(sent.payeeMobileNumber === '233241234567', 'the Mobile Money number is pre-filled');
  await provider.requestPayment({ reference: 'SC-1002-abc', orderNumber: 'SC-1002', amountGhs: 50.5, method: 'card', returnPath: '/orders/t2' });
  assert(!('payeeMobileNumber' in JSON.parse(calls[1].init.body)), 'a card payment has no number pre-filled');
  reply = { ok: false, status: 401, json: { message: 'Unauthorized' } };
  const refused = await rejects(provider.requestPayment({ reference: 'r', orderNumber: 'SC-1', amountGhs: 1, method: 'card', returnPath: '/' }));
  assert(refused && refused.message.includes('401') && !refused.message.includes('key1'), 'a refusal from Hubtel is an error that does not leak the credentials');
  reply = { ok: true, status: 200, json: { responseCode: '0000', data: { checkoutDirectUrl: 'https://direct.example/x' } } };
  assert((await provider.requestPayment({ reference: 'r', orderNumber: 'SC-1', amountGhs: 1, method: 'card', returnPath: '/' })).checkoutUrl === 'https://direct.example/x', 'the direct checkout address is used when that is all Hubtel returns');

  // --- Reading the callback --------------------------------------------------
  const good = new URL(`https://shop.example/api/payments/webhook?token=${hubtelCallbackToken('sekret')}`);
  const callback = (data, root = {}) => JSON.stringify({ ResponseCode: '0000', Status: 'Success', Data: { ClientReference: 'SC-1001-abc', Amount: 130, Status: 'Success', ...data }, ...root });
  assert((await rejects(provider.readWebhook(callback({}), new Headers(), new URL('https://shop.example/api/payments/webhook'))))?.name === 'WebhookSignatureError', 'a callback without the secret is rejected');
  assert((await rejects(provider.readWebhook(callback({}), new Headers(), new URL('https://shop.example/api/payments/webhook?token=nope'))))?.name === 'WebhookSignatureError', 'and so is one with the wrong secret');
  const ok = await provider.readWebhook(callback({}), new Headers(), good);
  assert(ok.reference === 'SC-1001-abc' && ok.status === 'succeeded' && ok.amountGhs === 130, 'a success callback is read');
  const failed = await provider.readWebhook(callback({ Status: 'Failed' }, { ResponseCode: '2001', Status: 'Failed' }), new Headers(), good);
  assert(failed.status === 'failed', 'an explicit failure is read');
  assert((await provider.readWebhook(callback({ Status: 'Pending' }, { ResponseCode: '0001', Status: 'Pending' }), new Headers(), good)) === null, 'a pending notification is not an outcome');
  assert((await provider.readWebhook(JSON.stringify({ ResponseCode: '0000', Status: 'Success', ClientReference: 'SC-9-x', Amount: 5, Data: {} }), new Headers(), good))?.reference === 'SC-9-x', 'fields at the root are found when Data does not have them');
  assert((await provider.readWebhook(JSON.stringify({ ResponseCode: '0000', Status: 'Success' }), new Headers(), good)) === null, 'a callback with no reference is ignored');

  // --- Confirming with Hubtel --------------------------------------------------
  const paid = { reference: 'SC-1001-abc', status: 'succeeded', amountGhs: 1, event: {} };
  calls.length = 0;
  reply = { ok: true, status: 200, json: { responseCode: '0000', data: { status: 'Paid', clientReference: 'SC-1001-abc', amount: 130 } } };
  const verified = await provider.verify(paid);
  assert(calls[0].url === 'https://api-txnstatus.hubtel.com/transactions/11684/status?clientReference=SC-1001-abc', 'the status check asks Hubtel about our reference');
  assert(verified.status === 'succeeded' && verified.amountGhs === 130, 'a paid answer counts, at the amount Hubtel reports (not the callback\'s)');
  reply = { ok: true, status: 200, json: { data: { status: 'Unpaid', clientReference: 'SC-1001-abc', amount: 130 } } };
  assert((await provider.verify(paid)) === null, 'an unpaid answer is not a payment, whatever the callback said');
  assert((await provider.verify({ ...paid, status: 'failed' }))?.status === 'failed', 'but an unpaid answer confirms a reported failure');
  reply = { ok: true, status: 200, json: { data: { status: 'Paid', clientReference: 'SC-OTHER', amount: 130 } } };
  assert((await rejects(provider.verify(paid)))?.message.includes('another payment'), 'an answer about a different reference is refused');
  reply = { ok: false, status: 403, json: {} };
  assert((await rejects(provider.verify(paid)))?.message.includes('403'), 'if Hubtel can\'t be asked (for example our IP is not whitelisted), nothing is confirmed');
  const lax = createHubtelProvider(hubtelConfig({ ...env, HUBTEL_SKIP_STATUS_CHECK: 'true' }), fake);
  assert((await lax.verify(paid)) === paid, 'with the status check skipped, the callback is used as it is');

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll Hubtel checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
