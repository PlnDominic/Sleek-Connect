# Launch sign-off: features 16–20

## 16. Authentication and redirect configuration

In Supabase Authentication, enable only the providers the store is prepared to support. Add the exact production URL and `https://<production-host>/auth/callback` to the allowed Site URL and Redirect URLs. Keep localhost URLs limited to the development project. Configure the Google OAuth consent screen with the verified store domain and privacy URL. Confirm that shopper sign-in records the adult/terms consent, while staff sign-in does not silently create shopper consent.

The callback keeps redirects on the same origin and rejects malformed `next` values. `/api/health` reports the `auth` integration as `configured` or `misconfigured` in Vercel production when `SITE_URL` is missing or points at localhost.

## 17. Legal and customer-rights review

Before launch, a Ghana-qualified reviewer must approve `/terms` and `/privacy`. Replace any bracketed business details, registration details, Data Protection Commission details, contact address, and retention wording in the pages. Confirm the displayed `legalUpdated` date is the date approved. Test the footer links, sign-in consent links, account data export, and account deletion flow on mobile and desktop.

Do not publish the store until the reviewer has confirmed age/eligibility wording, payment terms, delivery terms, returns, refunds, privacy rights, marketing consent, and complaint contact details.

## 18. Product and safety compliance

Every published product must pass the database `product_publish_problems` validator. For beauty products, confirm ingredients, warnings, country of origin, period-after-opening information where relevant, and the FDA registration reference. For kids products, confirm recommended age, age-band assignment, safety warnings, and product recall state. Receive beauty and bath inventory only with a future expiry date. Test recall handling on a non-production product before launch.

## 19. Payment and refund operations

Reconcile provider settlement reports against the Finance page and CSV export. Confirm provider references and amounts match before resolving a payment review. Failed or expired payments must release stock. Amount mismatches must stay pending and be flagged for review. Refund-due orders require Finance or Operations permission and a non-empty external refund reference; the reference is retained in the audit log. Return refunds require a received return and a reference before they can be marked refunded.

Run a controlled test for successful payment, provider failure, duplicate webhook, wrong amount, expired reservation, failed delivery, returned stock, and a return refund. Verify the customer notification queue for each resulting event.

## 20. Release smoke test

Run the read-only smoke test against the deployed URL:

```bash
node tests/smoke-production.cjs https://your-production-domain
```

It checks health, public routes, security headers, legal routes, robots, sitemap, private-route noindex, and 404 behavior. It makes no account, order, payment, or inventory mutation. A production release is not signed off until the smoke test passes and the manual payment/refund and legal reviews above are complete.
