import 'server-only';
import { randomUUID } from 'node:crypto';
import type { MomoNetwork } from '@sleek/shared';
import { createUserSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import type { OnlinePaymentStart } from './start';
import { getPaymentProvider } from './index';

/** Webhook references that start with this belong to a vendor's yearly subscription, not to an order. */
export const subscriptionReferencePrefix = 'SUB-';

/**
 * Starts a vendor's yearly subscription payment. The signed-in vendor records the attempt (the database sets the
 * amount from the fee in settings), then the provider is asked to charge it. A verified notification at the payment
 * webhook is what opens or renews the store, through `confirm_subscription_payment`.
 */
export async function startSubscriptionPayment(payer: { network: MomoNetwork; wallet: string }): Promise<OnlinePaymentStart> {
  const provider = getPaymentProvider();
  if (!provider) return { kind: 'unavailable', reason: 'Online payment isn’t switched on yet. Pay as shown below and we will record it.' };

  const reference = `${subscriptionReferencePrefix}${randomUUID().slice(0, 12).toUpperCase()}`;
  const supabase = await createUserSupabase();
  const { data: amount, error } = await supabase.rpc('start_vendor_subscription_payment', {
    p_provider: provider.name,
    p_reference: reference,
  });
  if (error) {
    if (error.code === '42501' || error.code === '22023') return { kind: 'failed', reason: error.message };
    console.error('start_vendor_subscription_payment failed', error);
    return { kind: 'failed', reason: 'We couldn’t start the payment. Please try again.' };
  }

  try {
    await provider.requestPayment({ reference, orderNumber: 'Store subscription', amountGhs: amount, ...payer });
  } catch (cause) {
    console.error(`${provider.name}: subscription payment request failed`, cause);
    const { error: closeError } = await createAdminSupabase().rpc('confirm_subscription_payment', {
      p_provider: provider.name,
      p_reference: reference,
      p_status: 'failed',
      p_amount_ghs: 0,
      p_event: { error: 'request_failed' },
    });
    if (closeError) console.error('Could not close the failed subscription payment', closeError);
    return { kind: 'failed', reason: 'We couldn’t send the payment prompt. Please try again.' };
  }
  return { kind: 'requested', testMode: provider.testMode };
}
