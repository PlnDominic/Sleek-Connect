# Sleek Connect Store – working notes

## Git

- Always commit and push to `main`. Don't create feature branches or pull requests unless asked.

## Stack and priorities

- **Web first.** `apps/web` is Next.js 16 on Node.js, backed by Supabase. Build web features before mobile ones.
- **Supabase** is the backend: Postgres with row level security, migrations in `supabase/migrations`.
- **Mobile later.** `apps/mobile` is React Native with Expo (Expo Router), targeting the App Store and Google Play.
  It is tested in **Expo Go**, so only use libraries bundled in Expo Go (install them with `npx expo install`) and keep
  the Expo SDK on the version Expo Go supports. The mobile app still reads the bundled catalogue in
  `packages/shared`; move it to Supabase when mobile work starts.
- `packages/shared` holds tokens, icons, types, the starter catalogue and the bag provider used by both apps.

## Database rules

- Change the schema only through new migrations: `npx supabase migration new <name>`, then `npm run db:reset`
  and `npm run db:types` to refresh `apps/web/src/lib/supabase/database.types.ts`.
- `supabase/seed.sql` is generated from `packages/shared/src/catalog.ts` with `npm run db:seed:generate`; don't edit it
  by hand.
- Orders are created only by the `public.place_order` function, which prices lines from the database. Never trust
  prices sent by a client.
- The web app uses the publishable key, except the server-side payment and messaging code (`apps/web/src/lib/payments`,
  `apps/web/src/lib/notifications`, the payment webhook), which reads `SUPABASE_SECRET_KEY` through
  `lib/supabase/admin.ts` (`server-only`). Never use the secret key anywhere else, in client code, or in `NEXT_PUBLIC_*`
  variables.
- Staff changes go only through `public.admin_*` functions, which call `public.require_staff(...)` (active staff with a
  confirmed email, plus the role) and log to `stock_movements` / `audit_log`. Staff sign in with Google or an email and
  password; there is no two-step verification step, by the owner's choice. The admin console runs as the signed-in
  staff member; never give it the secret key.
- Staff must never read `orders.delivery_code` or `orders.public_token` (the proof of delivery). Those columns have no
  select grant; when you add a column to `orders`, add it to the column grant in a migration, and list columns
  explicitly in staff queries (no `select *`).
- After adding a migration or changing the seed, run `npm run db:setup:generate` to refresh `supabase/setup.sql`.
- Orders become paid only through `public.confirm_payment`, after the webhook has verified the provider's
  notification. Stock is reserved by `place_order` and released by `release_order_reservation`.
- The order token must not reach anything staff can read either. Return photos are stored under
  `public.return_photo_folder(token)` (a hash), not the token.
- Shoppers can export and delete their own data only through `public.export_my_data` and `public.delete_my_account`
  (orders are anonymised, not deleted). When you add a table or column holding shopper data, add it to both. Return photo
  files are removed through the Storage API by the delete action, never by deleting `storage.objects` rows.
- Product reviews reach the public only through `get_product_reviews` / `get_review_summary` (published ones, no account
  ids). Anything that changes what reviews are visible must call `updateTag('catalog')`.
- Anonymous functions that send customer messages or reveal orders (`create_support_case`, `find_order`) are rate
  limited in the database. Keep that in mind for any new public function that queues an SMS.

## Caching (web)

- Catalogue reads are `'use cache'` functions tagged `catalog`; admin server actions call `updateTag('catalog')`.
- In a component that reads `searchParams` (a dynamic hole), await `searchParams` before calling cached functions.
  Otherwise the build-time result is frozen into the page shell and replayed once after staff change the catalogue.

- Storage buckets: `product-images` is public (only catalogue staff write to it, under `<product id>/`); `return-photos` is
  private. Files are added and removed through the Storage API (never by deleting rows in `storage.objects`), and the
  matching table row goes through an `admin_*` or shopper function.

## Checks before pushing

```sh
npm run typecheck
npm run lint
npm run build:web        # needs Supabase env vars in apps/web/.env.local
npm test                 # all suites against the local stack; `npm test -- db` for the database ones only
```

Add or extend a suite in `tests/` for every feature (database rules in `db-*.cjs`, screens in `e2e-*.cjs`) and register
new files in `tests/run-all.sh`. GitHub Actions (`.github/workflows/ci.yml`) runs the same checks on every push.

Next.js 16 differs from older versions; read `node_modules/next/dist/docs/` before using unfamiliar APIs
(see `apps/web/AGENTS.md`). Expo guidance is in `apps/mobile/AGENTS.md`.
