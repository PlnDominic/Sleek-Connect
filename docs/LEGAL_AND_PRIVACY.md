# Legal and privacy: what is built, and what still needs a person

This covers four launch items: company details (39), the terms and privacy notice (40), what the site stores on a visitor's
device and whether consent is needed (42), and the 18+ rule (43). **I am not a lawyer, and nothing here is legal advice.** The
terms and privacy notice were brought up to date with what the store now does, but they need a Ghanaian lawyer's review
before launch (the questions to ask are at the end).

## 39. Company details

The terms, privacy notice, footer and receipts name your company from these variables. A sentence that needs a detail is
left out until it is set, so the pages never show a blank. Set them in **Vercel → Environment Variables → Production** and
redeploy. **Admin → Settings → Company details** shows which are set.

| Variable | What to put | Where it appears |
| --- | --- | --- |
| `BUSINESS_NAME` | the registered name of the company or business | terms, privacy notice, footer, receipts |
| `BUSINESS_REGISTRATION_NUMBER` | the Registrar General's Department registration number | terms |
| `BUSINESS_ADDRESS` | the registered or main business address | terms, privacy notice, footer, receipts |
| `DATA_PROTECTION_REGISTRATION_NUMBER` | your Data Protection Commission registration number (a business that handles personal data must register as a data controller) | privacy notice |
| `BUSINESS_TIN` | your Tax Identification Number from the Ghana Revenue Authority | receipts |
| `PAYMENT_PROVIDER_NAME` | `Hubtel` | terms, privacy notice |

If you don't have the registration numbers yet, getting them is a launch task of its own: Registrar General (company or
business name), Data Protection Commission (data controller registration), GRA (TIN, and VAT registration if your turnover
requires it; ask your accountant what a valid tax invoice must show, since the receipt is not yet a VAT invoice).

## 42. What the site stores on a device, and consent

**Position:** the store sets no advertising or tracking cookies and runs no cross-site trackers, so it shows no cookie banner.
This holds only while the list below stays true. `tests/unit-privacy-guard.cjs` fails if someone adds a tracker, a script from
another site, a cookie of our own, or loosens the analytics settings.

| What | Where | Why | Kept |
| --- | --- | --- | --- |
| Sign-in session (`sb-…-auth-token`) | cookie, set by Supabase when you sign in | keeps you signed in | until you sign out |
| Bag (`sleek-connect:bag:v1`, `bag-sync:v1`) | this device | your bag | until you clear it |
| Saved items (`wishlist:v1`, `wishlist-owner:v1`) | this device | guests' saved items | until cleared |
| Compare list (`compare:v1`) | this device | comparing products | until cleared |
| Recently viewed (`recent:v1`) | this device | "recently viewed" strip | until cleared |
| Recent searches (`recent-searches:v1`) | this device | search suggestions | until cleared |
| Orders placed here (`recent-orders:v1`) | this device | finding your order again (holds the private order links) | until cleared |
| PostHog | **nothing stored** (`persistence: 'memory'`) | anonymous visit statistics | not stored |
| Sentry | nothing stored | error reports | not stored |
| Payment page | its own cookies on Hubtel's site | paying | under Hubtel's notice |

Everything on the device is needed for the store to work, none is shared, and none is used to track you. The privacy notice
says so and explains the visit statistics.

**When a consent banner would be needed:** if you add a returning-visitor identifier (PostHog cookie persistence), session
replay, advertising or retargeting pixels, or any tracker from another company. Do not do any of these without adding a
banner that asks first and a way to change the choice. The mobile app is separate and has neither tool yet.

## 43. The 18+ rule

- Account sign-up asks for "I'm 18 or older and I accept the Terms and Privacy notice" (already built; recorded in `profiles`).
- **Checkout now asks guests the same**, on the website and in the app, and the database refuses the order without it
  (`place_order`). A signed-in shopper who confirmed at sign-up isn't asked again. The moment is stored on the order
  (`orders.adult_confirmed_at`), is part of the shopper's data export, and stays on the anonymised order if the account is
  deleted, as proof the rule was applied.
- This is a confirmation by tick box, not identity or age verification. It is the usual standard for a shop selling to adults
  that is not selling age-restricted goods (alcohol, tobacco, medicines). If you ever stock such products, ask a lawyer what
  verification is required.

## 40. Terms and privacy: what changed, and what a lawyer must check

Brought up to date on 1 November 2026: payment by card on the payment provider's page, **pay on delivery** (cash, confirmation
call, limits, cash refunds paid to Mobile Money), **suppliers** (we are the seller and buy from suppliers who never see shopper details), the 18+ confirmation at checkout, Google sign-in, error reporting and visit
statistics, and what is stored on the device. The help centre's payment answers match.

**Questions for your Ghanaian lawyer** (please confirm the law yourself; the names below are the ones to ask about):

1. **Supplier relationships.** We buy from suppliers and resell, so we are the seller. Should supplier agreements cover warranties on
   authenticity, recalls, expiry and returns of faulty stock?
2. **Consumer protection and returns.** Is the return window (set in Settings), the "opened cosmetics can't be returned"
   rule, and the cancellation and refund wording enough for Ghana's current consumer protection rules?
3. **Electronic commerce disclosures.** Does the Electronic Transactions Act, 2008 (Act 772) require anything more on the site or
   in order confirmations (seller identity, price and tax breakdown, a way to correct mistakes before ordering)?
4. **Data Protection Act, 2012 (Act 843).** Registration as a data controller; the lawful basis wording; retention periods;
   what to tell people about **processing abroad** (Supabase, Vercel, Sentry and PostHog are hosted outside Ghana); and breach
   notification timing.
5. **Payments.** Hubtel is the licensed payment service provider (Payment Systems and Services Act, 2019, Act 987). Does your
   merchant agreement with Hubtel add terms you must pass on, and how should cash on delivery be treated for records?
6. **Tax.** VAT and other levies on sales; what a valid receipt or invoice must show (the receipt now
   prints name, address and TIN when set).
7. **Regulated products.** Cosmetics, baby and kids' products and any food: Food and Drugs Authority registration and labelling
   (Public Health Act, 2012, Act 851), and what you must be able to show for each product.
9. **Reviews and user content.** Wording on moderation and liability for what shoppers post.
10. **Limitation of liability and governing law.** Whether the limits in the terms are enforceable as written.

Once the lawyer has approved, update the text in `apps/web/src/app/terms/page.tsx` and `privacy/page.tsx`, and change
`legalUpdated` in `apps/web/src/lib/legal.ts` (the date shown at the top of both pages).
