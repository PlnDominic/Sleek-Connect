# Sleek Connect: production review (flows, gaps, risks)

Written 10 Nov 2026 after the first Google Play internal-testing build. It covers how the business and the software work, then the
loopholes, UX blockers, gaps, vulnerabilities and risks by area.

**How to read it.** Every finding says whether it was **verified** (seen in the code, or run against a scratch database loaded from
`supabase/setup.sql`) or **to verify** (it depends on a dashboard setting I cannot see from the code). Severity: **High** = fix before
real customers or real money; **Medium** = fix soon; **Low** = tidy up.

---

## Status: what has been fixed in the code (10 Nov 2026)

| Finding | Fix |
|---|---|
| `place_order` unthrottled (stock locking, order flooding, email abuse) | Migration `20261130090000`: at most 3 open unpaid orders per phone and per account, 10 orders per phone per hour, 100 units per order (all adjustable in `store_settings`); applies to every way of placing an order. Suite `db-order-limits.cjs`. |
| Delivery window with no fee found after the order is placed | Checkout (website and app) no longer lets such a window be chosen. |
| Guest-checkout contradiction | One rule: checkout needs sign-in, on the website and in the app; Help, Terms, Privacy and account text agree. (The database function itself still accepts signed-out callers, now limited by the order limits.) |
| Old app builds break after a database change | `get_app_requirements()` + a "Please update" screen. Raise the minimum with `update public.store_settings set min_app_build = <build number>;` |
| App tokens unencrypted, Android backup on | Session now in the secure store (Keystore/Keychain), moved across from the old copy on first use; `allowBackup` is off. Needs a new app build. |
| Public health page lists integrations and missing variable names | Public answer is status only; the full report needs `Authorization: Bearer <CRON_SECRET>`. External monitors that read `integrations` must send that header. |
| Dead pay-on-delivery endpoint | `/api/payments/cod` now answers 410. |
| HEIC return photos unreadable on desktop | HEIC no longer accepted (website and bucket, migration `20261130100000`); iPhones convert to JPEG. |
| Leftover marketplace cron jobs | Unscheduled by migration `20261130090000`. |
| No Dependabot | `.github/dependabot.yml` (weekly npm and GitHub Actions updates). |

**Still needs you (settings I cannot change from the code):** Vercel Pro and Static IPs; Hubtel IP whitelist; Supabase plan, backups/PITR
and **Confirm email**; Google OAuth consent screen "In production"; GitHub branch protection, secret scanning and required checks;
leftover storage buckets `vendor-assets` and `vendor-ids` (delete through the Storage API); SMS provider; Data Protection Commission
number; a restore rehearsal; alerts and an uptime monitor.

## Part 1. The business flow

Sleek Connect is **one store**. It buys from suppliers and sells to shoppers; the shopper's money is the store's own. There are no seller
accounts, seller stores or payouts (Hubtel does not allow collecting money for others without a Bank of Ghana aggregator licence).

```
Suppliers ──(purchase order → receive in parts, cost per unit, batch + expiry)──▶ Stock
Stock ──(catalogue: products, sizes, photos, categories, prices)──▶ Storefront (website + Android/iOS app)
Shopper ──(browse, search, bag, sign in with Google)──▶ Checkout ──▶ Order (stock reserved 15 min)
Order ──(Mobile Money / card on Hubtel)──▶ Paid ──▶ Pack ──▶ Dispatch (rider) ──▶ Delivered (delivery code = proof)
After delivery ──▶ Reviews (moderated) · Returns (photos → decide → receive → refund) · Support cases
Money ──▶ Finance: revenue, refunds due, supplier payments owed, profit and margin (staff only)
```

**Who does what (staff roles):** admin (everything, staff, settings), catalogue (products, content, recalls), operations (stock,
packing, riders, deliveries, purchasing), support (orders, returns, reviews, cases), finance (refunds, promotions, profit, supplier
money), read-only.

**Money rules:** online payment only (pay on delivery was switched off). An order becomes paid only when the payment provider's answer
is verified server-side. Prices always come from the database. Refunds are manual (staff refund in Hubtel, then record it).

## Part 2. The logic flow, step by step

### 2.1 Order lifecycle (database state machine)
`pending_payment → paid → packing → packed → out_for_delivery → delivered`, with side exits `cancelled`, `delivery_failed → returned`.

1. **Place order** (`place_order`, security definer): validates the shopper, prices every line from `products`/`product_sizes`, checks stock,
   reserves stock (`inventory_levels.reserved`), applies delivery fee by zone, stores the order with a secret `public_token` and a secret
   `delivery_code` (neither readable by anyone through the API).
2. **Start payment** (`start_payment`, service role): inserts a `payments` row for the database's total; the server asks Hubtel for a hosted
   checkout (or Mobile Money prompt).
3. **Hubtel calls back** (`/api/payments/webhook?token=…`): the token is checked, Hubtel's Status API is asked, and only then
   `confirm_payment` runs: reservation becomes a sale, order becomes `paid`. A wrong amount sets `needs_review`.
4. **Timeout** (`expire_unpaid_orders`, every minute): unpaid orders past 15 minutes are cancelled and stock released (orders with a payment
   started in the last 45 minutes now wait).
5. **Reconcile** (every 5 minutes, GitHub Actions → `/api/notifications/dispatch`): asks Hubtel about payments still pending or expired and
   confirms the paid ones; a late payment on a cancelled order is flagged "Paid · cancelled".
6. **Fulfil** (staff, `admin_*` functions, all audited): pack (stock batches chosen first-expiry-first-out), assign rider, out for delivery
   (customer gets the delivery code), mark delivered (rider enters the code), or record failed attempts.
7. **After delivery:** reviews (published only after staff approve), returns (window set in settings), support cases, refunds.

### 2.2 Request paths
| Path | Who | How it is protected |
|---|---|---|
| Website pages, search, catalogue | anyone | public RLS policies on published data only; column-by-column grants hide cost fields |
| Cart, sign-in, account, orders | shopper | Supabase session cookie; every table row filtered by `auth.uid()` |
| `/admin/*` | staff | layout shows sign-in; every change is an `admin_*` RPC that calls `require_staff(role)` |
| `/api/payments/*` | shopper, Hubtel | rate-limited; order token; Hubtel callback secret + status check |
| `/api/notifications/dispatch` | GitHub Actions | `Authorization: Bearer CRON_SECRET` (constant-time compare) |
| Android/iOS app | shopper | publishable key + RLS; calls `place_order` itself; asks the website to start payment |

### 2.3 Where each secret lives
`SUPABASE_SECRET_KEY` (Vercel, server only, used in payments/notifications/webhook only), `HUBTEL_API_KEY`, `PAYMENT_WEBHOOK_SECRET`,
`CRON_SECRET`, `GMAIL_APP_PASSWORD` (Vercel); `EXPO_PUBLIC_*` values (publishable key only; public by design) in EAS.

---

## Part 3. Findings by area

### 1. Frontend
- **Verified, Medium: contradictory guest-checkout rules.** The website now makes checkout require sign-in, but the Help page, Terms and
  Privacy notice still say "You can check out as a guest", the Account sign-in card says "You can still check out without an account",
  and the app lets guests check out. Pick one rule and make the copy, the website and the app agree. (Sign-in on the website is only a
  screen rule: `place_order` itself accepts anonymous callers, see area 2.)
- **Verified, Medium: delivery fee discovered too late.** If no fee is set for a delivery window, the order is placed and then cancelled at
  payment ("delivery fee not set": four such orders, SC-1012 to SC-1015). Check the fee before the order is placed, and disable windows
  with no fee at checkout.
- **Verified, Medium: no way to pay again.** An expired order shows "can no longer be paid"; the customer must re-enter everything. Offer
  "Try payment again" while stock is still available.
- **Verified, Low: CSP allows `'unsafe-inline'` scripts** (Next.js inline bootstrap). Acceptable now; moving to nonce-based CSP would remove
  a large XSS-impact class.
- **Verified, Low:** `Referrer-Policy: strict-origin-when-cross-origin` keeps the secret order link out of third-party referrers. Good.

### 2. API and backend logic
- **Verified, High: `place_order` is not rate-limited.** The RPC is callable with the public key by anyone, including without the website.
  A script can (a) reserve most of the stock for 15 minutes, repeatedly, so real customers see "sold out"; (b) create thousands of
  orders that fill the admin queue; (c) trigger "order received" emails to arbitrary addresses (limit is 3 an hour *per address*, not
  overall), which can exhaust Gmail's ~500 messages a day and stop real customer email. The website's `placeOrder` server action has
  no throttle either (only reviews, tracking and support reports do). **Fix:** in the database, cap open unpaid orders per phone number,
  per account and per hour; limit total quantity per order; add a CAPTCHA (Cloudflare Turnstile) on guest orders; consider requiring
  sign-in inside `place_order`, not just in the page.
- **Verified, Medium: the 45-minute hold I added** (so an in-flight payment is not cancelled) lengthens how long a bot can lock stock
  *if it starts payments*. Cap pending orders per phone/account to contain this.
- **Verified, Medium: payment started by anyone holding an order token** with a wallet number of their choosing (rate limit 20 per 10
  min per IP). The token is 128-bit random so this needs the token; still, treat tokens as passwords (they are in emails and links).
- **Verified, Low: `/api/payments/cod` is dead** (pay on delivery is off) but still live and can send store-alert emails for any pending
  cod order token. Remove it.
- **Verified, Low:** server actions return database messages for known error code `22023` only; others are generic. Good.

### 3. Database and storage
- **Verified, strong:** RLS on every table; sensitive tables have no grants at all; staff cannot read `delivery_code`/`public_token`;
  247 security-definer functions all set `search_path`; anonymous users can call only 30 intended functions; attack simulation (writes,
  staff takeover, reading orders, calling `admin_*`/`confirm_payment`) was blocked.
- **Verified, Medium: leftover buckets** `vendor-assets` (public) and `vendor-ids` (private) still exist. Delete them through the Storage
  API.
- **To verify, Medium: leftover cron jobs.** Migrations scheduled `refresh-vendor-products` and `vendor-renewal-reminders`; the marketplace
  removal dropped the functions but I found no `cron.unschedule`. Run `select jobname, schedule from cron.job;` and unschedule any vendor
  job, or they fail every day.
- **Verified, Medium: public sales data.** `get_product_discovery_metrics()` shows units sold per product to anonymous visitors.
- **Verified, Medium: schema drift happens.** The app and database are changed separately, and migrations are applied by hand. An old
  Android build silently lost its products because the database had moved on (see area 12). Treat "apply migrations, then deploy" as a
  checked step (see area 8).
- **Verified, Low: cost of data deletion** is handled correctly (orders anonymised, photos removed through the Storage API).

### 4. Authentication and permissions
- **Verified, strong:** staff access needs an active staff row **and a confirmed email**; the last admin cannot be removed; changes are
  audited; the audit log is append-only.
- **To verify, High: Supabase "Confirm email" must be ON** (Authentication → Sign In / Providers → Email). Staff are matched by email, and
  password sign-up is open on the Supabase project. If confirmation is off, anyone can register a password for a staff email that has
  no account yet. The code checks `email_confirmed_at`, so confirmation being on makes this safe.
- **To verify, High: Google OAuth consent screen must be "In production".** In "Testing" status only listed test users can sign in and
  their sign-in expires after 7 days. Also needs the verified domain and privacy URL (see `docs/LAUNCH_SIGNOFF.md`).
- **Verified, Medium: no two-step verification for staff** (owner's choice, documented). A stolen staff password is full admin access.
  Minimum: unique strong passwords, a password manager, and turn on Supabase leaked-password protection (Pro plan).
- **Verified, Low: staff email/password sign-in exists** besides Google. If everyone uses Google, you could disable staff passwords.
- **Verified, Low:** order links (`/orders/<token>`) are bearer secrets: anyone with the link sees that order. They are `noindex` and not
  sent in referrers.

### 5. Hosting and deployment
- **To verify, High: Vercel plan.** The dispatch workflow's comment says "Vercel Hobby limits cron jobs to once a day". The Hobby plan is
  for non-commercial use, so a live store belongs on **Pro**. Pro also unlocks **Static IPs**, which Hubtel's status check needs (see
  area 6). Without them, payments cannot be confirmed automatically.
- **Verified, Medium: no staging environment.** Production is the only database. Test payments, migrations and data fixes run live.
- **Verified, Medium: deploy is not gated by CI.** Vercel deploys from `main` as soon as it is pushed; CI results do not block it.
- **Verified, Medium: manual migrations.** `npx supabase db push` is a person's job before each deploy. Add a check that the live schema
  matches the repo (the `verify_launch_schema` call is a start) and a release checklist.
- **Verified, Low:** rollback is a Vercel promote of a previous deployment (documented); a database change cannot be rolled back that way.

### 6. Cloud infrastructure
- **High (blocking): Hubtel status-check IP whitelisting is not done**, so no online payment can be confirmed automatically yet. Evidence:
  SC-1016 got no provider answer at all. Needs: Vercel Pro Static IPs (or a fixed-IP proxy), then Hubtel whitelists the IPs. See
  `docs/HUBTEL.md`. `HUBTEL_SKIP_STATUS_CHECK=true` is a weaker stopgap.
- **To verify, High: Supabase plan.** A free project has no automated backups or point-in-time recovery and **pauses after a week of
  inactivity**. A live store needs Pro (backups, PITR, no pausing, connection pooling).
- **To verify, Medium: a second Supabase account.** The tooling I could reach showed projects named "Glow" and another that are not
  your store (`oihdrdbjyqpeefihcmdm` is). Make sure there is only one production project and that old projects are paused or deleted.
- **Verified, Medium: single points of failure.** GitHub Actions is the only scheduler for reconcile and notifications. Scheduled
  workflows can be delayed or skipped, and GitHub disables them after 60 days without repository activity on public repositories.
  Add a second trigger (Vercel Cron on Pro, or `pg_cron` + `pg_net`) and an alert if no run succeeded in 15 minutes.
- **Verified, Low:** SMS is disabled, so email is the only message channel (area 12).

### 7. Git and version control
- **Verified, strong:** no secrets in the files or in history (scanned); `.env` files are git-ignored; only `.env.example` is tracked.
- **Verified, Medium: everyone pushes straight to `main`** (project rule) and `main` auto-deploys. There is no required review, no
  required passing check and no protected branch. One bad push is live in minutes. At least require CI to pass and block force-push.
- **Verified, Medium: no `CODEOWNERS`, no Dependabot, no secret-scanning/push-protection confirmed.** Turn on GitHub secret scanning
  with push protection and Dependabot security updates.
- **Verified, Low:** a 39-commit-stale local copy built the first Android release, because the build uploads whatever is in the local
  folder. Build releases only from a fresh `git pull` on `main` (or from CI).
- **Verified, Low:** business documents (BRD, PRD `.docx`) live in the repository; keep anything sensitive out of it.

### 8. CI/CD pipeline
- **Verified, strong:** CI runs typecheck, lint, the production build and the full suite (database, browser and unit tests) on every
  push and pull request.
- **Verified, Medium:** actions are pinned by version tag (`@v4`), not commit SHA; no `npm audit`/dependency check in CI; no mobile build or
  typecheck gate beyond `tsc`; CI does not test against a copy of production; tests were not all run after several recent changes in this
  session (no Docker in the review environment), so confirm the last CI run is green.
- **Verified, Low:** the dispatch workflow needs repository secrets `SITE_URL` and `CRON_SECRET`; if either is missing it fails every
  5 minutes (visible in the Actions tab) and nothing alerts you.

### 9. Application security
- **Verified, fixed:** open redirect after sign-in (`next=/\evil.com`); cron secret now compared in constant time.
- **Verified, strong:** security headers (HSTS, frame-ancestors none, nosniff, strict CSP otherwise, Permissions-Policy), CSV export
  guards formulas, email HTML escaped, JSON-LD escaped, no `eval`/raw HTML from users, Sentry/PostHog scrubbing of tokens and numbers.
- **Verified, Medium: mobile app (Android).** Sign-in tokens are kept in unencrypted app storage (`expo-sqlite`), and Android auto-backup
  is not turned off, so tokens can leave in a device backup. Store an encryption key in `expo-secure-store` and set
  `android.allowBackup=false`. The custom link `sleekconnect://` can be claimed by another app; the sign-in uses PKCE, which blocks
  code theft, but prefer verified App Links later.
- **Verified, Medium: public health endpoint** lists which integrations are configured and the names of missing variables. Return only
  `status` publicly; protect the detail.
- **Verified, Low:** `npm audit` shows 3 high advisories, all in Expo's build tooling, none in the web runtime.
- **Verified, Low: Ghana data-protection registration number is not set** (Admin showed "Not set yet"). If the store is a data controller
  this registration is a legal duty; get it and set `DATA_PROTECTION_REGISTRATION_NUMBER`.

### 10. Rate limiting
- **Verified, High:** none on `place_order` (area 2).
- **Verified, Medium: the limiter is in-memory per server instance.** On Vercel each instance counts separately, and it trusts the first
  `x-forwarded-for` value. Limits are therefore soft: a patient attacker bypasses them. The database-level limits (support cases,
  order lookups, emails per address) are the real protection. Back the web limits with a shared store (Upstash/Redis or a table), or
  use Vercel's Firewall / Rate limiting rules (Pro) in front of `/api/*` and the checkout action.
- **Verified, Medium: Supabase Auth limits.** Check the OTP/sign-in rate limits in Supabase and enable CAPTCHA protection on sign-up.
- **Verified, Low:** `/api/search/live` allows 180 requests a minute per address and runs three queries each; fine for now.

### 11. Caching and CDNs
- **Verified, strong:** catalogue reads are cached and tagged `catalog`; admin changes call `updateTag('catalog')`; private pages and APIs
  are `noindex` and `no-store` where needed; product images come from a public bucket through Next image optimisation.
- **Verified, Medium: stale-catalogue risks.** Anything that changes what shoppers see must call `updateTag('catalog')`. A change made
  directly in the database (SQL editor, migration) does not, so prices or stock status can look stale until the cache refreshes. Call
  a revalidation after data fixes.
- **Verified, Low:** images are served from Supabase Storage's CDN, not your domain; keep the bucket public only for `product-images`.
- **To verify, Low:** put the domain behind Vercel's CDN defaults only; there is no WAF or bot protection (area 10).

### 12. Load balancing and scaling
- **Verified, Medium:** the web app is serverless on Vercel, which scales out by itself. The bottlenecks are the **database** (connection
  limit on small Supabase plans; use the pooled connection string and a paid plan) and **place_order**, which locks inventory rows
  (`for update`), so a burst of orders for the same product serialises. Fine for a small store; load-test before a campaign.
- **Verified, Medium: old app versions break when the database changes.** There is no "minimum supported app version" check, and
  schema removals (sellers, shop-by-age) hit old builds with failed requests. Add a `min_app_version` setting the app reads at start
  (and a "please update" screen), and keep database changes backward-compatible for one release.
- **Verified, Medium: Google Play account type.** A new personal developer account must run a closed test with 12 testers for 14 days
  before production; plan the launch date around that.
- **Verified, Low:** every request uses the same single region as the database; check the Supabase region is close to Accra users.

### 13. Error tracking and logging
- **Verified, strong:** structured logger with request ids; `onRequestError` captures server failures; Sentry events are scrubbed
  (no order tokens, phone numbers, emails, cookies or bodies); no analytics from `/admin`.
- **To verify, Medium: is Sentry actually on?** It does nothing without `NEXT_PUBLIC_SENTRY_DSN`/`SENTRY_DSN`. Confirm a test error reaches
  Sentry and that an alert goes to a person (email/phone) for payment and webhook errors.
- **Verified, Medium: no alert on silent failures:** the reconcile/dispatch job failing, payments pending too long, notifications failed,
  the 5-minute workflow not running. Add alerts (Sentry cron monitors, or an uptime monitor on `/api/health`).
- **Verified, Low:** the callback token is in the webhook URL, so it appears in host access logs; it is derived from the secret (never
  the secret itself). Acceptable for Hubtel's design; rotate `PAYMENT_WEBHOOK_SECRET` if logs are ever shared.
- **Verified, Low:** `lib/payments/start.ts` writes provider errors with `console.error`; make sure those never include a wallet number.

### 14. Availability and disaster recovery
- **Verified, strong on paper:** `docs/BACKUP_AND_RECOVERY.md` is a good runbook (RPO/RTO, restore steps, Storage recovery, rollback).
- **To verify, High: none of its checklist is evidenced.** There is no record that backups/PITR are on, that a restore was rehearsed
  against a separate project, or that Storage objects (product images, return photos) are backed up. Supabase backups do **not** include
  Storage files. Do the first rehearsal this month.
- **Verified, Medium: payments depend on the provider.** If Hubtel is down, checkout fails with a generic message; show a clear
  "payments are temporarily unavailable" notice and a way to be told when they return.
- **Verified, Medium: money-in-flight risk.** A customer can pay while the order is cancelled; refunds are manual. Keep the "Paid ·
  cancelled" queue empty daily, and reconcile Hubtel's settlement report against `payments` weekly.
- **Verified, Low:** no status page and no on-call owner is named in the repository; fill in the runbook's incident contacts.

### 15. File upload validation
- **Verified, strong:** buckets limit size (5 MB) and type (`jpeg/png/webp`; return photos also `heic/heif`); staff-only writes to
  `product-images`; shopper uploads go to a hashed folder and are only allowed for an order that can really be returned
  (`can_upload_return_photo`); SVG and other active formats are not allowed; return photos are private and shown through 10-minute
  signed links; account deletion removes them through the Storage API.
- **Verified, Medium: the type is the browser's claim.** The server checks the declared `Content-Type`, not the file's actual bytes, so a
  renamed non-image can be stored. Impact is limited (files are served from the storage domain, not your site, and as images), but
  add server-side content sniffing/re-encoding (for example an Edge Function that rejects files that do not start with image magic
  bytes) and a malware-scan option for return photos.
- **Verified, Medium: HEIC/HEIF cannot be viewed in most desktop browsers.** Customers on iPhones can attach them, but staff using Chrome or
  Edge on Windows will see broken images in the returns screen. Convert to JPEG on upload, or stop accepting HEIC.
- **Verified, Medium: orphan files.** The file is uploaded before the database row is saved; an abandoned form leaves a file behind. Add a
  weekly clean-up of objects not referenced by a product, category or return.
- **Verified, Low:** anonymous visitors can upload return photos when they hold a valid order token; one photo per request, 5 MB each; add
  a per-order cap on count.

---

## Part 4. UX mistakes, blockers and gaps (collected)

| # | Where | Problem | Fix |
|---|---|---|---|
| 1 | Checkout | Website requires sign-in, Help/Terms/app say guests are fine | one rule everywhere |
| 2 | Checkout | Delivery fee found missing only after the order is placed (then cancelled) | validate before placing; hide windows with no fee |
| 3 | Payment | 15-minute window, no "pay again", Mobile Money prompt can arrive late | retry payment; show countdown and what to do if charged |
| 4 | Order status | Admin showed "Cancelled" for every unpaid order | fixed: Expired · unpaid / Payment failed / Paid · cancelled |
| 5 | Notifications | SMS is off and email is optional, so a guest with no email gets no delivery code or updates | turn on SMS, or require an email or push opt-in |
| 6 | App | Old versions break silently after a database change | minimum-version gate and "please update" screen |
| 7 | App | Opens on Beauty even when only other departments have products | open on the first department that has products |
| 8 | Returns | Staff cannot view HEIC photos on desktop | convert to JPEG |
| 9 | Admin | Default order tab hides problems (Needs review, Abandoned, Paid · cancelled) | show a count badge for each queue on the dashboard |
| 10 | Support | `support` contact is "incomplete" in the health check | add phone, WhatsApp or email in Admin → Settings |
| 11 | Launch | Google Play needs 12 testers for 14 days on a personal account | start the closed test now |

## Part 5. What I would do, in order

**This week (blocks real money):**
1. Upgrade Vercel to Pro; enable Static IPs; give the IPs to Hubtel; place a small live test payment and watch the order become paid.
2. Confirm in Supabase: plan (Pro), backups/PITR on, **Confirm email on**; confirm Google OAuth consent screen is **In production**.
3. Throttle `place_order` in the database (per phone, per account, per hour, total quantity) and add Turnstile for guests.
4. Set `SMS_PROVIDER` or make email required, so every customer gets the delivery code.
5. Run `select jobname, schedule from cron.job;` and unschedule vendor jobs; delete the two leftover buckets.

**Before the public launch:**
6. Protect `main` (require passing CI, no force-push); turn on secret scanning and Dependabot.
7. Add the minimum-app-version gate; encrypt app tokens and disable Android backup.
8. Add alerts: Sentry for payment/webhook errors, an uptime monitor on `/api/health`, an alert when the 5-minute job or reconcile stops.
9. Restore rehearsal into a separate Supabase project; back up Storage files.
10. Resolve the guest-checkout copy conflict; add payment retry and fee validation at checkout.
11. Register with the Data Protection Commission and set the number.

**Later:** nonce-based CSP, shared-store rate limiter or Vercel Firewall rules, server-side image sniffing/re-encoding, staging environment,
automated migrations in CI, load test, status page, verified Android App Links.

## Part 6. What I could not check

I cannot see your Vercel, Supabase, Google Cloud, GitHub or Hubtel settings, live logs, or production data, and the full test suite
could not run here (no Docker). Items marked **to verify** are the ones that need someone with those dashboards. The checks that were run:
a scan of the files and git history for secrets, `npm audit`, typecheck and lint, an attack simulation against a scratch database built
from `supabase/setup.sql`, and a read of the payment, authentication, upload, caching and deployment code.
