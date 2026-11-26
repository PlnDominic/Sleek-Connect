import { getStaffSession } from '@/lib/admin/session';
import { toCsv } from '@/lib/admin/csv';

function validDate(value: string | null, fallback: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

export async function GET(request: Request) {
  const session = await getStaffSession();
  if (session.state !== 'ready') return new Response('Staff sign-in required.', { status: 401 });

  const url = new URL(request.url);
  const today = new Date().toISOString().slice(0, 10);
  const requestedFrom = validDate(url.searchParams.get('from'), today);
  const requestedTo = validDate(url.searchParams.get('to'), today);
  const from = requestedFrom <= requestedTo ? requestedFrom : requestedTo;
  const to = requestedFrom <= requestedTo ? requestedTo : requestedFrom;
  const after = `${from}T00:00:00.000Z`;
  const before = `${to}T23:59:59.999Z`;
  const db = session.supabase;

  const [paymentsResult, returnsResult] = await Promise.all([
    db
      .from('payments')
      .select('provider, provider_reference, amount_ghs, status, created_at, orders(order_number, customer_name)')
      .gte('created_at', after)
      .lte('created_at', before)
      .order('created_at', { ascending: true })
      .limit(10000),
    db
      .from('return_requests')
      .select('case_number, status, refund_amount_ghs, refund_reference, refunded_at, created_at, orders(order_number, customer_name)')
      .gte('created_at', after)
      .lte('created_at', before)
      .order('created_at', { ascending: true })
      .limit(10000),
  ]);
  if (paymentsResult.error || returnsResult.error) return new Response('Could not export finance data.', { status: 500 });

  const rows: (string | number | boolean | null)[][] = [
    ['record_type', 'created_at', 'order_or_return', 'customer', 'provider', 'provider_or_refund_reference', 'amount_ghs', 'status', 'refunded_at'],
    ...(paymentsResult.data ?? []).map((payment) => [
      'payment',
      payment.created_at,
      payment.orders?.order_number ?? '',
      payment.orders?.customer_name ?? '',
      payment.provider,
      payment.provider_reference,
      payment.amount_ghs,
      payment.status,
      '',
    ]),
    ...(returnsResult.data ?? []).map((item) => [
      'return_refund',
      item.created_at,
      item.orders?.order_number ?? item.case_number,
      item.orders?.customer_name ?? '',
      '',
      item.refund_reference ?? '',
      item.refund_amount_ghs,
      item.status,
      item.refunded_at ?? '',
    ]),
  ];

  return new Response(toCsv(rows), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="sleek-connect-finance-${from}-to-${to}.csv"`,
    },
  });
}
