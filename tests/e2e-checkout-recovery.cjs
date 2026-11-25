const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { admin, sql } = require('./lib.cjs');

const base = process.env.CHECKOUT_TEST_BASE_URL ?? 'http://localhost:3000';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  try {
    const phone = `024${String(Date.now()).slice(-7)}`;
    sql("insert into public.promotions (code, label, kind, value) values ('CHECKOUT10', 'Checkout test discount', 'fixed', 10) on conflict (code) do nothing");
    const page = await browser.newPage();
    await page.goto(base + '/products/gentle-baby-wash-shampoo');
    await page.getByRole('button', { name: '200 ml', exact: true }).click();
    await page.getByRole('button', { name: 'Add to bag' }).click();
    await page.goto(base + '/checkout');
    await page.getByLabel(/accept the Terms of Service/).check();
    await page.getByLabel('Full name').fill('Checkout Recovery Test');
    await page.getByLabel('Phone number').fill(phone);
    await page.getByLabel('Location', { exact: true }).fill('Osu');
    await page.getByRole('radio', { name: /Same day/ }).check();
    await page.getByLabel('Wallet number').fill(phone);
    await page.getByLabel('Promo code', { exact: true }).fill('EXPIRED');
    await page.getByRole('button', { name: 'Review discounted total' }).click();
    await page.getByRole('alert').filter({ hasText: /invalid or has expired/ }).waitFor();
    assert.equal(sql(`select count(*) from public.orders where phone = '${phone}'`), '0');

    await page.getByLabel('Promo code', { exact: true }).fill('CHECKOUT10');
    await page.getByRole('button', { name: 'Review discounted total' }).click();
    const pay = page.getByRole('button', { name: /^Pay.*70/ });
    await pay.waitFor();
    const orderId = sql(`select id from public.orders where phone = '${phone}'`);
    assert.match(orderId, /^[0-9a-f-]{36}$/);
    assert.equal(sql(`select count(*) from public.payments where order_id = '${orderId}'`), '0');

    await pay.click();
    await page.getByText('Check your phone', { exact: true }).waitFor();
    assert.equal(sql(`select amount_ghs from public.payments where order_id = '${orderId}'`), '70.00');
    const reference = sql(`select provider_reference from public.payments where order_id = '${orderId}'`);
    const failed = await admin.rpc('confirm_payment', { p_provider: 'test', p_reference: reference, p_status: 'failed', p_amount_ghs: 0 });
    assert.ifError(failed.error);
    const check = page.getByRole('link', { name: 'Check payment status' });
    await check.waitFor();
    assert.equal(await page.getByRole('button', { name: 'Try again', exact: true }).count(), 0);

    await check.click();
    await page.getByRole('heading', { name: 'Checking your payment' }).waitFor();
    const paid = await admin.rpc('confirm_payment', { p_provider: 'test', p_reference: reference, p_status: 'succeeded', p_amount_ghs: 70 });
    assert.ifError(paid.error);
    await page.getByRole('button', { name: 'Check payment status' }).click();
    await page.getByText('Confirmed', { exact: true }).first().waitFor();
    console.log('Checkout promo and late payment recovery passed');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
