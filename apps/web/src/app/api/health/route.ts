import { NextResponse } from 'next/server';
import { createSupabase, supabaseConfig } from '@/lib/supabase/server';
import { emailProvider, smsProvider } from '@/lib/notifications/providers';
import { getPaymentProvider } from '@/lib/payments';
import { logger, requestId, withRequestId } from '@/lib/observability';

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
  return { payment, sms, email, auth, issues: [payment, sms, email, auth].filter((state) => state === 'misconfigured').length };
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
    const status = integrations.issues === 0 ? 'ok' : 'degraded';
    return withRequestId(NextResponse.json({ status, service: 'sleek-connect-web', database: 'ok', integrations, checkedAt }), id);
  } catch (error) {
    logger.error('health_check_failed', error, { requestId: id });
    return withRequestId(NextResponse.json({ status: 'degraded', service: 'sleek-connect-web', database: 'unavailable', checkedAt, requestId: id }, { status: 503, headers: { 'Cache-Control': 'no-store' } }), id);
  }
}

/** Readiness probe: verifies the app has its required configuration and can reach Supabase. */
export async function HEAD(request: Request) {
  const id = requestId(request);
  try {
    await checkDatabase();
    const integrations = integrationStatus();
    if (integrations.issues > 0) return withRequestId(new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } }), id);
    return withRequestId(new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } }), id);
  } catch (error) {
    logger.error('readiness_check_failed', error, { requestId: id });
    return withRequestId(new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } }), id);
  }
}
