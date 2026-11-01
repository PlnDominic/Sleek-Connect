# Catalogue tools: bulk editing, reorder suggestions, size guides, skin finder

Run `supabase/migrations/20261102090000_catalogue_tools.sql` once (Supabase → SQL Editor). Until then these pages still load
but show no size guides and the new buttons fail; nothing existing breaks.

## Bulk product editing (Admin → Products)

Tick products (or "Tick all on this page"; use "Per page: 100" for more), choose a change under the table, press **Apply**:

| Change | What it does |
| --- | --- |
| Show / hide | Hiding always works. Showing only works for complete products; an incomplete one is skipped and the missing details are listed. |
| Change prices | A percent up or down, an amount added or taken off, or one exact price (products with one size). Every size follows, and the product's price stays its default size's price. |
| Start a sale / end a sale | Takes a percent off and shows the old price crossed out; ending it restores the old price. A product already on sale is skipped, never discounted twice. |
| Move to a category / set skin types / set the size guide | As named. Skin types can be added to, replaced or cleared. |

Each product succeeds or is skipped with its reason, so one bad product never blocks the rest. A product is never left half
changed. Products sold by independent stores are skipped: their prices come from the vendor and your markup. Every price
change is in the audit log (marked "bulk"). Only catalogue staff (and admins) can do it. Up to 200 products at a time.

## Reorder suggestions (Admin → Inventory → Reorder suggestions)

For each size of your own products: units sold in the last 30 days (or since the product was added, at least 7 days), per day,
days of stock left, and **how many to order**: enough for the supplier's lead time plus the days of sales to cover, less what is
available now. Statuses: **sold out** (selling but none left), **order now** (runs out before a new order could arrive),
**order soon**, **low stock**. Export it as a CSV for your supplier.

Set the two numbers in Settings → Stock alerts (supplier lead time, default 7 days; days of sales to cover, default 21).
It only knows past sales and current stock: it does not know about a coming promotion, a season, or an order already on the way,
so treat it as a starting point. Independent stores' products are not listed (vendors manage their own stock).

## Size guides (Admin → Products → Size guides)

A chart a shopper opens from the product page ("Size guide: …"). Three starter charts are included (baby clothing by age, kids
clothing by age, women's clothing): they are typical sizes, so **check them against your suppliers' own charts** before relying
on them. Write a chart as text: the first line is the column headings, then one line per size, cells separated by `|`.
Give a product its guide on the product's own page, or tick several products and use "Set the size guide".

## Skin type finder (/skin-finder)

A three-step page (skin type, what you're shopping for, budget) that lists matching products. It uses the **Skin types** you
enter on each beauty product (one per line, such as Dry, Oily, Combination, Sensitive, Normal); a product tagged "All skin types"
matches everyone, and products with no skin types are left out. To get it working, tag your beauty products (use the bulk
"Set skin types" to do many at once). It is linked from the footer and the sitemap, and is a guide only: the page says it is not
medical advice.
