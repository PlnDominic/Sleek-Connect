import { timingSafeEqual } from 'node:crypto';
import { dispatchNotifications } from '@/lib/notifications/dispatch';
import { reconcilePendingPayments } from '@/lib/payments/reconcile';
import { logger, requestId, withRequestId } from '@/lib/observability';

/** Constant-time comparison, so the response time doesn't reveal how much of the secret was right. */
function sameSecret(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Settles payments whose callback was lost, then retries queued customer messages. Call it on a schedule with Authorization: Bearer <CRON_SECRET>. */
export async function GET(request: Request) {
  const id = requestId(request);
  const secret = process.env.CRON_SECRET;
  if (!secret || !sameSecret(request.headers.get('authorization') ?? '', `Bearer ${secret}`)) {
    logger.warn('notification_dispatch_unauthorized', { requestId: id });
    return withRequestId(Response.json({ error: 'Not allowed.', requestId: id }, { status: 401 }), id);
  }
  try {
    // First settle payments whose callback never arrived, so their confirmation messages go out in this same run.
    const payments = await reconcilePendingPayments();
    const result = await dispatchNotifications(50);
    logger.info('notification_dispatch_completed', { requestId: id, result: JSON.stringify(result), payments: JSON.stringify(payments) });
    return withRequestId(Response.json({ ...result, payments }), id);
  } catch (error) {
    logger.error('notification_dispatch_failed', error, { requestId: id });
    return withRequestId(Response.json({ error: 'Notification dispatch failed.', requestId: id }, { status: 500 }), id);
  }
}
