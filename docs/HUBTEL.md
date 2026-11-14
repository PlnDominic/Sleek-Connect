# Hubtel payments (Mobile Money and cards)

`PAYMENT_PROVIDER=hubtel` sends shoppers to Hubtel's secure **Online Checkout** page, where they pay with MTN MoMo, Telecel
Cash, AT Money or a Visa/Mastercard card. The website and the app both use it. We never see a PIN or card number.

## How a payment goes

1. The shopper places the order (`place_order`: the database prices it and holds the stock for a few minutes).
2. We ask Hubtel to create a checkout for exactly that amount (`POST https://payproxyapi.hubtel.com/items/initiate`) and send
   the shopper to the address it returns. On the website this is automatic; in the app it opens in the in-app browser.
   The Mobile Money number typed at checkout is pre-filled on Hubtel's page.
3. Hubtel posts the result to `https://<your site>/api/payments/webhook?token=…`. The address carries a secret that only
   Hubtel was given (derived from `PAYMENT_WEBHOOK_SECRET`), because Hubtel's callback has no signature.
4. Before the order is marked paid we **ask Hubtel's Transaction Status API** whether it really holds the money, and use
   Hubtel's amount, not the callback's. Only then does `confirm_payment` run (stock becomes a sale, the customer is told).
5. The shopper lands back on their order page. A shopper who closes the page or cancels can use **Pay now** on the order
   page (or in the app) before the hold runs out.

## Setting it up

1. **Hubtel:** have your Hubtel merchant account approved for **Online Checkout**. Note the three values below
   (Hubtel dashboard → your integration / developer settings, or ask your Hubtel contact).
2. **Vercel → Settings → Environment Variables (Production), mark them Sensitive, then redeploy:**

   | Variable | Value |
   | --- | --- |
   | `PAYMENT_PROVIDER` | `hubtel` |
   | `HUBTEL_API_ID` | the API ID |
   | `HUBTEL_API_KEY` | the API key |
   | `HUBTEL_MERCHANT_ACCOUNT` | your merchant account number (the POS Sales ID) |
   | `PAYMENT_WEBHOOK_SECRET` | any long random string, e.g. `openssl rand -hex 24` |
   | `SITE_URL` | `https://sleekconnectstore.vercel.app` (Hubtel's callback and return links are built from it, so it must be your public address) |
   | `PAYMENT_PROVIDER_NAME` | `Hubtel` (shown in the privacy notice) |

   Optional: `HUBTEL_CARD=off` hides card payment.
3. **Whitelist your server for the status check.** Hubtel's Transaction Status API only answers requests from IP addresses
   Hubtel has whitelisted: ask Hubtel support to whitelist your server's outgoing IP address. Vercel's normal functions do
   not have a fixed IP address, so use **Vercel Static IPs** (a paid add-on) or route the status call through a small
   proxy with a fixed IP. Until the IP is whitelisted every callback fails its status check (the log shows
   `payment_provider_verification_failed` with HTTP 403) and **no order is marked paid**.
   If you have to go live before that, set `HUBTEL_SKIP_STATUS_CHECK=true`: callbacks are then accepted on the secret in the
   callback address, our unguessable payment reference and an exact amount match. That is weaker; remove it once the IP is
   whitelisted.
4. **Try it** with a small real payment (a cheap product, or set a low price): place the order, pay, and check that the
   order becomes "Confirmed". In Vercel → Logs you should see `payment_webhook_recorded`.

## If something doesn't work

| Log message | Meaning |
| --- | --- |
| `Hubtel did not create the checkout (HTTP 401…)` | wrong `HUBTEL_API_ID` / `HUBTEL_API_KEY`, or the account isn't approved for Online Checkout |
| `payment_webhook_signature_rejected` | the callback arrived without the right `?token=` (is `PAYMENT_WEBHOOK_SECRET` the same value that was set when the order was placed?) |
| `payment_provider_verification_failed` … 403 | Hubtel hasn't whitelisted the server IP for the status check |
| order stays "waiting for payment" after paying | the callback never arrived (check `SITE_URL`) or the status check isn't passing |

## For developers

- `apps/web/src/lib/payments/hubtel.ts` is the provider; `index.ts` selects it. `tests/unit-hubtel.cjs` runs it against a
  faked Hubtel (request shape, callback parsing, secret check, status check).
- Written from Hubtel's published Online Checkout reference. Its details that could not be re-checked while building this
  (the exact status-check path, the checkout response field name, the callback's status strings) are handled defensively
  and are the first things to compare with Hubtel's current docs if a live payment misbehaves: `HUBTEL_INITIATE_URL` and
  `HUBTEL_STATUS_URL` override the addresses.
- `GET /api/payments/options` tells the app whether card payment and the hosted page are available.
