-- The store now sells more than beauty and kids' products. Two more departments:
--   home    Home & Groceries       (groceries, kitchen and home appliances)
--   fashion Fashion & Accessories  (jewellery, bags and more)
-- New enum values can't be used until this migration has committed, so the categories that use them are added by the
-- next migration.
alter type public.department add value if not exists 'home';
alter type public.department add value if not exists 'fashion';
