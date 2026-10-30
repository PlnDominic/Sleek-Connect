-- The starter "Flash Sale / Up To [X]% Off" promo card was seeded with a placeholder percentage.
-- Remove it unless staff have already edited it in Admin → Content; the other starter banners are unchanged.
delete from public.banners
where placement = 'home_promo'
  and title = 'Up To [X]% Off';
