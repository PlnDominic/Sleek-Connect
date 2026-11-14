import 'server-only';
import { logger } from '@/lib/observability';

/**
 * Business events recorded on the server, where the outcome is certain (an order was really placed, a payment really
 * confirmed): what PostHog's funnels and revenue figures are built from, whatever a shopper's browser blocks.
 *
 * Events carry numbers and short labels only: never a name, phone number, email address, order token or delivery code.
 * Each is anonymous (`$process_person_profile: false`). Off without NEXT_PUBLIC_POSTHOG_KEY; never throws.
 */

type Properties = Record<string, string | number | boolean | null | undefined>;

const host = () => process.env.POSTHOG_HOST?.replace(/\/$/, '') || `https://${process.env.NEXT_PUBLIC_POSTHOG_REGION === 'eu' ? 'eu' : 'us'}.i.posthog.com`;

/** Sends one event. `subject` groups an event with its siblings (an order number is fine; it is not personal data). */
export async function captureServerEvent(event: string, subject: string, properties: Properties = {}): Promise<void> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  try {
    const response = await fetch(`${host()}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        event,
        distinct_id: subject,
        properties: { ...properties, $process_person_profile: false, source: 'server' },
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) logger.warn('analytics_event_rejected', { event, status: response.status });
  } catch (cause) {
    logger.warn('analytics_event_failed', { event, reason: cause instanceof Error ? cause.message : 'unknown' });
  }
}
