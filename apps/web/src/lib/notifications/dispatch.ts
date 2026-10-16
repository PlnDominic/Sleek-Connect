import 'server-only';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { emailProvider, smsProvider, toInternationalPhone } from './providers';
import { renderMessage, type NotificationPayload } from './templates';

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

    const message = renderMessage(n.template, n.payload as unknown as NotificationPayload);
    const provider = n.channel === 'sms' ? smsProvider() : emailProvider();
    if (!message || !provider) {
      counts.skipped++;
      await finish('not_sent', {
        error: message ? `No ${n.channel === 'sms' ? 'SMS' : 'email'} provider is set up` : `Unknown template ${n.template}`,
      });
      continue;
    }
    try {
      const to = n.channel === 'sms' ? toInternationalPhone(n.recipient) : n.recipient;
      const result = await provider.send(to, message);
      counts.sent++;
      await finish('sent', { provider: provider.name, reference: result.reference });
    } catch (cause) {
      counts.failed++;
      await finish('failed', { provider: provider.name, error: cause instanceof Error ? cause.message : String(cause) });
    }
  }
  return counts;
}
