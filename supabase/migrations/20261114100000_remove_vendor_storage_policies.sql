-- The seller upload rules on Storage called functions that were switched off in 20261113090000, which made every upload to
-- product-images fail ("permission denied for function my_live_vendor_id"), staff uploads included. Sellers no longer exist, so the
-- rules go. Staff upload rules for product-images are unchanged.

drop policy if exists "Vendors upload store images" on storage.objects;
drop policy if exists "Vendors list store images" on storage.objects;
drop policy if exists "Vendors remove store images" on storage.objects;
drop policy if exists "Vendors upload their product photos" on storage.objects;
drop policy if exists "Vendors list their product photos" on storage.objects;
drop policy if exists "Vendors remove their product photos" on storage.objects;
