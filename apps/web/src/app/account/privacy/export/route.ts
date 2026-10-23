import { NextResponse } from 'next/server';
import { createUserSupabase } from '@/lib/supabase/server';

/** GET /account/privacy/export: everything the store holds about the signed-in shopper, as a JSON download (FR-057). */
export async function GET() {
  const supabase = await createUserSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in to download your data.' }, { status: 401 });

  const { data, error } = await supabase.rpc('export_my_data');
  if (error) {
    console.error('export_my_data failed', error);
    return NextResponse.json({ error: 'We couldn’t prepare your data. Please try again.' }, { status: 500 });
  }
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="sleek-connect-store-data-${day}.json"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
