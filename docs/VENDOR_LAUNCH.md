# Vendors and the marketplace: launch guide

Run `supabase/migrations/20261103090000_vendor_launch.sql` once (Supabase → SQL Editor). Until you do, the new vendor pages
show nothing extra and approving a store or product fails (the checks aren't in the database yet).

## What each launch item became

| # | Item | What is built | Where |
| --- | --- | --- | --- |
| 11 | Vendor order rehearsal | A live **Launch checklist** (readiness read from your settings) and the rehearsal steps below | Admin → Vendors → Launch checklist |
| 12 | Onboarding checks | A checklist you tick before approving (ID matches the person, ID valid, phone confirmed by a call, products allowed; optional: address, business documents). The database refuses approval until the four required ones are ticked, refuses a rejection or suspension without a reason, and keeps every decision (who, when, why, with the checks) | Admin → Vendors → each application |
| 13 | Vendor terms | Full seller terms at `/sell/terms` (fee, prices and markup, orders, payouts and tax, returns and disputes, prohibited products, conduct, suspension, responsibility). The version a vendor accepted is recorded; when the terms change, vendors are asked to accept again | `/sell/terms`, vendor Help page |
| 14 | Payouts | Decided and enforced: **Mobile Money, weekly on Fridays**, earnings payable **7 days after delivery** (so a return can still be asked for), **smallest payout GH₵ 50** (unless it clears everything), a **tax number is required**. All four are settings | Marketplace settings, Payouts tab |
| 15 | Subscription rehearsal | Steps below; the Launch checklist flags missing payment setup | Launch checklist |
| 16 | Product standards | Written standards at `/sell/standards` and an eight-point approval checklist you tick for each vendor product (photos, description, claims, ingredients, expiry, authenticity, registration, safety), kept on the product | Products to review tab |
| 17 | Disputes | A case workflow: you open it from a shopper's report, the vendor has 48 hours to reply, you decide (upheld, partly upheld, dismissed) and may charge the vendor up to their share of the item; a second upheld **counterfeit** case means suspending the store | Admin → Vendors → Disputes; vendor Disputes page |
| 18 | Vendor support | A vendor Help page (your contacts, the promised reply time, links to the rules), a settable reply time (default 24 hours), and overdue conversations flagged for you | Vendor Help; Messages tab |
| 19 | Vendor analytics | Product page views (a daily count per product, no visitor data) and conversion (orders per view) on the vendor's Sales reports | Vendor → Sales reports |
| 20 | Vendor tax | Legal name, individual or business, TIN and registration number, entered by the vendor (Earnings) or by you from paperwork; payouts need it; a yearly payout summary per vendor is available to finance | Vendor Earnings; `admin_vendor_tax_summary` |

## Decisions to confirm (they are settings, so you can change them)

- **Hold after delivery: 7 days.** Matches a typical return window; set it to your return window.
- **Smallest payout: GH₵ 50**, **reply time: 24 hours**, **dispute reply: 48 hours** (the 48 hours is in the seller terms and database).
- **A negative balance** (a dispute charge bigger than what is owed) is taken from future earnings; no payout until it is positive.
- **Two upheld counterfeit cases suspend the store.** The system counts and warns you; you press Suspend.

## Rehearsals (do these once, with real small amounts, before opening vendor orders)

Make a test vendor with your own email and phone (a second Google account works).

### 1. A vendor order, start to finish
1. Apply as the test vendor (Sell on Sleek Connect). In Admin → Vendors tick the four checks and approve.
2. Pay or record the yearly fee, add a cheap product with stock, and approve it with the eight checks and a markup.
3. Turn on "Shoppers can order vendor products". As a shopper, buy it with a real small payment.
4. The order is paid, the vendor sees it (no shopper details), packs and marks it packed. On Pickups mark it collected, dispatch, deliver with the code.
5. The vendor's Earnings show the delivery. Turn ordering off again until you are happy.
**Pass when:** every message arrived, stock moved, and nothing about the shopper was visible to the vendor.

### 2. A payout
1. The test vendor saves a Mobile Money payout account and their tax details.
2. Set "Hold after delivery" to 0 for the test (or wait the days). In Payouts you see the amount payable.
3. Send the money by Mobile Money, then record it with the transaction ID. Try an amount over what is payable (refused) and one under GH₵ 50 (refused).
4. Put the hold back to 7.
**Pass when:** the vendor was texted, the balance fell, and the refusals worked.

### 3. Subscription: pay, renew, lapse
1. As the test vendor pay the yearly fee online (needs Hubtel live). The store opens and the vendor is told.
2. Record a second payment near the end of the year: the new year starts when the old one ends.
3. Record a payment that ended yesterday and wait out the grace days (or set them to 0): the store and its products leave the site; the vendor was reminded before.
**Pass when:** each step changed what the site shows, and the vendor was told each time.

## Still for you or a lawyer

- Have a Ghanaian lawyer review `/sell/terms` (docs/LEGAL_AND_PRIVACY.md lists the marketplace questions).
- Decide who calls new applicants, and how long you promise for approval.
- The "Pay by Friday" habit: put a weekly reminder in your calendar; there is no automatic payout.
