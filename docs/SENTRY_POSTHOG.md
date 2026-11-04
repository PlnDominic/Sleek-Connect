# Sentry (errors) and PostHog (visit statistics)

Both are wired into the website and **off until you set their keys**. Nothing else changes while they are off.

- **Sentry** reports every error (server code, browser, failed notifications and payment checks) with the page and the
  steps leading to it, and samples a tenth of page loads for speed.
- **PostHog** counts visits and the shopping funnel: page views, added to bag, checkout submitted, order placed, payment
  confirmed or failed, pay on delivery confirmed, order delivered.

## What is never sent

This store's order link (`/orders/<token>`) is the shopper's proof of ownership of an order, and its forms hold names, phone
numbers and email addresses. Everything passes through `apps/web/src/lib/telemetry/scrub.ts` before it leaves:

- order tokens and order numbers in addresses and messages are replaced; phone numbers and email addresses in messages too;
- query values that could identify a person or order (`order`, `phone`, `email`, `token`, …) are removed;
- cookies, request headers, request bodies, query strings and the signed-in person are never attached to an error;
- **no analytics at all** from the admin console and sign-in callbacks;
- PostHog uses no cookie or stored identifier (`persistence: 'memory'`), records no clicks or typed text (autocapture off),
  no session replay, and respects Do Not Track. The privacy notice says so (Privacy → Visit statistics and error reports).

`tests/unit-telemetry.cjs` checks all of this. If you add an event, send labels and numbers only.

## Setting up Sentry

1. Create a project at sentry.io (platform **Next.js**). Copy its **DSN**.
2. Vercel → Environment Variables (Production and Preview): `NEXT_PUBLIC_SENTRY_DSN` = the DSN.
3. Optional, so errors show your real code instead of minified code: in Sentry create an **organization auth token**, then
   add `SENTRY_AUTH_TOKEN` (Sensitive), `SENTRY_ORG` and `SENTRY_PROJECT` (the slugs) for the **build**. Source maps are
   uploaded during `next build` and removed from the deployment afterwards.
4. Redeploy, then in the admin console open **Settings → Error reporting** and press **Send a server test error** and **Send a browser test
   error**. Each should appear in Sentry → Issues within a minute (open one and check the stack trace shows real file names, which
   means the source maps work). Failures the server logs as errors (a notification that can't be sent, a payment that can't be verified, a page
   that crashes) now also appear in Sentry → Issues within a minute. If nothing has failed yet, Sentry's project setup page
   shows "waiting for first event" until one does.

## Setting up PostHog

1. Create a project at posthog.com. Choose the **US** or **EU** cloud. Copy the **Project API key** (starts with `phc_`).
2. Vercel → `NEXT_PUBLIC_POSTHOG_KEY` = the key; `NEXT_PUBLIC_POSTHOG_REGION` = `eu` only if you chose the EU cloud.
3. Redeploy, browse the store, and check PostHog → Activity for `$pageview` and `added_to_bag`.

PostHog traffic goes through this site at `/ingest` (a rewrite in `next.config.ts`), so the browser never contacts PostHog
directly and the content security policy is unchanged. That rewrite needs `skipTrailingSlashRedirect: true`, which also
stops Next.js redirecting `/page/` to `/page`.

## Good to know

- Both keys are public by design (they are sent to the browser); only `SENTRY_AUTH_TOKEN` is secret.
- Server events (`order_placed`, `payment_confirmed`, `payment_failed`, `cod_confirmed`, `order_delivered`) are sent from the
  server in `lib/analytics.ts`, so they count even when a visitor's browser blocks analytics. They are anonymous and carry
  amounts, counts and labels only.
- Not yet in the mobile app. Its own install needs care with Expo Go, so add it as a separate step.
- If you later want cookies, a returning-visitor count or session replay, add a cookie consent banner first and change the
  PostHog settings in `src/instrumentation-client.ts`.
