# Sleek Connect Store

Storefront for authentic beauty products and safe, age-appropriate kids' products, delivered across Accra.
Business and product requirements live in [`docs/`](docs/) (BRD and PRD, v0.1 drafts).

Stack: **Node.js + Next.js** for the web store, **Supabase** for the database and API, and **React Native with
Expo** for the mobile app (App Store and Google Play, tested in Expo Go). The web store is being built first.

| Workspace | What it is | Status |
| --- | --- | --- |
| [`apps/web`](apps/web) | Next.js 16 storefront (Home, Shop and category pages with filters, Search, Shop by age, Product, Bag, Checkout, Account with addresses and saved items, order tracking, receipts, cancellation, returns and the help centre) and the staff admin console at `/admin` | Active. Runs on Supabase |
| [`tests`](tests) | Database and browser test suites (`npm test`), also run by GitHub Actions | Active |
| [`supabase`](supabase) | Database schema (migrations), access rules and starter data | Active |
| [`apps/mobile`](apps/mobile) | Expo SDK 57 app: Home, Shop by age, Product, Mobile Money checkout, Order tracking | On hold until the web store is done; still uses the bundled catalogue |
| [`packages/shared`](packages/shared) | Design tokens, icons, types, starter catalogue and bag state used by both apps | Active |

## Run it locally

Requires Node 20+, npm and Docker (for the local Supabase stack).

```sh
npm install
npm run db:start                                 # local Supabase; first run downloads the Docker images
cp apps/web/.env.example apps/web/.env.local     # paste API_URL and PUBLISHABLE_KEY printed by db:start
npm run dev:web                                  # http://localhost:3000
```

`npm run db:start` applies the migrations and loads `supabase/seed.sql`, the starter catalogue from the design (with 25
of everything in stock).

To try payments and customer messages locally, also set these in `apps/web/.env.local` (see [Payments](#payments)
and [Customer messages](#customer-messages)):

```sh
SUPABASE_SECRET_KEY=...        # SECRET_KEY printed by `npx supabase status`
PAYMENT_PROVIDER=test
PAYMENT_WEBHOOK_SECRET=...     # any long random string, e.g. `openssl rand -hex 24`
SMS_PROVIDER=console           # writes SMS to the server log instead of sending
EMAIL_PROVIDER=console
```

To use the admin console locally, add yourself as staff (see [Admin console](#admin-console)).

Google sign-in needs a Google OAuth client; see [Sign in with Google](#sign-in-with-google). Everything else works
without it.

Checks:

```sh
npm run typecheck
npm run lint
npm run build:web
npm test              # every test suite (see Testing); `npm test -- db` runs only the database ones
```

## Connect a hosted Supabase project

1. Create a project in the Supabase dashboard.
2. Load the schema and the starter catalogue, either way:
   - **One paste (new, empty project):** open [`supabase/setup.sql`](supabase/setup.sql), copy all of it into
     SQL Editor → New query, and run it once. It contains every migration in order plus the seed.
   - **CLI:** this keeps track of which migrations have run, so later updates are a single command.

     ```sh
     npx supabase login
     npx supabase link --project-ref <your-project-ref>
     npx supabase db push --include-seed
     ```

   Later schema changes arrive as new files in `supabase/migrations`. Run only the new ones, in order (SQL Editor),
   or `npx supabase db push`. Never re-run `setup.sql` on a project that has data.

   The migrations also create two Storage buckets, so Storage must be enabled (it is by default on hosted projects):
   `product-images` (public: product photos staff upload) and `return-photos` (private: photos customers attach to a
   return).
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Project Settings → API) in
   `apps/web/.env.local` and in your hosting provider. Also set `SUPABASE_SECRET_KEY` (Project Settings → API keys).
   Only the server-side payment and messaging code reads it. Never give it a `NEXT_PUBLIC_` name.
4. In Authentication → URL Configuration, set the Site URL to your live address and add
   `https://<your-domain>/auth/callback` (and `http://localhost:3000/auth/callback` for local work) to the redirect URLs.

## Testing

`tests/` holds the automated checks: database suites that call the API as shoppers and as each staff role, and browser
suites (Playwright) that click through the store and the admin console. `npm test` resets the local database before
each suite, builds the web app and starts it on port 3000. It needs the local stack running (`npm run db:start`),
`apps/web/.env.local` pointing at it with the test settings shown in [Run it locally](#run-it-locally), and Chromium for
Playwright (`npx playwright install chromium`, once). Screenshots and logs land in `tests/.output`.

GitHub Actions runs the same checks (typecheck, lint, every suite) on each push to `main` and on pull requests; see
`.github/workflows/ci.yml`. A failed run keeps its screenshots and logs as a downloadable artifact.

## Deploy on Vercel

In the Vercel project settings:

- **Root Directory:** `apps/web` (the repository root has no Next.js app, so building from it returns 404 pages).
- **Production Branch:** `main`.
- **Environment Variables:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_SECRET_KEY`, `SITE_URL` (your live address, used in message links), `CRON_SECRET` (any long
  random string), and later `PAYMENT_PROVIDER`, `SMS_PROVIDER`, `EMAIL_PROVIDER` with their secrets.

The build reads the catalogue from Supabase, so the Supabase variables must be set before the first deploy.

## Database overview

| Table | Purpose | Who can read it |
| --- | --- | --- |
| `products`, `product_sizes`, `product_age_bands`, `categories`, `age_bands` | Catalogue | Everyone (published products only) |
| `merchandising_slots` | Ordered product lists such as `home_hero`, `home_new_arrivals`, `home_best_sellers`, `product_related` | Everyone |
| `banners` | Home page hero and promo cards, with optional start and end times and a countdown | Everyone sees live ones; staff see all |
| `delivery_areas`, `delivery_zones`, `delivery_rates`, `delivery_options` | Where you deliver, zones that charge their own fee or skip an option, standard fees, estimates and cut-offs. Edited in Admin → Delivery | Everyone |
| `product_images` | Uploaded product photos (files in the `product-images` bucket), in gallery order | Everyone (published products only) |
| `inventory_levels` | Stock per product and size: `on_hand` and `reserved` | Everyone sees only `in_stock`; counts are staff-only |
| `store_settings` | Store rules (payment hold, return window, delivery attempts, stock alerts) and support contacts. Edited in Admin → Settings | Everyone |
| `orders`, `order_items` | Orders and what was bought | The signed-in shopper who placed them, and staff (never the delivery code) |
| `order_events` | Every status change: when, who, notes | Staff; customers see it on their order page |
| `payments` | Each payment attempt, its provider reference, amount and status | Staff only |
| `notifications` | Customer messages and their delivery log | Staff only |
| `stock_batches`, `stock_movements`, `order_item_batches` | Batches with expiry dates, the stock ledger, and which batch each order was packed from | Staff only |
| `riders` | Delivery riders | Staff only |
| `return_requests`, `return_items` | Return cases (`RT-…`), what's coming back, and what happened to it | Staff; customers see theirs on the order page |
| `support_cases` | Messages from the help centre (`CS-…`) and staff replies | Staff only |
| `order_lookup_failures` | Failed "Track an order" lookups, to slow down guessing | Nobody (internal) |
| `staff_members`, `audit_log` | Who can use the admin console, and an append-only record of sensitive changes | Staff; the audit log is admins only |
| `profiles` | When a shopper confirmed they're 18+ and accepted the terms | The shopper |
| `bag_items` | Signed-in shoppers' saved bags | The shopper |
| `customer_addresses` | Signed-in shoppers' saved delivery addresses (up to 10, one default) | The shopper |
| `wishlist_items` | Signed-in shoppers' saved products | The shopper |

- Nothing is writable through the public API except via the functions the app calls. Staff change the catalogue,
  stock and orders in the admin console, which goes through `admin_*` database functions that check the person is
  active staff and has the right role, and log what they did. Changes show on the store within a minute.
- Checkout calls `place_order`, which checks the details, prices every line from the database, reserves the stock and
  creates an order with status `pending_payment`.
- Schema changes go in new migrations: `npx supabase migration new <name>`, then `npm run db:reset` and
  `npm run db:types`.
- To change the starter catalogue, edit `packages/shared/src/catalog.ts` and run `npm run db:seed:generate`.
- After adding a migration or regenerating the seed, run `npm run db:setup:generate` to refresh `supabase/setup.sql`.

## Admin console

Staff work at `/admin`. They sign in with Google or with an email and password, and go straight in: there is no
second step. Either way the account must be on the staff list that an admin keeps, and the database itself refuses staff
actions from anyone who isn't active staff with a confirmed email address.

Because there is no second step, keep the staff list short and ask everyone on it to turn on Google's own 2-Step
Verification (or use a long, unique password). (This replaces the authenticator-app step the PRD describes in FR-107.)
For email and password sign-in:

- Leave the **Email** provider on in Supabase (Authentication → Sign In / Providers) and keep **Confirm email** on.
- Create password accounts yourself: Authentication → Users → Add user, with **Auto Confirm User** ticked, then add
  that email to the staff list. Staff who use Google need nothing here.
- If a staff member gets a confirmation email they didn't ask for, they should delete it rather than click it.
- There is no "forgot password" link yet; reset a password from the same Users page.

Add the first admin once, in the SQL Editor, using the email address they'll sign in with:

```sql
insert into public.staff_members (email, role) values ('owner@gmail.com', 'admin');
```

After that, admins add everyone else on the Staff page. Roles:

| Role | Can |
| --- | --- |
| Admin | Everything, including staff and lifting recalls |
| Catalogue | Add and edit products, publish them, recall products and batches; edit banners and featured products |
| Operations | Receive and adjust stock, pack, dispatch and deliver orders, manage riders; everything Support can do with returns and cases; receive returned goods |
| Support | View everything; cancel orders and resolve orders flagged for review; approve or decline returns; reply to support cases |
| Finance | View everything; record refunds (orders and returns) |
| Read-only | View only |

What's in it:

- **Dashboard:** orders to pack, ready for dispatch, out for delivery, failed deliveries, orders needing review or a
  refund, low stock and expiry alerts.
- **Orders:** work queues; bulk "start packing" and "mark packed"; a printable pick list and packing slip (gift orders
  leave out prices); dispatch to a rider or courier; delivery with proof; failed deliveries; cancellations.
- **Products:** add and edit products with their sizes, age bands and compliance details; bulk import from CSV (with a
  template and row-by-row results); publish, unpublish and recall. A product can only be published when it has its
  brand, category, description, ingredients or materials, safety notes and country of origin. Beauty and bath products
  also need their FDA registration number, and kids' products an age range (PRD FR-100).
- **Inventory:** stock per product and size, receiving stock into batches, batch actions, the movement log, and CSV
  exports of alerts and movements.
- **Returns:** a queue of return requests with the customer's reason and photos; approve or decline (with a note the
  customer sees), receive the goods and choose for each item whether it goes back on sale, into quarantine or is
  written off, then record the refund.
- **Support:** cases from the help centre, linked to the order when the customer gave one; reply (by SMS and email)
  and close.
- **Content:** home page banners (hero and promo cards, scheduled or with a countdown) and the featured product lists
  (hero products, New Arrivals, Best Sellers, "You may also like").
- **Riders**, **Staff**, **Delivery**, **Audit log** and **Settings** (all but Riders admins only):
  - **Delivery:** the areas you deliver to, zones (groups of areas with their own fee, or without an option such as
    same day), each option's standard fee, estimate in working days and cut-off time, and the free-delivery threshold.
  - **Audit log:** every sensitive change, filterable by kind and by staff member.
  - **Settings:** the support phone, WhatsApp, email and hours shown in the help centre, the return window, the payment
    hold and the stock alert levels.

  Every change on these pages is audited.

Product photos are uploaded on the product's page in the admin console (up to 8 per product, JPEG, PNG or WebP under
5 MB). The first is the main photo in listings, the bag and orders; staff set the order and a description for screen
readers. Next.js resizes them for each screen. Products without uploaded photos keep the design's sample picture or
the tinted placeholder.

## Orders and delivery

An order moves through: awaiting payment → confirmed → packing → ready for dispatch → out for delivery → delivered.
Every change is kept in its history with the time and the staff member (PRD FR-042). The customer's order page
(`/orders/<link>`) shows that history, what happens next, the items with the batches they were packed from, and a
printable receipt once paid. Signed-in shoppers find their orders under Account → Your orders.

- **Proof of delivery:** each order has a 4-digit delivery code that only the customer sees (order page and SMS).
  Staff can't read it. To mark an order delivered, enter who received it and the code the customer gave the rider.
  Wrong codes are counted and audited; after five, the order locks and is flagged for review, so the code can't be
  guessed. If a customer has lost their code, an admin can confirm the delivery without it (with a note, which is
  audited). Turn the code off with `store_settings.require_delivery_code`.
- **Failed deliveries:** record the reason; the customer is told. Send it out again, up to
  `store_settings.max_delivery_attempts` (2) attempts, or return it to stock, which flags it for a refund.
- **Cancelling:** staff can cancel until the order leaves the warehouse. Customers can cancel from their order page
  until packing starts (PRD FR-052), with a reason that goes into the history. Either way stock goes back on sale, and
  paid orders are flagged "refund due". Refunds are made outside the system for now, then recorded on the order.
- **Buy again** (PRD FR-051): delivered, cancelled and returned orders have a button that puts the items back in the
  bag, naming any that are no longer available.

## Delivery pricing

Checkout charges the fee of the shopper's area (PRD FR-040): areas in a zone pay the zone's fee for each option, other
areas pay the option's standard fee, and a zone can leave out an option entirely. Once the bag reaches the free-delivery
threshold, the options marked "free over the threshold" cost nothing. Checkout shows each option's price and estimate
for the chosen area ("1–2 working days", "Today if you order by 2:00 pm"), and how much more is needed for free
delivery (PRD FR-041). `place_order` applies the same rules, so the charge never depends on what the browser shows.

## Accounts: addresses and saved items

- **Saved addresses** (PRD FR-023): signed-in shoppers keep up to 10 addresses under Account → Your addresses, one
  of them the default. Checkout fills in the default, offers the others, and can save a new address with the order.
  A map pin isn't built yet.
- **Saved items** (PRD FR-063): the heart on any product saves it. Guests keep the list on their device; signing in
  adds it to the account so it follows them. `/saved` lists them.

## Shopping: categories, search and filters

- `/shop` lists everything; `/shop/beauty`, `/shop/kids` and `/shop/<department>/<category>` narrow it (PRD FR-011).
  24 products per page.
- Filters (PRD FR-013): category, brand, price band, age band (kids), skin type and shade (beauty), on sale and in
  stock. Each option shows how many products it would leave. Sort by featured (Best Sellers first), newest or price.
  Skin types and shades come from the product's fields in the admin console; a filter only appears once some product
  in view has values for it.
- Search (`/search`, PRD FR-012) matches names, brands, categories and descriptions and tolerates typos ("serun" finds
  the serum), using Postgres trigram similarity (`search_products`). The search box remembers the last six searches on
  the device.
- Safety warnings (PRD FR-017): a product's **Safety warning label** shows above "Add to bag" and next to the item in
  the bag. The longer safety notes stay in the product details.

## Returns

Customers request a return from their order page within `store_settings.return_window_days` (7) of delivery
(PRD FR-053): they pick the items and quantities, a reason and up to three photos, and get a return number (`RT-…`).
Products marked as not returnable (e.g. opened cosmetics) can still come back if they arrived damaged, wrong or
expired. Photos go to the private `return-photos` Storage bucket, in a folder named after a hash of the order link, so
staff never see the link itself; only staff can view them, through short-lived links.

Staff then approve or decline, receive and inspect the goods, and record the refund (PRD FR-054). Restocked units go
back into the batch they were packed from; quarantined ones into a held `<batch>-RET` batch; write-offs are only
recorded. The refund due is the price of the returned items (delivery isn't refunded). The customer gets a message at
each step and sees the status on the order page.

## Help centre and support

`/help` answers common questions (ordering, payment, delivery areas and fees, returns, authenticity, product safety,
accounts) using the live settings, and lists the contact options set in Admin → Settings (call, WhatsApp, email). Until
they are set it shows placeholders.

- **Track an order** (`/track`): order number plus the phone number used at checkout opens the order page. After 8
  misses in an hour for the same phone or order number, lookups pause for the rest of the hour.
- **Report a problem** (`/help/report`, PRD FR-055): opens a support case and shows its number (`CS-…`). From an order
  page the form is filled in and linked to the order. A phone number can open at most three cases an hour, and only the
  first one each hour gets an acknowledgement message, so the form can't be used to send messages to someone else.

## Stock

Stock lives in batches (`stock_batches`): a batch number, an expiry date (required for beauty and bath products) and a
unit count. Staff receive deliveries into batches on the Inventory page. `inventory_levels.on_hand` is what can still
be sold, and every change to either is written to the `stock_movements` ledger with who, when and why (PRD FR-102).

- Products and sizes with nothing available show "Sold out" and can't be added to the bag.
- Placing an order reserves its items, so two shoppers can't buy the last unit. The reservation lasts
  `store_settings.reservation_minutes` (15). If payment fails, or the time runs out (a database job checks every
  minute), the order is cancelled and the items go back on sale. Payment turns the reservation into a sale.
- Packing takes units from the batch that expires first. The pick list shows which batch to take.
- Batches can be quarantined (off sale, can be released), recalled (off sale for good, and orders already packed from
  them are flagged), or written off. A daily job takes batches off sale once they pass their expiry date.
- Alerts: low stock when available units reach `store_settings.low_stock_threshold` (5), and expiry within
  `store_settings.expiry_alert_days` (90). Both can be set per category in `categories`.
- The starter catalogue comes with one sample batch per product (25 units; beauty items expire 2028-12-31). Replace
  them with real deliveries.

## Customer messages

Customers get an SMS (and an email if they signed in) when their order is confirmed, packed, out for delivery
(with their delivery code), delivered, failed delivery, cancelled after payment, or returned (PRD FR-060), at each step
of a return, and when they open a support case or staff reply to it. Messages queue in the `notifications` table, which
doubles as the delivery log. Failed sends are retried up to five times.

- `SMS_PROVIDER` and `EMAIL_PROVIDER` pick the senders. `console` writes messages to the server log for development
  and is ignored on Vercel production. With no provider set, messages are recorded as "not sent".
- Messages are sent right after each status change. To retry failures on a schedule, call
  `GET /api/notifications/dispatch` with `Authorization: Bearer <CRON_SECRET>`, for example from a Vercel Cron job.
- To add a real provider (e.g. an SMS gateway in Ghana), implement `MessageProvider` in
  `apps/web/src/lib/notifications/providers.ts`. The wording is in `templates.ts`.

## Payments

Payments are built so any provider can be plugged in; none is chosen yet.

- Checkout places the order, records a payment attempt (`start_payment`) for the total the database calculated, then
  asks the provider to charge it (for Mobile Money, the approval prompt on the shopper's phone).
- The provider reports the outcome to `POST /api/payments/webhook`. The web app checks the signature, confirms the
  outcome with the provider, then calls `confirm_payment`, which marks the order paid. That call can safely be
  repeated. A late or repeated notification changes nothing. A payment for the wrong amount, or one that arrives after
  the order expired, is flagged with `orders.needs_review` for staff instead of being accepted.
- The checkout page follows the order and shows when the payment is received, fails or expires. The bag is emptied
  once the order is paid, so a failed payment can be retried straight away.

`PAYMENT_PROVIDER` picks the provider. Leave it empty to keep payments switched off: orders are still placed and
reserved, and checkout says no prompt was sent. `test` is a stand-in for development that moves no money (it refuses
to run on Vercel production). With it, play the provider from a terminal:

```sh
npm run payments:simulate -- SC-1001 succeeded
npm run payments:simulate -- SC-1001 failed
npm run payments:simulate -- SC-1001 succeeded --amount 10   # wrong amount: flagged for review
```

To add a real provider (for example a Mobile Money aggregator), implement `PaymentProvider` in
`apps/web/src/lib/payments/` (send the request, check webhook signatures, look up the payment status) and register it
in `getPaymentProvider`. Checkout and the webhook route don't change.

## Sign in with Google

Shoppers can sign in with Google to keep their bag on every device. Checking out doesn't need an account. Before
signing in they confirm they're 18 or older and accept the terms, which is recorded in `profiles`. Once signed in, the
bag on the device is merged into the saved one. After that, changes are saved within a second, and other devices pick
them up when their tab is next opened. Signing out empties the bag on that device only.

Setup:

1. In Google Cloud Console, create an OAuth client (type "Web application"). Add
   `https://<project-ref>.supabase.co/auth/v1/callback` as an authorised redirect URI (and
   `http://127.0.0.1:54321/auth/v1/callback` for the local stack).
2. Hosted project: Supabase dashboard → Authentication → Sign In / Providers → Google, paste the client ID and secret.
   Local stack: put them in `supabase/.env` (not committed) as `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and
   `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`, then restart with `npx supabase stop && npm run db:start`.
3. Add the site's `/auth/callback` URL to the Supabase redirect URLs (see above).

## Placeholders still to fill in

The design shows values the business hasn't set yet (marked "To be set" in the BRD and PRD) as bracketed text such as
`[X]` or `[Reg. number]`.

- **Delivery fees, estimates, cut-offs and free delivery:** Admin → Delivery. Until a fee is set, checkout shows
  `[fee]` and orders have no total yet.
- **Support contacts and the return window:** Admin → Settings. The help centre shows placeholders until they're set.
- **Display text:** the sale percentage and shopper count are in `pending` in `packages/shared/src/store.ts` (the mobile
  app also reads its delivery days and return window from there). Banner text, including the
  starter "Up To [X]% Off" card, is edited in Admin → Content. FDA number, ingredients, batch and expiry come from the
  catalogue and stock. The placeholders show only for products that don't have them yet.

## Not built yet

- **Real payment, SMS and email providers:** the flows are in place (see [Payments](#payments) and
  [Customer messages](#customer-messages)), but no provider is connected yet. Card shows "coming soon".
- **Accounts:** Google sign-in only; phone-number sign-in (PRD FR-002), editing the profile, signing out of all
  devices, and data export or deletion (FR-057) aren't built. Addresses have no map pin.
- **Admin:** no refunds through a payment provider, finance reports, or supplier and purchase-order records.
- **Policy pages:** the Terms of Service and Privacy Notice (which the sign-in asks shoppers to accept) aren't written.
  Their footer links are placeholders.
- **Photos:** only the seven photos from the design handoff exist so far (`packages/shared/assets/images`, referenced by
  `image_key`). Upload real photos in the admin console.
- **App icons:** still the framework defaults.
