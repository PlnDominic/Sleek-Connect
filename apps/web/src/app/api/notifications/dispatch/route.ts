import { dispatchNotifications } from '@/lib/notifications/dispatch';
import { logger, requestId, withRequestId } from '@/lib/observability';

/** Retries queued customer messages. Call it on a schedule with Authorization: Bearer <CRON_SECRET>. */
export async function GET(request: Request) {
  const id = requestId(request);
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    logger.warn('notification_dispatch_unauthorized', { requestId: id });
    return withRequestId(Response.json({ error: 'Not allowed.', requestId: id }, { status: 401 }), id);
  }
  try {
    const result = await dispatchNotifications(50);
    logger.info('notification_dispatch_completed', { requestId: id, result: JSON.stringify(result) });
    return withRequestId(Response.json(result), id);
  } catch (error) {
    logger.error('notification_dispatch_failed', error, { requestId: id });
    return withRequestId(Response.json({ error: 'Notification dispatch failed.', requestId: id }, { status: 500 }), id);
  }
}
