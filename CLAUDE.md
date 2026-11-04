# Sleek Connect Store – working notes

## Git

- Always commit and push to `main`. Don't create feature branches or pull requests unless asked.

## Stack and priorities

- **Web first.** `apps/web` is Next.js 16 on Node.js, backed by Supabase. Build web features before mobile ones.
- **Supabase** is the backend: Postgres with row level security, migrations in `supabase/migrations`.
- **Mobile later.** `apps/mobile` is React Native with Expo (Expo Router), targeting the App Store and Google Play.
  It is tested in **Expo Go**, so only use libraries bundled in Expo Go (install them with `npx expo install`) and keep
  the Expo SDK on the version Expo Go supports. The mobile app reads the catalogue from Supabase with the
  publishable key (`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `apps/mobile/.env.local`; see
  `.env.example`), mapping rows with the same `productFromRow` as the web store. It signs shoppers in, calls
  `place_order` itself (prices still come from the database), asks the website's `POST /api/payments/start` to send the
  Mobile Money prompt (the secret key stays on the server), tracks orders with `get_order`/`my_orders`, and gets push
  notifications through `register_push_device` and the dispatcher's `push` channel. Release notes: `docs/MOBILE_RELEASE.md`.
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
- **Suppliers, not seller accounts** (`docs/SUPPLIERS.md`): Hubtel does not allow collecting payments on behalf of sellers without a Bank of Ghana
  aggregator licence, so Sleek Connect buys from suppliers (`vendors.is_supplier`, no owner, no sign-in) and resells; the shopper's money is Sleek Connect's.
  Staff manage suppliers only through `admin_*supplier*` functions (Admin → Suppliers). `store_settings.vendor_accounts_open` is **off** and
  `vendor_apply` refuses while it is off; don't switch it on, or build new seller-facing features, unless the payment model changes. Don't describe
  Sleek Connect as collecting money "for" or "on behalf of" vendors in any shopper- or seller-facing text.
- Marketplace (see `docs/MARKETPLACE.md`): vendors own `products.vendor_id` (the built-in house vendor owns the shop's
  own range). A vendor product's `price_ghs` and `is_published` are computed by the `products_marketplace_rules` trigger
  from the vendor's price, the owner's markup, the owner's approval and a live (approved + paid) store, so never set them
  for vendor products. Vendors change things only through `public.vendor_*` functions, the owner through `admin_*`
  (admin role). Never expose `vendors.owner_id`, `vendor_private` (it holds applicants' IDs; the `vendor-ids` bucket is private), `vendor_price_ghs` or `markup_percent` to the public,
  and keep ordering from vendor stores behind `store_settings.marketplace_orders_open` until you have rehearsed an order end to end.
  Vendors see only their own paid lines (`vendor_orders`), never shopper details or delivery codes; they only pack
  (`vendor_mark_packed`), staff collect (`admin_collect_vendor_items`) and dispatch is blocked until then. Vendor money is
  `vendor_balance`/`admin_record_payout` (finance, reference required, never above the balance). Subscription payments are
  confirmed only by `confirm_subscription_payment` from the webhook (references starting `SUB-`). Messages to vendors go
  through `queue_vendor_message`, never directly into `notifications`.
  Launch rules (`docs/VENDOR_LAUNCH.md`): a store is approved only through `admin_review_vendor` after the four onboarding checks
  (`admin_save_vendor_checks`), and every decision is kept in `vendor_decisions`; a vendor product is approved only with the
  eight checks passed to `admin_review_product`. Payouts are limited to `vendor_balance(...)->>'payable'` (earnings older than
  `vendor_payout_hold_days`), at least `vendor_min_payout_ghs`, and need the vendor's TIN. Disputes (`vendor_disputes`) are
  reached only through their functions and charge the vendor's balance; vendors never see shopper details in them. Product
  views are a daily count only (`record_product_view`): never store who viewed.
- `products`, `product_sizes` and `order_items` are readable **column by column** (migration `20261109090000`): the vendor's own price,
  the owner's markup and the review notes are never granted to `anon` or `authenticated`. The shop reads products with the explicit
  `productSelect` in `packages/shared/src/rows.ts` (never `select('*')`). When you add a column to one of these tables that the shop
  needs, add it to `productSelect` and `grant select (col) on public.<table> to anon, authenticated`.
- Store builder (`docs/STORE_BUILDER.md`): a pending or approved store can edit its profile (`vendor_update_store`, sections,
  logo/banner); approved but unpaid stores may prepare products through `vendor_require_approved()`, but nothing is public until
  `vendor_is_live` (approved, paid, not paused). Pausing goes through `vendor_set_paused`. Keep the store-builder columns out of the
  main storefront query's required fields so the site still works before the migration has run.
- Following stores, seller replies and Star Seller (`docs/STORE_BUILDER.md`): `store_follows` is reached only through `follow_store` /
  `unfollow_store` / `my_followed_stores` (sellers see a count, never who); sellers answer reviews only through
  `vendor_reply_to_review` and staff can remove a reply; the Star Seller rules live in `vendor_star_check`, never in the pages. Anything that
  changes replies must call `updateTag('catalog')`. New shopper data goes into `export_my_data`.
- Promo codes: the `promotions` table has no direct grants. Staff (admin and finance) manage codes only through `admin_list_promotions` /
  `admin_save_promotion` / `admin_set_promotion_active` / `admin_delete_promotion` (Admin → Promotions, audited); shoppers get a code applied
  only by `apply_order_promotion`, one code per order.
- Online orders become paid only through `public.confirm_payment`, after the webhook has verified the provider's
  notification. Stock is reserved by `place_order` and released by `release_order_reservation`.
- Pay on delivery (`payment_method = 'cod'`, cash to the rider, no bank option; see `docs/PAY_ON_DELIVERY.md`): `place_order`
  holds the stock for `pay_on_delivery_hold_hours`; staff confirm it with `admin_confirm_cod_order` (reservation becomes a
  sale, status `paid`, `cod_confirmed_at` set, `paid_at` stays empty); `admin_mark_delivered(..., p_cash_collected)` records the
  cash (a `payments` row with provider `cash`, `paid_at`, `cash_collected_ghs`). Nothing else may set `paid_at` for a
  `cod` order, so revenue counts when the cash is in hand and cancelled orders never show a refund due. COD is refused for
  vendor-store items, above `pay_on_delivery_max_ghs`, or when the fee is unknown.
- Online payment goes through the provider interface in `apps/web/src/lib/payments` (`PAYMENT_PROVIDER=hubtel` for Mobile Money
  and cards on Hubtel's hosted checkout, `test` for development; see `docs/HUBTEL.md`). A callback is never trusted on its
  own: Hubtel's has no signature, so its address carries a secret and `verify()` asks Hubtel's status API before
  `confirm_payment` runs. Keep `HUBTEL_API_KEY` server-only.
- Sentry and PostHog (`docs/SENTRY_POSTHOG.md`) receive only what `lib/telemetry/scrub.ts` lets through: no order tokens
  (`/orders/<token>` proves ownership), phone numbers, email addresses, cookies or request bodies, and no analytics from
  `/admin` or `/vendor`. Send named events with labels and numbers only (`lib/analytics-client.ts`, `lib/analytics.ts`);
  `logger.error` reports to Sentry.
- The order token must not reach anything staff can read either. Return photos are stored under
  `public.return_photo_folder(token)` (a hash), not the token.
- Shoppers can export and delete their own data only through `public.export_my_data` and `public.delete_my_account`
  (orders are anonymised, not deleted). When you add a table or column holding shopper data, add it to both. Return photo
  files are removed through the Storage API by the delete action, never by deleting `storage.objects` rows.
- Product reviews reach the public only through `get_product_reviews` / `get_review_summary` (published ones, no account
  ids). Anything that changes what reviews are visible must call `updateTag('catalog')`.
- Emails go out through `lib/notifications` (`EMAIL_PROVIDER=gmail` uses Nodemailer and an App Password; keep
  `GMAIL_APP_PASSWORD` server-only). The store-alert copy (`STORE_ALERT_EMAIL`) must never contain `delivery_code` or the
  order token link.
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
