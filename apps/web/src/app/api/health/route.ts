import { NextResponse } from 'next/server';
import { createSupabase, supabaseConfig } from '@/lib/supabase/server';

export async function GET() {
  const checkedAt = new Date().toISOString();

  try {
    supabaseConfig();
    const supabase = createSupabase();
    const { error } = await supabase.from('store_settings').select('id').limit(1);

    if (error) {
      console.error('Health check database failure', { code: error.code, message: error.message });
      return NextResponse.json(
        { status: 'degraded', service: 'sleek-connect-web', database: 'unavailable', checkedAt },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return NextResponse.json(
      { status: 'ok', service: 'sleek-connect-web', database: 'ok', checkedAt },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Health check configuration failure', error);
    return NextResponse.json(
      { status: 'unhealthy', service: 'sleek-connect-web', database: 'unconfigured', checkedAt },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
