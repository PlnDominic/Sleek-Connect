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

## Running orders, money and messages

Added in `20261027090000_vendor_fulfilment.sql`, `20261027100000_vendor_money_and_messages.sql`,
`20261027110000_store_discovery_reports.sql` and `20261027120000_vendor_subscription_payments.sql`.

### Fulfilment (vendors pack, Sleek Connect delivers)

- Vendors hand their items to Sleek Connect; one rider delivers the whole order. When an order line is created for a
  vendor, `order_items_shipment` makes an `order_shipments` row (`pending` → `packed` → `collected`).
- `vendor_orders()` lists only **paid** orders, with only that vendor's lines at the vendor's own prices. It carries no
  shopper name, phone, address, delivery code or order token. `vendor_mark_packed` is the vendor's only write.
- Staff pick and pack only the shop's own lines (`admin_pick_list`). `admin_pack_orders` refuses to pack an order while a
  vendor is still packing ("Waiting for … to pack their items."). Operations staff then collect the bag
  (`admin_collect_vendor_items`, **Admin → Vendors → Pickups**), and `admin_dispatch_order` refuses until every vendor's
  items are collected.
- Stock: `place_order` reserves vendor stock and `confirm_payment` takes it, exactly as for our own range. Cancelling or
  receiving a returned vendor item puts it back into the **vendor's** stock (`return_order_batches`).

### Delivery fees

An order has **one** delivery fee, however many vendors are in it. That is the owner's decision: the fee is the owner's
income and the owner's rider does the delivery. Nothing changes in `place_order`.

### Money

- A vendor earns `vendor_unit_price_ghs × quantity` for each line once the order is **delivered**. A received
  (or refunded) return comes off, at the vendor's price: **the vendor bears the cost of returns** on their products.
  `vendor_balance(vendor)` returns `earned`, `returned`, `paid`, `pending` (paid but not yet delivered) and `balance`.
- Finance records each payment to a vendor in **Admin → Vendors → Payouts** (`admin_record_payout`). It needs the Mobile
  Money transaction reference, can't exceed the balance, is audited and is texted to the vendor. The vendor sees their
  statement at `/vendor/earnings` and saves where to be paid (`vendor_set_payout_account`; stored in `vendor_private`).
- Sleek Connect does not send the money itself; the owner pays by Mobile Money and records it.

### Notifications and reminders

`queue_vendor_message` writes SMS and email rows to `notifications` (with `vendor_id`; there is no order) for: application
received, approved, rejected, suspended, subscription paid, product approved or rejected, new paid order, order cancelled
after payment, payout sent, owner replied, and renewal reminders (30, 7 and 1 days before, on the day, and the day after;
`queue_vendor_renewal_reminders`, pg_cron at 08:00 UTC). Messages are rendered in `lib/notifications/templates.ts` and sent
by the same dispatcher as customer messages.

### Messages

Vendors and the owner talk in `vendor_messages` (`/vendor/messages`, **Admin → Vendors → Messages**). Only admins read
conversations. A reply texts the vendor.

### Discovery and reports

- `/stores` lists open vendor stores that have something on sale (`store_directory`). Storefronts show a rating and recent
  reviews (`store_rating`, `store_reviews`): the average of **published** reviews of that store's products, with no account
  ids. The mobile app shows "Sold by" on a product and opens the storefront.
- `/vendor/reports` shows sales by day and best sellers (`vendor_report`), at the vendor's own prices.
- `/vendor/products/import` adds up to 200 products from a CSV (template at `/vendor/products/import/template`). Rows go
  through `vendor_save_product`, so every rule still applies and each product still needs photos and the owner's approval.
- When a vendor changes an approved product's name, brand, department, category, summary, description or ingredients,
  `products.review_previous` keeps the earlier values so the review queue shows what changed. It is cleared on decision.

### Paying the subscription online

`start_vendor_subscription_payment` (vendor) records an attempt for the fee in settings; the provider's verified
notification reaches `confirm_subscription_payment` (server only) through the payment webhook, for references that start
with `SUB-`. A matching payment adds a year; a different amount is audited and **does not** renew. **This only moves real
money once a real payment provider is added to `lib/payments`** (only the `test` provider exists). Until then the owner's
payment instructions and **Record payment** still work.

## Before turning on vendor orders

Vendor products still **cannot be bought** while "Shoppers can order vendor products" is off. Before turning it on:
a real SMS provider (so vendors hear about orders), at least one rehearsal order through packing, collection, delivery,
a return and a payout, and a decision on the payout schedule you will tell vendors.

## Things to know

- Staff editing a vendor product in the admin console can't change its price directly: the price always follows the
  vendor's price and markup.
- The nightly job `refresh-vendor-products` runs at 00:10 UTC (pg_cron). Catalogue pages are cached for a few minutes,
  so an expiry can take a few minutes longer to show on the site.
- Vendors can only be approved or suspended by an admin. The vendor is texted and emailed about each decision once SMS
  and email providers are set up.
- The admin Vendors page is admin-only. Its database functions also accept operations (pickups) and finance (payouts).

- Vendor IDs live in the private `vendor-ids` bucket under `<user id>/`. Applicants can write and read only their own folder; admins
  open them through short-lived signed links in Admin → Vendors. The vendor never sees their ID number again, and the file
  is removed through the Storage API when the account is deleted.
