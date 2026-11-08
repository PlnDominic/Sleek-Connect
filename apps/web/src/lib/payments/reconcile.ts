import 'server-only';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { logger } from '@/lib/observability';
import type { Json } from '@/lib/supabase/database.types';
import { getPaymentProvider } from './index';

/**
 * Settles payments whose notification never arrived. A callback can be lost (or fail Hubtel's status check once), and then the order
 * would sit unpaid until it expires. This asks the provider about every payment still pending (or expired unanswered) after a couple of minutes, for three days, and
 * records the ones it says are paid, exactly as the webhook would (`confirm_payment` ignores anything already settled).
 * Only a final "paid" answer is acted on; an unpaid or unknown answer leaves the payment alone.
 */
export async function reconcilePendingPayments(limit = 25): Promise<{ checked: number; confirmed: number }> {
  const provider = getPaymentProvider();
  // The test provider trusts whatever it is told, so it must never be asked to "confirm" a payment on its own.
  if (!provider || provider.name !== 'hubtel') return { checked: 0, confirmed: 0 };
  const admin = createAdminSupabase();
  const now = Date.now();
  const { data, error } = await admin
    .from('payments')
    .select('provider_reference')
    .eq('provider', provider.name)
    // "expired" too: when an order times out its unanswered payment is marked expired, and money can still arrive afterwards
    // (confirm_payment then records it and flags the cancelled order for review).
    .in('status', ['pending', 'expired'])
    .lt('created_at', new Date(now - 2 * 60_000).toISOString())
    .gt('created_at', new Date(now - 3 * 24 * 60 * 60_000).toISOString())
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) {
    logger.error('payment_reconcile_lookup_failed', error, {});
    return { checked: 0, confirmed: 0 };
  }
  let confirmed = 0;
  for (const { provider_reference: reference } of data ?? []) {
    try {
      const verified = await provider.verify({ reference, status: 'succeeded', amountGhs: 0, event: {} });
      if (!verified || verified.status !== 'succeeded') continue;
      const { error: confirmError } = await admin.rpc('confirm_payment', {
        p_provider: provider.name,
        p_reference: verified.reference,
        p_status: 'succeeded',
        p_amount_ghs: verified.amountGhs,
        p_event: verified.event as Json,
      });
      if (confirmError) logger.error('payment_reconcile_confirm_failed', confirmError, { reference });
      else confirmed += 1;
    } catch (cause) {
      logger.warn('payment_reconcile_check_failed', { reference, reason: cause instanceof Error ? cause.message : 'unknown' });
    }
  }
  return { checked: data?.length ?? 0, confirmed };
}
