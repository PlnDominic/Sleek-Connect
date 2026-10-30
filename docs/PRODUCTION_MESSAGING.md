# Production Messaging Readiness

Sleek Connect sends customer notifications through the provider adapters in `apps/web/src/lib/notifications/providers.ts`. The database outbox is authoritative: messages are claimed, sent, recorded, and retried without losing the order event.

## Before launch

1. Select one Ghana-capable SMS provider and one transactional email provider.
2. Implement and register each provider adapter using the existing `MessageProvider` interface. Provider API keys must remain server-only environment variables.
3. Set `SMS_PROVIDER` and `EMAIL_PROVIDER` to registered provider names in Vercel Production.
4. Do not use `console` in production. It is intentionally disabled when `VERCEL_ENV=production`.
5. Set sender IDs, verified domains, reply-to addresses, unsubscribe handling, and delivery webhooks in the provider dashboards.
6. Confirm the provider's timeout, retry, delivery-status, and rate-limit behavior.
7. Set `CRON_SECRET` on Vercel and add the same value, plus `SITE_URL`, as GitHub repository secrets; the `Notification dispatch` workflow calls `/api/notifications/dispatch` every five minutes with the bearer token.

## Email through Gmail (Nodemailer)

`EMAIL_PROVIDER=gmail` sends through a Gmail or Google Workspace account with Nodemailer (`lib/notifications/gmail.ts`).

1. In the Google account: turn on 2-Step Verification, then Security → App passwords, and create one for "Sleek Connect".
2. In Vercel (Production and Preview): `EMAIL_PROVIDER=gmail`, `GMAIL_USER=<the address>`, `GMAIL_APP_PASSWORD=<the 16 characters>`.
   Optional: `EMAIL_FROM_NAME`, `EMAIL_REPLY_TO`, and `STORE_ALERT_EMAIL` (a copy of every order and vendor event, for the
   store's own inbox; delivery codes and order links are left out).
3. Locally, put the same values in `apps/web/.env.local` and run `npm run email:test -- you@example.com`. It signs in to
   Gmail and sends one message, and says what is wrong if Gmail refuses.
4. `/api/health` reports email as `configured`, or `misconfigured` if the address or App Password is missing.

Limits: about 500 messages a day on a personal Gmail account (about 2,000 on Workspace), and Gmail always shows the signed-in
address as the sender. For a busy store, move to a transactional email service later by adding another provider next to
`gmail`; nothing else changes. Customer emails go to the optional email typed at checkout, or else the signed-in account's email
(Google sign-in); everyone else is reached by SMS.

## How the emails look

Every email is sent as a designed HTML message plus a plain-text copy (`lib/notifications/email-html.ts`, `renderEmail` in
`templates.ts`), in the manner of Apple's own mail: the system font, one calm column on a plain page, a large heading,
the message, the key facts as rows between hairlines, the delivery code in a quiet panel when the rider will ask for it, and
one rounded button in the store's teal. It follows the reader's light or dark setting and uses only tables and inline styles,
with no images, so it renders the same in Gmail, Outlook and phone mail apps. Store alerts carry a small "Store alert" label
and never show a delivery code or an order link. Links use `SITE_URL`: set it to your public address (for example
`https://sleekconnectstore.vercel.app`) so buttons open the right site.

## Checking emails in the logs

Every send is logged as one JSON line (Vercel → project → Logs, or the terminal in development). Recipients are masked
(`k***@example.com`, `***567`), and no message text, delivery code or order link is logged.

| Event | Meaning |
| --- | --- |
| `order_placed` | An order was placed on the website (`emailGiven` says whether an address was typed). An "order received" email is queued by the database and sent straight away. |
| `notifications_claimed` | The sender picked up queued messages (`count`, and how many are email, SMS, push). |
| `gmail_response` | Gmail's answer for one email: `accepted`/`rejected` counts, `messageId` and the SMTP `response` (for example `250 2.0.0 OK`). This is the proof Gmail took it. |
| `notification_sent` | A message was handed to its provider and recorded as sent (`template`, `channel`, `to`, `reference`). |
| `notification_failed` | The provider refused or timed out (`willRetry` is true for the first four attempts). |
| `notification_not_sent` | Nothing was sent: no provider is set up, or the template is unknown. |
| `order_received_email` | Right after an order is placed: whether the database queued an "order received" email for the shopper (`queued`) and, if not, why. |
| `store_alert_sent` / `store_alert_failed` | The copy to `STORE_ALERT_EMAIL`: one `New order SC-… ` alert for every order placed (whether or not the shopper gave an email), plus a copy of each customer message. |
| `store_alert_skipped` | No alert was sent because `STORE_ALERT_EMAIL` is not set, or no email provider is set up (`reason` says which). |
| `notifications_dispatched` | The end-of-run totals (`sent`, `failed`, `skipped`). |

To follow one email: find `order_placed`, then `notification_sent` with `template: "order_received"` and `channel: "email"`,
and the `gmail_response` just before it. In development (`EMAIL_PROVIDER=console`) the whole message is also printed.

## Required test matrix

Use a real but controlled customer account and a staff-owned phone/email address. Confirm that no sensitive delivery code is printed in public logs.

- Order received (at checkout) and order confirmation (once paid): the email is sent once, and the logs show `gmail_response` and `notification_sent` for it.
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
