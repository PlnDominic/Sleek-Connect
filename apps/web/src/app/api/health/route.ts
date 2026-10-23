import { NextResponse } from 'next/server';
import { createSupabase, supabaseConfig } from '@/lib/supabase/server';
import { logger, requestId, withRequestId } from '@/lib/observability';

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
    return withRequestId(NextResponse.json({ status: 'ok', service: 'sleek-connect-web', database: 'ok', checkedAt }), id);
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
    return withRequestId(new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } }), id);
  } catch (error) {
    logger.error('readiness_check_failed', error, { requestId: id });
    return withRequestId(new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } }), id);
  }
}
