# Suppliers and stock

Sleek Connect is one store. It buys from suppliers, keeps stock, and sells to shoppers. The shopper's money is Sleek Connect's, so no
payment is ever collected on anyone else's behalf. There are no seller accounts, seller stores, seller fees or seller payouts.

## The supplier register (Admin → Suppliers)

A plain internal list. Shoppers never see it.

- Name, contact person, phone, email, address, payment terms, notes.
- Tax and payment details (type, registered name, TIN, business registration, Mobile Money network, number and name on the wallet) are
  visible and editable by **finance and admin** only. Operations staff see and edit the contact details and nothing else; saving as
  operations leaves the tax and payment details untouched.
- A supplier can be **hidden** (leaves the "received from" menu, history kept) and **deleted** only by finance/admin and only when
  nothing was ever received from them.
- Every change is written to the audit log (`supplier.created`, `supplier.updated`, `supplier.switched_on/off`).

All access is through functions: `admin_list_suppliers`, `admin_save_supplier`, `admin_set_supplier_active`, `admin_delete_supplier`,
`admin_supplier_options` (names for menus) and `admin_supplier_history`. The tables `suppliers` and `stock_receipts` have no direct grants.

## Receiving stock from a supplier (Admin → Inventory → Receive stock)

`admin_receive_stock_from` receives a delivery into a batch exactly as `admin_receive_stock` did (batch number, expiry for beauty and
bath products, FEFO), and also records:

- the supplier, the cost per unit (`stock_batches.unit_cost_ghs`) and an invoice or delivery reference,
- a row in `stock_receipts`, which drives the supplier's history, totals and "last delivery",
- `products.supplier_id` when the product has no usual supplier yet.

## Switched off

The earlier marketplace functions (`vendor_*`, `admin_*vendor*`, disputes, follows, store pages, product-view counts) are no longer
callable by the web or mobile apps (migration `20261113090000`). Nothing was deleted from the database: the tables and rows remain until
a separate clean-up migration, to be run only after a Supabase backup (see `docs/BACKUP_AND_RECOVERY.md`).
