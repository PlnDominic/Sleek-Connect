/**
 * Plays the payment provider for the `test` provider: finds the order's pending payment and posts a signed outcome to
 * the web app's webhook, exactly as a real provider would.
 *
 *   npm run payments:simulate -- SC-1001 succeeded
 *   npm run payments:simulate -- SC-1001 failed
 *   npm run payments:simulate -- SC-1001 succeeded --amount 10   (a wrong amount, which flags the order for review)
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY and PAYMENT_WEBHOOK_SECRET from apps/web/.env.local.
 * Set SITE_URL to target something other than http://localhost:3000.
 */
import { createHmac } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// npm runs scripts from the repository root.
const envFile = resolve('apps/web/.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const [orderNumber, status, ...rest] = process.argv.slice(2);
if (!orderNumber || (status !== 'succeeded' && status !== 'failed')) {
  fail('Usage: npm run payments:simulate -- <order number> <succeeded|failed> [--amount <GH₵>]');
}
const amountFlag = rest.indexOf('--amount');
const amountOverride = amountFlag === -1 ? undefined : Number(rest[amountFlag + 1]);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET;
if (!url || !secretKey || !webhookSecret) {
  fail('Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY and PAYMENT_WEBHOOK_SECRET in apps/web/.env.local.');
}

async function main(url: string, secretKey: string, webhookSecret: string) {
  const supabase = createClient(url, secretKey, { auth: { persistSession: false } });
  const { data: payment, error } = await supabase
    .from('payments')
    .select('provider_reference, amount_ghs, orders!inner(order_number)')
    .eq('orders.order_number', orderNumber)
    .eq('provider', 'test')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fail(`Could not look up the payment: ${error.message}`);
  if (!payment) fail(`No pending test payment for order ${orderNumber}.`);

  const body = JSON.stringify({
    reference: payment.provider_reference,
    status,
    amount_ghs: amountOverride ?? Number(payment.amount_ghs),
  });
  const signature = `sha256=${createHmac('sha256', webhookSecret).update(body).digest('hex')}`;
  const site = process.env.SITE_URL ?? 'http://localhost:3000';

  const response = await fetch(`${site}/api/payments/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-sleek-signature': signature },
    body,
  });
  console.log(`${response.status} ${await response.text()}`);
  if (!response.ok) process.exit(1);
}

void main(url, secretKey, webhookSecret);
