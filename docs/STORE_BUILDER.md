# Store builder: opening and setting up a vendor store

This is how a seller gets from "I want to sell here" to a live store. It follows the shape of Etsy's shop opening (a short guided
application, a store you can set up before it is open, a checklist that shows what is left), adapted to this marketplace: the owner
approves every store and every product, a yearly fee keeps the store open, and Sleek Connect delivers the orders.

## The seller's journey

1. **Open your store** (`/vendor`, `StoreWizard`). Five steps in one form: *Name your store* (checked as it is typed, with the web
   address it would get), *About you* (name, email, phone, individual or registered business), *Verify* (ID type, number and a photo
   or scan sent to the private `vendor-ids` bucket), *Get paid* (Mobile Money and tax number; optional here, can be finished later)
   and *Review and agree* (summary, 18+ and the seller terms and product standards).
   `applyForStore` calls `vendor_apply`, records the terms version, then saves the tax details and payout account if they were
   filled in. Anything that doesn't save is left on the checklist.
2. **Set up while you wait.** As soon as the application is sent (status `pending`) the seller can open **Store page**: logo, banner,
   one-line description, announcement, their story, packing time (1 to 14 working days), returns and care, Instagram, website and
   sections. Nothing is public yet. `/vendor` shows the **Set up your store** checklist with a progress bar
   (`lib/store-setup.ts`: application, approval, one-liner, logo, banner, story, returns policy, first product, payout account,
   tax details, seller terms, open).
3. **Approval.** The owner approves the store in Admin → Vendors after the four onboarding checks (`admin_review_vendor`).
4. **Prepare products.** Once approved (`active`) the seller can add products, photos and stock as drafts. They go on sale only when
   the store is live (paid) and the owner has approved each product, exactly as before: `vendor_is_live` and the
   `products_marketplace_rules` trigger decide that, not the page.
5. **Pay the yearly fee and open.** The store becomes public.
6. **Sections.** Up to 12 per store. Products are put in a section from the product's edit page. The public store page shows the
   sections as filters (only those with products).
7. **Vacation mode.** An approved store can be paused (`vendor_set_paused`). While paused, `vendor_is_live` is false, so its
   products, page and sections disappear from the shop. The yearly fee keeps running, and orders already placed must still be packed.

## What the public sees

`getStorefront` adds the announcement (a bar at the top), the story, packing time, Instagram and website links, the returns
policy and the sections. These columns are read apart from the main query, so a database that has not run the store-builder
migration yet still shows the store.

## Database (`20261104090000_store_builder.sql`)

- `vendors`: `announcement`, `returns_policy`, `processing_days`, `instagram`, `website`, `paused_at`, `paused_note`. The first five
  are readable by everyone (they are only exposed for live stores by the row policy); `paused_*` and `owner_id` are not.
- `vendor_name_available(text)`: length, characters, a few reserved words, taken (with a suggestion). The caller's own name counts as free.
- `vendor_update_store`, `vendor_save_section`, `vendor_delete_section`, `vendor_set_product_section`, `vendor_product_sections`,
  `vendor_set_paused`: all `vendor_*` functions for the signed-in vendor only, logged to `audit_log` where it matters.
- `vendor_require_approved()`: approved (not necessarily paid) stores can edit products, photos and stock. Money and orders
  functions still need `vendor_require_live()`.
- Logo and banner uploads are allowed for pending and approved stores (`my_live_vendor_id`).

## Not copied from Etsy, on purpose

- Listing fees and transaction fees: the store pays one yearly fee and the owner adds a markup per product.
- Seller-set shipping profiles: Sleek Connect delivers every order, so delivery fees come from the platform.
- Opening a store without review: every store and product is checked first.
- Payment account verification by a payments provider: payouts go to a Mobile Money wallet the owner pays manually.

## Running it

Run `supabase/migrations/20261104090000_store_builder.sql` in the Supabase SQL editor (or `npm run db:setup:generate` and run
`supabase/setup.sql` on a new project). The web app works before and after it: the new pages simply show fewer fields until it runs.

## More from Etsy (`20261105090000_etsy_extras.sql`)

- **Follow a store.** A Follow button on the store page (the shopper's own state is read in the browser, because the page is cached
  for everyone) and a "Stores you follow" list on the Saved page. `store_follows` has no table access: it goes through
  `follow_store`, `unfollow_store`, `is_following_store` and `my_followed_stores`. Only open stores can be followed, never your own,
  up to 200. Sellers see a count only (`vendor_star_status().followers`), never who. Account deletion removes the follows (cascade)
  and the data export lists them.
- **Seller replies to reviews.** `/vendor/reviews` lists the published reviews on the seller's products; `vendor_reply_to_review`
  adds, changes or (with an empty reply) removes a public reply. Replies show on the product page and the store page. Staff can see
  all replies and remove one (`admin_review_replies`, `admin_remove_review_reply`; Admin → Reviews). The shopper's export includes
  the reply.
- **Star Seller.** A badge on the store page and product page for stores with 10+ delivered orders, 5+ reviews averaging 4.7 or better,
  and no dispute decided against them (or left unanswered past 48 hours) in 90 days. The rules live in `vendor_star_check`; sellers
  see their progress on the overview (`vendor_star_status`) and the public sees only the badge and counts (`store_facts`).
- **Store page extras.** Orders delivered and the year joined, Share (the phone's share sheet, or copy the link), and search and sort
  inside a store once it has more than four products.
- **Product page.** "Packs within N working days" (from the seller's packing time) and "More from this store".

Not copied, on purpose: buyer-to-seller messages and custom or personalised orders (sellers never see shopper details here; the
owner handles shopper contact), gift cards, seller-run coupons and sales (prices are the owner's markup), and Etsy Ads.
