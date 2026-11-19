-- Pay on delivery is no longer offered: shoppers pay online (Mobile Money or card). Switching the setting off makes place_order refuse
-- new cash orders from any client, including older copies of the app. Cash orders already placed are unaffected and staff can finish them.
update public.store_settings set pay_on_delivery_enabled = false;
