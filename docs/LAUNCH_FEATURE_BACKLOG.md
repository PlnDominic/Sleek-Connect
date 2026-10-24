# Sleek Connect Launch Feature Backlog

**Target branch:** `main`  
**Purpose:** Define the minimum feature and production-readiness scope before launching the storefront publicly.

The repository already contains many of these capabilities in an initial form. Each item must be verified end-to-end against the hosted Supabase project and production deployment; items marked **Build** require implementation or completion, while **Verify** requires a production-grade test, configuration check, or hardening pass.

## P0 — Required before public launch

1. **Build — Hosted database migration deployment:** Apply every migration, including the reviews RPC migration, to the production Supabase project.
2. **Build — Database schema verification:** Add a repeatable check that confirms all required tables, functions, grants, indexes, and RLS policies exist in production.
3. **Build — Production environment validation:** Validate every required Vercel and Supabase environment variable at startup without exposing secret values.
4. **Build — Production build gate:** Make `typecheck`, `lint`, tests, and `next build` mandatory before deployment.
5. **Build — Error and not-found pages:** Add branded 404, 500, route error, and loading states for storefront, account, checkout, and admin routes.
6. **Build — Global observability:** Add structured server error logging with request IDs and environment-safe diagnostic context.
7. **Build — Uptime monitoring:** Add health checks for the web app, Supabase API, payment webhook, notification dispatcher, and scheduled jobs.
8. **Build — Security headers:** Configure CSP, HSTS, frame protection, content sniffing protection, referrer policy, and permissions policy.
9. **Build — Rate limiting:** Rate-limit sign-in, OTP, order lookup, support forms, review submission, search suggestions, and payment webhooks.
10. **Build — Backup and recovery runbook:** Configure database backups, storage backups, restore testing, and documented recovery ownership.
11. **Verify — Production Supabase RLS:** Test anonymous, shopper, staff, and each staff role against every sensitive table and RPC.
12. **Verify — Checkout transaction integrity:** Verify pricing, stock reservation, duplicate submission handling, expiry, cancellation, and concurrent checkout behavior.
13. **Verify — Payment webhook integrity:** Verify signature validation, idempotency, replay protection, timeout behavior, and failed-payment recovery.
14. **Verify — Delivery configuration:** Confirm live delivery areas, zones, fees, cutoffs, working-day estimates, free-delivery threshold, and support contacts.
15. **Verify — Transactional messaging:** Configure and test production email and SMS providers, sender identities, templates, opt-outs, and failure queues.
16. **Verify — Authentication configuration:** Confirm email verification, password reset, OAuth redirect URLs, session expiry, sign-out, and account deletion.
17. **Verify — Legal launch pages:** Review terms, privacy notice, returns policy, age restrictions, delivery policy, and contact details with the business owner.
18. **Verify — Product compliance:** Confirm every launch product has brand, origin, ingredients/materials, safety notes, category, photos, and required regulatory fields.
19. **Verify — Payment and refund operations:** Document how staff reconcile, refund, cancel, and handle payment-provider disputes outside the system.
20. **Verify — Launch smoke test:** Run a scripted journey from anonymous browsing through paid order, fulfillment, delivery, return, refund, and support.

## P1 — Core customer experience

21. **Build — Product search relevance:** Improve ranking using product name, brand, category, synonyms, availability, and popularity.
22. **Build — Search filters:** Add robust filters for category, brand, age band, price, rating, availability, and delivery eligibility.
23. **Build — Sort controls:** Add relevance, newest, price ascending, price descending, rating, and best-selling sorts.
24. **Build — Product comparison:** Allow shoppers to compare selected products on price, size, ingredients/materials, safety notes, age band, and availability.
25. **Build — Product recommendations:** Add related, recently viewed, frequently bought together, and age-appropriate recommendations.
26. **Build — Recently viewed products:** Persist recently viewed products for guests and signed-in shoppers with privacy-safe limits.
27. **Build — Product availability alerts:** Let shoppers subscribe to restock notifications for unavailable products or sizes.
28. **Build — Product question and answer flow:** Let shoppers submit product questions and staff publish answers on product pages.
29. **Build — Review abuse reporting:** Add shopper reporting for inappropriate reviews and staff moderation actions with audit history.
30. **Build — Review pagination and filtering:** Support pagination, rating filters, verified-purchase labels, and helpfulness sorting.
31. **Build — Guest checkout:** Support checkout without an account while offering optional account creation after purchase.
32. **Build — Saved cart recovery:** Preserve carts across sessions and merge guest carts into signed-in carts safely.
33. **Build — Promo and coupon engine:** Support fixed, percentage, product, category, first-order, date-window, usage-limit, and minimum-spend promotions.
34. **Build — Gift orders:** Add gift messages, hide prices on packing slips, and support recipient delivery details.
35. **Build — Order confirmation center:** Provide a complete confirmation page with order number, payment state, delivery estimate, contact options, and next steps.
36. **Build — Customer order notifications:** Add configurable email/SMS notifications for confirmation, payment, packing, dispatch, delivery, failed delivery, cancellation, return, and refund.
37. **Build — Order tracking improvements:** Add clear timeline states, estimated delivery windows, rider/courier status, and fallback support contact.
38. **Build — Address validation:** Validate Ghanaian phone numbers, normalize addresses, detect missing landmarks, and prevent invalid delivery zones.
39. **Build — Delivery fee preview:** Recalculate fees immediately as the customer changes address, zone, delivery method, or basket total.
40. **Build — Accessibility pass:** Meet WCAG 2.2 AA for keyboard navigation, focus states, labels, contrast, errors, dialogs, tables, and screen readers.

## P1 — Operations and staff

41. **Build — Admin dashboard filters:** Add date range, fulfillment state, payment state, delivery zone, and assignee filters to operational queues.
42. **Build — Bulk order operations:** Add safe bulk assignment, packing, dispatch, cancellation, export, and notification actions with confirmation and audit records.
43. **Build — Pick-and-pack workflow:** Add barcode/SKU scanning, short-pick handling, substitutions, packing verification, and final package confirmation.
44. **Build — Inventory reservations dashboard:** Show available, on-hand, reserved, damaged, quarantined, and expected stock with discrepancy warnings.
45. **Build — Low-stock automation:** Add configurable thresholds, staff alerts, reorder notes, and resolved-alert history.
46. **Build — Expiry and recall workflow:** Add batch expiry alerts, product recall actions, affected-order lookup, customer notification, and stock quarantine.
47. **Build — Supplier and purchase receiving:** Record suppliers, purchase references, received quantities, costs, batches, expiry dates, and discrepancies.
48. **Build — Inventory adjustment approval:** Require reason codes and optional second-person approval for high-value or large adjustments.
49. **Build — Rider delivery workflow:** Add rider availability, assignment history, route grouping, proof-of-delivery upload, and failed-attempt evidence.
50. **Build — Returns SLA queue:** Add due dates, aging filters, escalation flags, customer-visible milestones, and refund deadline tracking.
51. **Build — Refund reconciliation:** Match refunds to payment-provider references, prevent duplicate refunds, and export reconciliation exceptions.
52. **Build — Support SLA management:** Add priority, owner, response deadline, internal notes, canned replies, attachments, and escalation rules.
53. **Build — Content preview and publishing:** Add draft preview, scheduled publishing, rollback, and approval for banners and merchandising slots.
54. **Build — Audit log export and retention:** Add filtered exports, immutable event identifiers, retention policy, and admin-only access review.
55. **Build — Role access matrix tests:** Add automated tests for every admin page, action, export, and database function across all staff roles.

## P2 — Growth, trust, and scale

56. **Build — Customer loyalty foundation:** Track points or store credit ledger with earning, redemption, expiry, reversal, and staff adjustment history.
57. **Build — Referral program:** Add referral links, eligibility checks, rewards, fraud controls, and attribution reporting.
58. **Build — Abandoned-cart recovery:** Detect abandoned carts and send consent-aware reminder messages with unsubscribe support.
59. **Build — Analytics instrumentation:** Track consent-aware funnel events for search, product views, add-to-bag, checkout, payment, delivery, returns, and support.
60. **Build — Marketing attribution:** Capture UTM parameters, campaign IDs, referral source, and order attribution without storing unnecessary personal data.
61. **Build — Cookie and consent controls:** Add consent categories, persistent preferences, withdrawal, privacy-safe defaults, and consent audit records.
62. **Build — Customer data export improvements:** Export a complete machine-readable package including orders, reviews, addresses, saved items, support cases, and consent history.
63. **Build — Data deletion workflow:** Add asynchronous deletion status, retention exceptions, anonymization rules, and staff completion monitoring.
64. **Build — Fraud and abuse signals:** Detect repeated failed payments, excessive order lookup failures, review abuse, coupon abuse, and suspicious delivery changes.
65. **Build — Multi-device session management:** Show active sessions and allow shoppers to revoke sessions from account settings.
66. **Build — Mobile app parity plan:** Replace bundled mobile catalogue data with Supabase-backed data and align authentication, bag, checkout, tracking, and account features.
67. **Build — Progressive web app support:** Add manifest, installability, offline-safe shell, network recovery messaging, and app icons.
68. **Build — Image optimization pipeline:** Validate dimensions, strip unsafe metadata, generate responsive variants, and monitor storage costs.
69. **Build — Internationalization foundation:** Externalize copy, currency, date, number, address, and pluralization formats for future markets.
70. **Verify — Load and concurrency testing:** Test peak browsing, search, checkout, webhook delivery, admin queues, and database connection limits with production-like data.

## Definition of launch-ready

The project is ready for public launch only when:

- All P0 items are complete and signed off.
- Every P1 item is either implemented or explicitly accepted as a documented post-launch exception by the business owner.
- The hosted database is migrated and the reviews RPCs are confirmed in the live schema.
- A clean production build succeeds from `main`.
- Automated tests pass against a fresh database and a production-like seeded dataset.
- A complete order has been placed, paid, fulfilled, delivered, returned, and reconciled in a controlled rehearsal.
- Monitoring, backups, rollback, incident response, and support ownership are active.

## Implementation policy

All implementation work will be committed directly to `main`, as requested. Each feature should be delivered in small, deployable commits with tests and migration updates included where applicable. No feature should be considered complete based only on a successful local render; it must also have an acceptance test or documented verification step.
