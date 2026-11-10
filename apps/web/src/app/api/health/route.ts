import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createSupabase, supabaseConfig } from '@/lib/supabase/server';
import { emailProvider, smsProvider } from '@/lib/notifications/providers';
import { getPaymentProvider } from '@/lib/payments';
import { missingEnv } from '@/lib/env';
import { logger, requestId, withRequestId } from '@/lib/observability';

/** Constant-time comparison, so the response time doesn't reveal how much of the secret was right. */
function sameSecret(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function configured(name: string | undefined, provider: unknown) {
  if (!name) return 'disabled';
  return provider ? 'configured' : 'misconfigured';
}

function integrationStatus() {
  const paymentName = process.env.PAYMENT_PROVIDER;
  const smsName = process.env.SMS_PROVIDER;
  const emailName = process.env.EMAIL_PROVIDER;
  const payment = configured(paymentName, getPaymentProvider());
  const sms = configured(smsName, smsProvider());
  const email = configured(emailName, emailProvider());
  const production = process.env.VERCEL_ENV === 'production';
  const site = process.env.SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const auth = site && !site.includes('localhost') ? 'configured' : production ? 'misconfigured' : 'development';
  // The webhook only works when the provider and its signature secret are both set; the dispatcher and the
  // scheduled job that calls it only work with CRON_SECRET (and SITE_URL for the message links).
  const webhook = !paymentName ? 'disabled' : process.env.PAYMENT_WEBHOOK_SECRET ? 'configured' : 'misconfigured';
  const cron = process.env.CRON_SECRET ? 'configured' : production ? 'misconfigured' : 'disabled';
  const jobs = process.env.CRON_SECRET && site ? 'configured' : production ? 'misconfigured' : 'disabled';
  const states = [payment, sms, email, auth, webhook, cron, jobs];
  return { payment, sms, email, auth, webhook, dispatcher: cron, jobs, issues: states.filter((s) => s === 'misconfigured').length };
}

/** The deployed schema is the one the app expects (P0 items 1 and 2), or the migrations have not been applied. */
async function checkSchema(requestIdValue: string) {
  const { data, error } = await createSupabase().rpc('verify_launch_schema');
  if (error) {
    logger.warn('schema_verification_unavailable', { requestId: requestIdValue, code: error.code ?? 'unknown' });
    return 'unapplied';
  }
  return (data as unknown as { ok?: boolean } | null)?.ok === true ? 'ok' : 'mismatch';
}

/**
 * Whether the business values the launch checklist requires have been entered (P0 item 14):
 * every delivery option priced, and a support contact to show in the help centre. Shoppers type their own location, so
 * listing delivery areas is optional (they only group places into zones with their own fees).
 */
async function launchReadiness() {
  const supabase = createSupabase();
  const [settings, options] = await Promise.all([
    supabase
      .from('store_settings')
      .select('support_phone, support_whatsapp, support_email, support_hours, free_delivery_threshold_ghs')
      .limit(1)
      .maybeSingle(),
    supabase.from('delivery_options').select('fee_ghs'),
  ]);
  const row = settings.data;
  const support = [row?.support_phone, row?.support_whatsapp, row?.support_email].some((v) => v) ? 'ready' : 'incomplete';
  const fees = options.data ?? [];
  const delivery = fees.length > 0 && fees.every((option) => option.fee_ghs !== null) ? 'ready' : 'incomplete';
  return { delivery, support };
}

async function checkDatabase() {
  supabaseConfig();
  const { error } = await createSupabase().from('store_settings').select('id').limit(1);
  if (error) throw error;
}

export async function GET(request: Request) {
  const id = requestId(request);
  const checkedAt = new Date().toISOString();
  try {
    await checkDatabase();
    const integrations = integrationStatus();
    const [schema, launch] = await Promise.all([checkSchema(id), launchReadiness()]);
    const missing = missingEnv();
    const environment = { ok: missing.length === 0, missing };
    const issues = integrations.issues + (schema === 'ok' ? 0 : 1) + missing.length;
    const status = issues === 0 ? 'ok' : 'degraded';
    // Which integrations are set up and which variables are missing helps an attacker, so the full report needs the cron secret
    // (the same bearer token the scheduled job uses). Everyone else, including a simple uptime monitor, gets the overall status.
    const secret = process.env.CRON_SECRET;
    const detailed = Boolean(secret) && sameSecret(request.headers.get('authorization') ?? '', `Bearer ${secret}`);
    const body = detailed
      ? {
          status,
          service: 'sleek-connect-web',
          database: 'ok',
          integrations,
          checks: { schema, delivery: launch.delivery, support: launch.support },
          environment,
          checkedAt,
        }
      : { status, service: 'sleek-connect-web', database: 'ok', checkedAt };
    return withRequestId(NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } }), id);
  } catch (error) {
    logger.error('health_check_failed', error, { requestId: id });
    return withRequestId(NextResponse.json({ status: 'degraded', service: 'sleek-connect-web', database: 'unavailable', checkedAt, requestId: id }, { status: 503, headers: { 'Cache-Control': 'no-store' } }), id);
  }
}

/** Readiness probe: the app has its required configuration, can reach Supabase, and the schema is deployed. */
export async function HEAD(request: Request) {
  const id = requestId(request);
  try {
    await checkDatabase();
    const integrations = integrationStatus();
    const [schema] = await Promise.all([checkSchema(id)]);
    const ready = integrations.issues === 0 && schema === 'ok' && missingEnv().length === 0;
    if (!ready) return withRequestId(new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } }), id);
    return withRequestId(new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } }), id);
  } catch (error) {
    logger.error('readiness_check_failed', error, { requestId: id });
    return withRequestId(new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } }), id);
  }
}
