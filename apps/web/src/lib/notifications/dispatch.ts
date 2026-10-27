import 'server-only';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { emailProvider, pushProvider, smsProvider, toInternationalPhone, UnregisteredDeviceError } from './providers';
import { renderMessage, type NotificationPayload, type VendorPayload } from './templates';

/**
 * Sends queued customer messages. Called right after anything that changes an order's status, and on a schedule
 * to retry failures. Messages for a channel with no provider are recorded as not sent, with the reason.
 */
export async function dispatchNotifications(limit = 20): Promise<{ sent: number; failed: number; skipped: number }> {
  const counts = { sent: 0, failed: 0, skipped: 0 };
  if (!process.env.SUPABASE_SECRET_KEY) {
    console.warn('SUPABASE_SECRET_KEY is not set; customer messages stay queued.');
    return counts;
  }
  const admin = createAdminSupabase();
  const { data: due, error } = await admin.rpc('claim_notifications', { p_limit: limit });
  if (error) {
    console.error('claim_notifications failed', error);
    return counts;
  }

  for (const n of due) {
    const finish = (outcome: 'sent' | 'failed' | 'not_sent', extra: { provider?: string; reference?: string; error?: string } = {}) =>
      admin.rpc('finish_notification', {
        p_id: n.id,
        p_outcome: outcome,
        p_provider: extra.provider,
        p_reference: extra.reference,
        p_error: extra.error,
      });

    const message = renderMessage(n.template, n.payload as unknown as NotificationPayload | VendorPayload);
    const provider = n.channel === 'sms' ? smsProvider() : n.channel === 'push' ? pushProvider() : emailProvider();
    if (!message || !provider) {
      counts.skipped++;
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
      await finish('sent', { provider: provider.name, reference: result.reference });
    } catch (cause) {
      if (cause instanceof UnregisteredDeviceError) {
        // The app was removed from that phone: forget it rather than retrying.
        counts.skipped++;
        await admin.rpc('forget_push_device', { p_token: n.recipient });
        await finish('not_sent', { provider: provider.name, error: cause.message });
        continue;
      }
      counts.failed++;
      await finish('failed', { provider: provider.name, error: cause instanceof Error ? cause.message : String(cause) });
    }
  }
  return counts;
}
