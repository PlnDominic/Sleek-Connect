# Sleek Connect

Storefront for authentic beauty products and safe, age-appropriate kids' products, delivered across Accra.
Business and product requirements live in [`docs/`](docs/) (BRD and PRD, v0.1 drafts).

Stack: **Node.js + Next.js** for the web store, **Supabase** for the database and API, and **React Native with
Expo** for the mobile app (App Store and Google Play, tested in Expo Go). The web store is being built first.

| Workspace | What it is | Status |
| --- | --- | --- |
| [`apps/web`](apps/web) | Next.js 16 storefront: Home, Product detail, Checkout | Active. Reads the catalogue from Supabase and places orders there |
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

`npm run db:start` applies the migrations and loads `supabase/seed.sql`, the starter catalogue from the design.

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
   `apps/web/.env.local` and in your hosting provider. Only the publishable key is needed; never use the secret key in
   the web app.

## Database overview

| Table | Purpose | Who can read it |
| --- | --- | --- |
| `products`, `product_sizes`, `product_age_bands`, `categories`, `age_bands` | Catalogue | Everyone (published products only) |
| `merchandising_slots` | Ordered product lists such as `home_new_arrivals`, `home_best_sellers`, `product_related` | Everyone |
| `delivery_areas`, `delivery_options` | Where you deliver and what it costs | Everyone |
| `orders`, `order_items` | Orders and what was bought | The signed-in shopper who placed them; staff via the dashboard |

- Nothing is writable through the public API. Edit the catalogue in the Supabase dashboard (Table Editor); changes show
  on the site within a few minutes.
- Checkout calls `place_order`, which checks the details, prices every line from the database and creates an order
  with status `pending_payment`.
- Schema changes go in new migrations: `npx supabase migration new <name>`, then `npm run db:reset` and
  `npm run db:types`.
- To change the starter catalogue, edit `packages/shared/src/catalog.ts` and run `npm run db:seed:generate`.

## Placeholders still to fill in

The design shows values the business hasn't set yet (marked "To be set" in the BRD and PRD) as bracketed text such as
`[X]` or `[Reg. number]`.

- **Delivery fees:** set `fee_ghs` in the `delivery_options` table. Checkout then shows real delivery fees and totals,
  and orders store them.
- **Display text:** free-delivery threshold, sale percentage, delivery days and cut-off times, return window, FDA
  registration, batch and expiry, and the ingredient list are in `pending` in `packages/shared/src/store.ts`.

## Not built yet

- **Payments:** orders are recorded as `pending_payment`, but no Mobile Money or card provider is connected, so no
  payment prompt is actually sent. Card shows "coming soon".
- **Accounts:** phone-number sign-in (PRD FR-002) isn't built yet. Orders are placed as guest orders.
- **Admin:** there's no admin console yet; staff use the Supabase dashboard.
- **Pages the design doesn't cover:** listing, category, search results, order tracking on the web, help and policy
  pages. Links to them are placeholders.
- **Photos:** the handoff included seven photos (`packages/shared/assets/images`, referenced by `image_key`). Other
  products use a tinted placeholder until real photography is added.
- **App icons:** still the framework defaults.
