# Removing the sample products from the live store

The starter catalogue (about ten example products with 25 of each in stock) was loaded when the project was set up. It is sample
data, not stock the store owns. New projects no longer receive it: `supabase/setup.sql` contains only the reference data (categories,
age groups, delivery areas and options). `supabase/seed.sql` still holds the samples for local development and the automated tests.

## Run order

1. **Back up first** (Supabase → Database → Backups, or see `docs/BACKUP_AND_RECOVERY.md`). Deleting is permanent.
2. Add your real products and receive their stock (Admin → Products, Admin → Inventory → Receive stock).
3. Open `supabase/maintenance/remove_sample_products.sql` in the Supabase SQL Editor and run it as it is. It ends with `rollback;`,
   so it only reports what it would do: how many sample products it found, how many it would delete and how many it would only hide.
4. If the numbers look right, change the last line from `rollback;` to `commit;` and run it again.

## What it does

For the sample products only (matched by their web address):

- A sample product that **no customer has ordered** is deleted, with its sizes, photos, stock batches, stock history, reviews and
  questions.
- A sample product that **appears on a real order** is only hidden from the shop, so order history, receipts and returns keep working.
- It never touches orders, customers, categories, delivery settings or products you added yourself.

Sample products are recognised by their web addresses; if you renamed or re-addressed one, delete it from Admin → Products instead.
Photos you uploaded for a deleted product stay in the `product-images` bucket until you remove them in Supabase → Storage.
