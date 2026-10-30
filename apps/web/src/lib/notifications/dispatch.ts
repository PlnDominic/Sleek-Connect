import 'server-only';
import { logger } from '@/lib/observability';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { emailProvider, pushProvider, smsProvider, toInternationalPhone, UnregisteredDeviceError } from './providers';
import { maskRecipient } from './mask';
import { renderMessage, type NotificationPayload, type VendorPayload } from './templates';

/**
 * A copy of what happened, for the store's own inbox (STORE_ALERT_EMAIL). Every customer order or vendor event queues one
 * SMS row, so alerting from those rows reaches the store even for shoppers who gave no email. It is sent once, on the
 * first attempt, and never retried, so a failed alert can't hold up or duplicate the customer's message. The delivery
 * code and the order link are left out: they are the shopper's proof of delivery and must not sit in an inbox.
 */
async function alertStore(n: { template: string; recipient: string; payload: unknown }) {
  const to = process.env.STORE_ALERT_EMAIL?.trim();
  const provider = to ? emailProvider() : null;
  if (!to || !provider) return;
  const payload = { ...(n.payload as Record<string, unknown>), delivery_code: '(hidden)', order_token: undefined };
  const message = renderMessage(n.template, payload as unknown as NotificationPayload | VendorPayload);
  if (!message) return;
  try {
    const result = await provider.send(to, {
      subject: `[Store alert] ${message.subject}`,
      text: `${message.text}\n\nSent to: ${n.recipient}\nTemplate: ${n.template}`,
    });
    logger.info('store_alert_sent', { template: n.template, to: maskRecipient(to), provider: provider.name, reference: result.reference });
  } catch (cause) {
    logger.error('store_alert_failed', cause, { template: n.template, to: maskRecipient(to) });
  }
}

/**
 * Sends queued customer messages. Called right after anything that changes an order's status, and on a schedule
 * to retry failures. Messages for a channel with no provider are recorded as not sent, with the reason.
 */
export async function dispatchNotifications(limit = 20): Promise<{ sent: number; failed: number; skipped: number }> {
  const counts = { sent: 0, failed: 0, skipped: 0 };
  if (!process.env.SUPABASE_SECRET_KEY) {
    logger.warn('notifications_not_dispatched', { reason: 'SUPABASE_SECRET_KEY is not set, so messages stay queued' });
    return counts;
  }
  const admin = createAdminSupabase();
  const { data: due, error } = await admin.rpc('claim_notifications', { p_limit: limit });
  if (error) {
    logger.error('notifications_claim_failed', error);
    return counts;
  }

  const emails = due.filter((n) => n.channel === 'email').length;
  logger.info('notifications_claimed', { count: due.length, email: emails, sms: due.filter((n) => n.channel === 'sms').length, push: due.length - emails - due.filter((n) => n.channel === 'sms').length });

  for (const n of due) {
    const about = { id: n.id, template: n.template, channel: n.channel, to: maskRecipient(n.recipient), attempt: n.attempts };
    const finish = (outcome: 'sent' | 'failed' | 'not_sent', extra: { provider?: string; reference?: string; error?: string } = {}) =>
      admin.rpc('finish_notification', {
        p_id: n.id,
        p_outcome: outcome,
        p_provider: extra.provider,
        p_reference: extra.reference,
        p_error: extra.error,
      });

    if (n.attempts === 1 && (n.channel === 'sms' || (n.channel === 'email' && n.template === 'order_received'))) await alertStore(n);

    const message = renderMessage(n.template, n.payload as unknown as NotificationPayload | VendorPayload);
    const provider = n.channel === 'sms' ? smsProvider() : n.channel === 'push' ? pushProvider() : emailProvider();
    if (!message || !provider) {
      counts.skipped++;
      const why = message ? `No ${n.channel} provider is set up` : `Unknown template ${n.template}`;
      logger.warn('notification_not_sent', { ...about, reason: why });
      await finish('not_sent', {
        error: message ? `No ${n.channel === 'sms' ? 'SMS' : n.channel === 'push' ? 'push' : 'email'} provider is set up` : `Unknown template ${n.template}`,
      });
      continue;
    }
    try {
      const to = n.channel === 'sms' ? toInternationalPhone(n.recipient) : n.recipient;
      const payload = n.payload as { order_token?: string };
      const result = await provider.send(to, message, n.channel === 'push' ? { data: { orderToken: payload.order_token ?? '' } } : undefined);
      counts.sent++;
      logger.info('notification_sent', { ...about, provider: provider.name, reference: result.reference });
      await finish('sent', { provider: provider.name, reference: result.reference });
    } catch (cause) {
      if (cause instanceof UnregisteredDeviceError) {
        // The app was removed from that phone: forget it rather than retrying.
        counts.skipped++;
        logger.warn('notification_not_sent', { ...about, provider: provider.name, reason: 'the phone no longer has the app' });
        await admin.rpc('forget_push_device', { p_token: n.recipient });
        await finish('not_sent', { provider: provider.name, error: cause.message });
        continue;
      }
      counts.failed++;
      logger.error('notification_failed', cause, { ...about, provider: provider.name, willRetry: n.attempts < 5 });
      await finish('failed', { provider: provider.name, error: cause instanceof Error ? cause.message : String(cause) });
    }
  }
  logger.info('notifications_dispatched', { ...counts });
  return counts;
}
