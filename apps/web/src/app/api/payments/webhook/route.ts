import { getPaymentProvider, WebhookSignatureError } from '@/lib/payments';
import { createAdminSupabase } from '@/lib/supabase/admin';
import type { Json } from '@/lib/supabase/database.types';

/**
 * Payment provider notifications. An order is marked paid only after the notification's signature checks out and the
 * provider confirms the outcome; `confirm_payment` then checks the amount and is safe to call repeatedly.
 */
export async function POST(request: Request) {
  const provider = getPaymentProvider();
  if (!provider) return Response.json({ error: 'Online payment is switched off.' }, { status: 503 });

  const rawBody = await request.text();
  let notified;
  try {
    notified = await provider.readWebhook(rawBody, request.headers);
  } catch (error) {
    if (error instanceof WebhookSignatureError) return Response.json({ error: error.message }, { status: 401 });
    return Response.json({ error: 'Unreadable notification.' }, { status: 400 });
  }
  // Not a final outcome (for example "prompt delivered"): acknowledge so the provider stops retrying.
  if (!notified) return Response.json({ received: true });

  const verified = await provider.verify(notified);
  if (!verified) return Response.json({ error: 'The provider has no final outcome yet.' }, { status: 409 });

  const { data, error } = await createAdminSupabase()
    .rpc('confirm_payment', {
      p_provider: provider.name,
      p_reference: verified.reference,
      p_status: verified.status,
      p_amount_ghs: verified.amountGhs,
      p_event: verified.event as Json,
    })
    .single();

  if (error) {
    // 22023: a payment we never started. Retrying won't help, so don't ask the provider to.
    if (error.code === '22023') return Response.json({ error: error.message }, { status: 422 });
    console.error('confirm_payment failed', error);
    return Response.json({ error: 'Could not record the payment.' }, { status: 500 });
  }

  return Response.json({ received: true, orderStatus: data.order_status, paymentStatus: data.payment_status });
}
