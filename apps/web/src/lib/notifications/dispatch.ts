import 'server-only';
import { formatPrice } from '@sleek/shared';
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
function storeAlertTarget(event: string) {
  const to = process.env.STORE_ALERT_EMAIL?.trim();
  if (!to) {
    logger.warn('store_alert_skipped', { event, reason: 'STORE_ALERT_EMAIL is not set' });
    return null;
  }
  const provider = emailProvider();
  if (!provider) {
    logger.warn('store_alert_skipped', { event, reason: 'no email provider is set up (EMAIL_PROVIDER, GMAIL_USER, GMAIL_APP_PASSWORD)' });
    return null;
  }
  return { to, provider };
}

/**
 * Tells the store an order was placed, even when the shopper gave no email and nothing is queued for them. Sent right
 * after placing, best effort. Has the details the owner needs to act, but no order link or delivery code.
 */
const alertedOrders = new Set<string>();

export async function alertStoreNewOrder(order: {
  orderNumber: string;
  total: number | null;
  customerName?: string;
  phone?: string;
  area?: string;
  itemCount?: number;
  source: 'web' | 'app';
  payment: string;
}) {
  // The app asks for a payment prompt more than once per order; alert once (per server instance, best effort).
  if (alertedOrders.has(order.orderNumber)) return;
  alertedOrders.add(order.orderNumber);
  const target = storeAlertTarget('order_placed');
  if (!target) return;
  // Whether the database queued an "order received" email for the shopper (it does when they gave an address).
  const admin = createAdminSupabase();
  const { data: row } = await admin.from('orders').select('id').eq('order_number', order.orderNumber).maybeSingle();
  const { count } = row
    ? await admin.from('notifications').select('id', { count: 'exact', head: true }).eq('order_id', row.id).eq('template', 'order_received')
    : { count: 0 };
  const customerEmailed = (count ?? 0) > 0;
  logger.info('order_received_email', { order: order.orderNumber, queued: customerEmailed, reason: customerEmailed ? 'queued for sending' : 'no email address given, or the hourly limit for it was reached' });
  const lines = [
    `Order ${order.orderNumber} was placed on the ${order.source === 'app' ? 'mobile app' : 'website'} and is waiting for payment.`,
    `Total: ${order.total === null ? 'to be confirmed (delivery fee not set)' : formatPrice(order.total)}${order.itemCount ? ` · ${order.itemCount} item${order.itemCount === 1 ? '' : 's'}` : ''}`,
    order.customerName ? `Customer: ${order.customerName}${order.phone ? `, ${order.phone}` : ''}${order.area ? `, ${order.area}` : ''}` : null,
    `Payment: ${order.payment === 'requested' ? 'prompt sent' : order.payment === 'unavailable' ? 'online payment is not switched on, no prompt was sent' : order.payment}`,
    `The customer ${customerEmailed ? 'was sent an "order received" email' : 'was not emailed (no address given, or the limit of three an hour for it was reached)'}.`,
  ].filter(Boolean);
  try {
    const result = await target.provider.send(target.to, { subject: `[Store alert] New order ${order.orderNumber}`, text: lines.join('\n') });
    logger.info('store_alert_sent', { template: 'order_placed', order: order.orderNumber, to: maskRecipient(target.to), provider: target.provider.name, reference: result.reference });
  } catch (cause) {
    logger.error('store_alert_failed', cause, { template: 'order_placed', order: order.orderNumber, to: maskRecipient(target.to) });
  }
}

async function alertStore(n: { template: string; recipient: string; payload: unknown }) {
  const target = storeAlertTarget(n.template);
  if (!target) return;
  const { to, provider } = target;
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
