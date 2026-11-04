# Suppliers: how vendor products are sold now

Hubtel (and the Mobile Money rules behind it) do not allow a business to collect shoppers' payments on behalf of other
sellers without a payment-aggregator licence from the Bank of Ghana. So Sleek Connect does **not** run a marketplace where sellers
sign up and are paid out of money collected for them. It **buys from suppliers and resells**.

> This is the product's design, not legal advice. Get Hubtel's written confirmation of this model, and a Ghana payments/tax lawyer's
> view on seller-of-record duties (returns, product liability, VAT), before switching vendor orders on.

## The model

- The shopper pays **Sleek Connect**. The money is Sleek Connect's own sales income.
- A **supplier** is a brand or maker the owner adds in **Admin → Suppliers**. Suppliers have **no account, no sign-in, no dashboard and no
  yearly fee**. (A supplier is a `vendors` row with `is_supplier = true` and no `owner_id`; it is always "live".)
- Staff enter the supplier's products with the **supplier's price** (the existing `vendor_price_ghs`), photos and stock. Each product is approved in
  **Admin → Vendors → Products to review** with the owner's markup; the shopper price is supplier price + markup, as before.
- On the shop the product says "From <supplier>" (the supplier's brand page is `/store/<slug>`).
- Orders for supplier products are packed from stock Sleek Connect collects from the supplier (`admin_collect_vendor_items`), then delivered by the
  shop's riders. Suppliers never see shopper details.
- What Sleek Connect owes a supplier is the supplier's price for the goods that were **delivered** (`vendor_balance`), after the payout hold days.
  Staff record each payment to the supplier in **Admin → Vendors → Payouts** (`admin_record_payout`; the supplier's TIN and Mobile Money number
  are kept on the supplier's record).

## What is switched off

Sellers opening their own stores (`/vendor`, the "Open your store" wizard, the yearly fee, seller dashboard, seller replies to reviews, Star Seller) is
**closed by default**: `store_settings.vendor_accounts_open = false`, and `vendor_apply` refuses while it is off. `/sell` then explains how to supply
Sleek Connect instead. All of that code is still there: if you later get a licence, or move to a payment partner that splits payments to sellers, switch
the setting on again (Admin → Suppliers → "Sellers opening their own stores"). Orders from vendor/supplier items stay behind
`store_settings.marketplace_orders_open` until you have rehearsed one end to end.

## The database

Migration `20261112090000_suppliers.sql`:

- `vendors.is_supplier`, `store_settings.vendor_accounts_open`; `vendor_is_live` treats a supplier as live.
- The seller's product, stock, delete and list functions were split into internal functions that take a vendor row
  (`write_vendor_product`, `set_vendor_stock`, `delete_vendor_product`, `list_vendor_products`), so staff do the same work for a supplier. The
  `vendor_*` functions call them exactly as before.
- Staff functions: `admin_create_supplier`, `admin_update_supplier`, `admin_list_suppliers` (admin), `admin_save_supplier_product`,
  `admin_supplier_products`, `admin_delete_supplier_product` (catalogue), `admin_set_supplier_stock` (operations), `admin_set_vendor_accounts_open`
  (admin). All are audited and only reach suppliers, never a seller's own store.
