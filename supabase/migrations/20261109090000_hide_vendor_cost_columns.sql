-- Security fix: the vendor's own price, the owner's markup and the owner's review notes were readable by anyone with the public key,
-- because `products`, `product_sizes` and `order_items` had a table-wide SELECT grant (rows are filtered by RLS, columns were not).
-- Vendors, the owner and shoppers read these through the vendor_*, admin_* and order functions, which are unaffected.
--
-- From now on these tables are readable column by column. When you add a column to one of them that the shop must read, grant it:
--   grant select (new_column) on public.products to anon, authenticated;

do $$
declare
  t record;
  cols text;
begin
  for t in
    select * from (values
      ('products', array['vendor_price_ghs', 'vendor_was_price_ghs', 'markup_percent', 'review_note', 'review_previous', 'review_checks']),
      ('product_sizes', array['vendor_price_ghs']),
      ('order_items', array['vendor_unit_price_ghs', 'markup_unit_ghs'])
    ) as v(tbl, hidden)
  loop
    execute format('revoke select on public.%I from anon, authenticated', t.tbl);
    select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position) into cols
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = t.tbl and c.column_name <> all (t.hidden);
    execute format('grant select (%s) on public.%I to anon, authenticated', cols, t.tbl);
  end loop;
end;
$$;
