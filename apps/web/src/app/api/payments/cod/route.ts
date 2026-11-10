import { withRequestId, requestId } from '@/lib/observability';

/**
 * Pay on delivery is switched off, so there is nothing to announce. This used to send the store an alert for any pending pay-on-delivery
 * order whose secret link the caller held; it now only tells old app builds that the feature has ended.
 */
export async function POST(request: Request) {
  const id = requestId(request);
  return withRequestId(Response.json({ ok: false, error: 'Pay on delivery is no longer available.', requestId: id }, { status: 410 }), id);
}
