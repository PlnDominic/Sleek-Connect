import { getStaffSession } from '@/lib/admin/session';
import { toCsv } from '@/lib/admin/csv';

type NotificationStatus = 'all' | 'queued' | 'sending' | 'sent' | 'failed' | 'not_sent';
const statuses: NotificationStatus[] = ['all', 'queued', 'sending', 'sent', 'failed', 'not_sent'];

export async function GET(request: Request) {
  const session = await getStaffSession();
  if (session.state !== 'ready') return new Response('Staff sign-in required.', { status: 401 });
  const url = new URL(request.url);
  const requested = url.searchParams.get('status') ?? 'all';
  const status: NotificationStatus = statuses.includes(requested as NotificationStatus) ? (requested as NotificationStatus) : 'all';
  let query = session.supabase
    .from('notifications')
    .select('template, channel, recipient, status, attempts, next_attempt_at, provider, provider_reference, last_error, created_at, sent_at, orders(order_number)')
    .order('created_at', { ascending: true })
    .limit(10000);
  if (status !== 'all') query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return new Response('Could not export notifications.', { status: 500 });
  const rows: (string | number | boolean | null)[][] = [
    ['created_at', 'order_number', 'template', 'channel', 'recipient', 'status', 'attempts', 'next_attempt_at', 'provider', 'provider_reference', 'last_error', 'sent_at'],
    ...(data ?? []).map((item) => [
      item.created_at,
      item.orders?.order_number ?? '',
      item.template,
      item.channel,
      item.recipient,
      item.status,
      item.attempts,
      item.next_attempt_at,
      item.provider,
      item.provider_reference,
      item.last_error,
      item.sent_at,
    ]),
  ];
  const day = new Date().toISOString().slice(0, 10);
  return new Response(toCsv(rows), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="sleek-connect-notifications-${status}-${day}.csv"`,
    },
  });
}
