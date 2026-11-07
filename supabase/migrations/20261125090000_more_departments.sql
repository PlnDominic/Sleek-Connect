-- The store sells general merchandise, not only beauty, baby and fashion. More departments to put products in, and a neutral picture
-- kind ('box') for products that aren't a bottle, jar, tube, garment, toy or gift. This only adds values; no data changes.
alter type public.department add value if not exists 'electronics';
alter type public.department add value if not exists 'sports';
alter type public.department add value if not exists 'general';
alter type public.product_kind add value if not exists 'box';
