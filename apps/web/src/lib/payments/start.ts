import 'server-only';
import { randomUUID } from 'node:crypto';
import type { MomoNetwork } from '@sleek/shared';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { getPaymentProvider } from './index';

export type PaymentStart =
  | { kind: 'requested'; testMode: boolean }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'failed'; reason: string };

/**
 * Starts payment for a freshly placed order: records the attempt, then asks the provider to charge the amount the
 * database priced. If the provider can't be reached the attempt is marked failed, which releases the reserved stock.
 */
export async function startOrderPayment(
  order: { token: string; number: string; total: number | null },
  payer: { network: MomoNetwork; wallet: string },
): Promise<PaymentStart> {
  const provider = getPaymentProvider();
  if (!provider) {
    return { kind: 'unavailable', reason: 'Online payment isn’t switched on yet, so no payment prompt was sent.' };
  }
  if (order.total === null) {
    return {
      kind: 'unavailable',
      reason: 'Delivery fees aren’t set yet, so the total is unknown and no payment prompt was sent.',
    };
  }

  const admin = createAdminSupabase();
  const reference = `${order.number}-${randomUUID().slice(0, 8)}`;
  const { data: amount, error } = await admin.rpc('start_payment', {
    p_order_token: order.token,
    p_provider: provider.name,
    p_reference: reference,
  });
  if (error) {
    console.error('start_payment failed', error);
    return { kind: 'failed', reason: 'We couldn’t start the payment. Please try again.' };
  }

  try {
    await provider.requestPayment({ reference, orderNumber: order.number, amountGhs: amount, ...payer });
  } catch (cause) {
    console.error(`${provider.name}: payment request failed`, cause);
    const { error: releaseError } = await admin.rpc('confirm_payment', {
      p_provider: provider.name,
      p_reference: reference,
      p_status: 'failed',
      p_amount_ghs: 0,
      p_event: { error: 'request_failed' },
    });
    if (releaseError) console.error('Could not release the reservation', releaseError);
    return { kind: 'failed', reason: 'We couldn’t send the payment prompt. Please try again.' };
  }

  return { kind: 'requested', testMode: provider.testMode };
}
