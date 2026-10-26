# Marketplace: vendor storefronts

Sleek Connect is also a marketplace. Vendors open their own storefronts and list their own products; the owner adds a
markup and collects every payment.

## How it works

1. **Apply.** A signed-in shopper opens `/sell`, then `/vendor`, and applies with the store name, their full name, email,
   phone, an ID (type, number and a photo or scan, uploaded to the private `vendor-ids` bucket) and the vendor terms.
   Staff accounts can't open a store.
2. **Approve.** The owner approves or rejects the application in **Admin → Vendors**.
3. **Subscribe.** An approved vendor sees the yearly fee and the owner's payment instructions on `/vendor`. When the
   money arrives, the owner records it under the vendor (**Record payment**). One payment buys one year; a renewal
   starts the day after the current year ends. Until a payment is recorded the store is not live and the vendor can't
   add products.
4. **List products.** The vendor adds products at `/vendor/products/new` with *their own* price, photos and stock.
5. **Review and markup.** Each new product waits in **Admin → Vendors → Products to review**. The owner sets a
   markup percentage and approves it. The shopper price is `vendor price + markup`, rounded to pesewas, and the same
   markup applies to every size. Editing the name, brand, department, category, summary, description or ingredients
   sends a product back for review; changing prices or stock does not.
6. **Shoppers.** Approved products appear in the main shop, search and department pages like any other product, with
   "Sold by …" on the product page, and in the vendor's storefront at `/store/<slug>`.

When the subscription (plus grace days) ends, the store and its products disappear from the site until it is renewed.
A nightly job re-checks this, and every approval, payment or settings change re-checks it straight away.

## The rules in the database

All of this lives in `supabase/migrations/20261025090000_marketplace_vendors.sql`.

| Thing | Where |
| --- | --- |
| Stores | `vendors` (public columns only; `owner_id` has no select grant), `vendor_private` (owner's name, phone, email, ID type, number and file path, owner's note), `vendor_subscriptions` (paid years) |
| The shop's own range | A built-in **house** vendor (`is_house`). Existing products belong to it and behave exactly as before. |
| Live store | `vendor_is_live(id)`: status `active` and a paid period covering today (plus `store_settings.vendor_grace_days`). The house vendor is always live. |
| Visibility | `products.is_published` is still the only flag the site reads. For vendor products the trigger `products_marketplace_rules` sets it to *vendor asked to publish* AND *owner approved* AND *store live*, and sets `price_ghs` from `vendor_price_ghs` and `markup_percent`. |
| Vendor actions | `vendor_apply`, `vendor_me`, `vendor_update_store`, `vendor_save_product`, `vendor_set_stock`, `vendor_delete_product`, `vendor_add_product_image`, `vendor_remove_product_image`, `vendor_my_products`. Each works only on the caller's own store, and editing needs a live store. |
| Owner actions | `admin_vendors`, `admin_review_vendor`, `admin_record_subscription`, `admin_vendor_products`, `admin_review_product`, `admin_set_marketplace_settings` (admin role only; all audited). |
| Photos | Logos and banners go to the public `vendor-assets` bucket under `<vendor id>/`; product photos go to `product-images` under the vendor's own product ids. |
| Orders | `order_items` records `vendor_id`, `vendor_unit_price_ghs` (what the vendor is owed) and `markup_unit_ghs` (the owner's share). `place_order` is unchanged. |
| Shopper data | `export_my_data` includes the vendor store; `delete_my_account` closes the store (suspended, contact details removed); `account_deletion_blocker` blocks while the store has orders in progress. |

The vendor's own price and the markup are never shown to other vendors or the public: shoppers only ever see
`products.price_ghs`. A vendor sees their own price, and sees the shopper price only after approval.

## Settings (Admin → Vendors → Marketplace settings)

- Yearly fee, grace days after the year ends, and payment instructions shown to approved vendors.
- Suggested markup (pre-filled when reviewing a product).
- **Shoppers can order vendor products**: off by default.

## What is not built yet

Vendor products are visible but **cannot be bought** while "Shoppers can order vendor products" is off; `place_order`
refuses them with "Ordering from vendor stores opens soon." Before turning it on, build:

1. Splitting an order's fulfilment by vendor: vendors see only their own paid order lines, mark them packed and hand
   them to a rider; delivery codes and proof of delivery must stay hidden from vendors, as they are from staff.
2. Payouts: what each vendor is owed is already recorded per order line (`vendor_unit_price_ghs × quantity`); add a
   payout ledger, a statement per vendor and a "mark as paid" action.
3. Returns and refunds on vendor products (who bears the cost, and restocking into the vendor's stock).
4. Delivery fees for orders that contain products from several vendors.
5. Self-serve subscription payment (Mobile Money or card) through the existing payment provider instead of the owner
   recording payments by hand.
6. The mobile app: a "Sold by" line and vendor storefronts.

## Things to know

- Staff editing a vendor product in the admin console can't change its price directly: the price always follows the
  vendor's price and markup.
- The nightly job `refresh-vendor-products` runs at 00:10 UTC (pg_cron). Catalogue pages are cached for a few minutes,
  so an expiry can take a few minutes longer to show on the site.
- Vendors can only be approved or suspended by an admin; there is no vendor-facing notification yet, so the owner
  should phone or email the vendor after approving or recording a payment.

- Vendor IDs live in the private `vendor-ids` bucket under `<user id>/`. Applicants can write and read only their own folder; admins
  open them through short-lived signed links in Admin → Vendors. The vendor never sees their ID number again, and the file
  is removed through the Storage API when the account is deleted.
