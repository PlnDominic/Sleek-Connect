import { dispatchNotifications } from '@/lib/notifications/dispatch';

/**
 * Retries queued customer messages. Call it on a schedule (e.g. Vercel Cron) with
 * `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Not allowed.' }, { status: 401 });
  }
  return Response.json(await dispatchNotifications(50));
}
