# Production Messaging Readiness

Sleek Connect sends customer notifications through the provider adapters in `apps/web/src/lib/notifications/providers.ts`. The database outbox is authoritative: messages are claimed, sent, recorded, and retried without losing the order event.

## Before launch

1. Select one Ghana-capable SMS provider and one transactional email provider.
2. Implement and register each provider adapter using the existing `MessageProvider` interface. Provider API keys must remain server-only environment variables.
3. Set `SMS_PROVIDER` and `EMAIL_PROVIDER` to registered provider names in Vercel Production.
4. Do not use `console` in production. It is intentionally disabled when `VERCEL_ENV=production`.
5. Set sender IDs, verified domains, reply-to addresses, unsubscribe handling, and delivery webhooks in the provider dashboards.
6. Confirm the provider's timeout, retry, delivery-status, and rate-limit behavior.
7. Set `CRON_SECRET`; Vercel Cron calls `/api/notifications/dispatch` every five minutes with the bearer token.

## Required test matrix

Use a real but controlled customer account and a staff-owned phone/email address. Confirm that no sensitive delivery code is printed in public logs.

- Order confirmation: SMS and email are sent once.
- Payment failure: the customer receives the failure message and stock is released.
- Packing, dispatch, delivered, failed delivery, cancellation, return, refund, and support reply messages are delivered.
- Provider timeout: the notification is marked `failed` and remains eligible for retry.
- Provider disabled or misconfigured: the notification is marked `not_sent`, the order remains intact, and `/api/health` reports the integration as `misconfigured`.
- Duplicate webhook: the underlying order event and customer message are not duplicated.
- Unsubscribe or invalid recipient: the provider response is recorded and staff can see the failure reason.
- Cron outage: queued messages remain in the outbox and are drained after the dispatcher recovers.

## Monitoring

Check `/api/health` externally at least every five minutes. Its `integrations` object reports `payment`, `sms`, and `email` as `configured`, `disabled`, or `misconfigured`. Treat a `misconfigured` value as a launch-blocking incident. Review the admin Notifications queue daily for `failed`, `queued`, and `not_sent` records.

## Secret rotation

Rotate provider keys through Vercel environment variables, redeploy, and send a controlled test message. Never paste provider keys into the repository, support tickets, or chat. Keep the previous key active only long enough to complete the cutover and then revoke it at the provider.
