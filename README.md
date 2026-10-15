# Sleek Connect

Storefront for authentic beauty products and safe, age-appropriate kids' products, delivered across Accra.
Business and product requirements live in [`docs/`](docs/) (BRD and PRD, v0.1 drafts).

Stack: **Node.js + Next.js** for the web store, **Supabase** for the database and API, and **React Native with
Expo** for the mobile app (App Store and Google Play, tested in Expo Go). The web store is being built first.

| Workspace | What it is | Status |
| --- | --- | --- |
| [`apps/web`](apps/web) | Next.js 16 storefront: Home, Shop by age, Product detail, Bag, Checkout, Account | Active. Reads the catalogue from Supabase, reserves stock and places orders there |
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

To try payments locally, also set these in `apps/web/.env.local` (see [Payments](#payments)):

```sh
SUPABASE_SECRET_KEY=...        # SECRET_KEY printed by `npx supabase status`
PAYMENT_PROVIDER=test
PAYMENT_WEBHOOK_SECRET=...     # any long random string, e.g. `openssl rand -hex 24`
```

Google sign-in needs a Google OAuth client; see [Sign in with Google](#sign-in-with-google). Everything else works
without it.

Checks:

```sh
npm run typecheck
npm run lint
npm run build:web
```

## Connect a hosted Supabase project

1. Create a project in the Supabase dashboard.
2. Link it and push the schema plus the starter catalogue:

   ```sh
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push --include-seed
   ```

3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Project Settings → API) in
   `apps/web/.env.local` and in your hosting provider. When a payment provider is connected, also set
   `SUPABASE_SECRET_KEY`, which only the server-side payment code reads. Never give it a `NEXT_PUBLIC_` name.
4. In Authentication → URL Configuration, set the Site URL to your live address and add
   `https://<your-domain>/auth/callback` (and `http://localhost:3000/auth/callback` for local work) to the redirect URLs.

## Deploy on Vercel

In the Vercel project settings:

- **Root Directory:** `apps/web` (the repository root has no Next.js app, so building from it returns 404 pages).
- **Production Branch:** `main`.
- **Environment Variables:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, plus
  `SUPABASE_SECRET_KEY`, `PAYMENT_PROVIDER` and the provider's secrets once payments are connected.

The build reads the catalogue from Supabase, so the Supabase variables must be set before the first deploy.

## Database overview

| Table | Purpose | Who can read it |
| --- | --- | --- |
| `products`, `product_sizes`, `product_age_bands`, `categories`, `age_bands` | Catalogue | Everyone (published products only) |
| `merchandising_slots` | Ordered product lists such as `home_new_arrivals`, `home_best_sellers`, `product_related` | Everyone |
| `delivery_areas`, `delivery_options` | Where you deliver and what it costs | Everyone |
| `inventory_levels` | Stock per product and size: `on_hand` and `reserved` | Everyone sees only `in_stock`; counts are staff-only |
| `store_settings` | `reservation_minutes`: how long unpaid orders hold stock (15) | Everyone |
| `orders`, `order_items` | Orders and what was bought | The signed-in shopper who placed them; staff via the dashboard |
| `payments` | Each payment attempt, its provider reference, amount and status | Staff only |
| `profiles` | When a shopper confirmed they're 18+ and accepted the terms | The shopper |
| `bag_items` | Signed-in shoppers' saved bags | The shopper |

- The catalogue isn't writable through the public API. Edit it in the Supabase dashboard (Table Editor); changes show
  on the site within a minute or two.
- Checkout calls `place_order`, which checks the details, prices every line from the database, reserves the stock and
  creates an order with status `pending_payment`.
- Schema changes go in new migrations: `npx supabase migration new <name>`, then `npm run db:reset` and
  `npm run db:types`.
- To change the starter catalogue, edit `packages/shared/src/catalog.ts` and run `npm run db:seed:generate`.

## Stock

Set stock in `inventory_levels.on_hand` (one row per product, or per size for products with sizes). Products and sizes
with nothing available show "Sold out" and can't be added to the bag.

Placing an order reserves its items, so two shoppers can't buy the last unit. The reservation lasts
`store_settings.reservation_minutes` (15). If payment fails, or the time runs out (a database job checks every
minute), the order is cancelled and the items go back on sale. A successful payment turns the reservation into a sale.

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

- **Delivery fees:** set `fee_ghs` in the `delivery_options` table. Checkout then shows real delivery fees and totals,
  and orders store them.
- **Display text:** free-delivery threshold, sale percentage, delivery days and cut-off times, return window, FDA
  registration, batch and expiry, and the ingredient list are in `pending` in `packages/shared/src/store.ts`.

## Not built yet

- **A real payment provider:** the payment flow is in place (see [Payments](#payments)) but no Mobile Money or card
  provider is connected yet. Card shows "coming soon".
- **Accounts:** Google sign-in only; phone-number sign-in (PRD FR-002) and order history aren't built.
- **Admin:** there's no admin console yet; staff use the Supabase dashboard.
- **Pages the design doesn't cover:** listing, category, search results, order tracking on the web, help and policy
  pages (including the Terms of Service and Privacy Notice the sign-in asks shoppers to accept). Links to them are
  placeholders.
- **Photos:** the handoff included seven photos (`packages/shared/assets/images`, referenced by `image_key`). Other
  products use a tinted placeholder until real photography is added.
- **App icons:** still the framework defaults.
