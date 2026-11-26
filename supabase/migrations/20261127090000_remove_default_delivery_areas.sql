-- The store no longer ships with delivery areas: shoppers type their own location at checkout, and staff add areas
-- (Admin → Delivery) only to group places into zones with their own fees.
-- This removes the five starter areas the first seed created, but only where nobody has put them in a zone, so an area
-- staff set up on purpose is kept.
delete from public.delivery_areas
where name in ('East Legon', 'Osu', 'Airport Residential', 'Spintex', 'Dansoman')
  and zone_id is null;
