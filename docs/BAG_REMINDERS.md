# Abandoned bag reminders

A signed-in shopper who leaves items in their bag gets one email and/or SMS, if they agreed to offers.

- **Who:** only shoppers who ticked "Offers by SMS" and/or "Offers by email" (Account → Details). Email needs a confirmed address; SMS needs a phone number.
- **When:** the bag was last changed between 3 hours and 3 days ago; at most once per bag and once a week per shopper; only between 08:00 and 20:00 in Accra.
- **Not sent when:** they placed an order since the bag changed, or nothing in the bag is published and in stock.
- **Content:** the name of the last item added and how many more, the bag total, a link to `/bag`, and how to stop. No order link, no delivery code, and no copy goes to the store's alert inbox.
- **How it runs:** `public.queue_bag_reminders()` (pg_cron, every hour at :17) queues the messages; the normal dispatcher sends them (same `CRON_SECRET` job and providers as order messages, template `bag_reminder`). Guests are never reminded: their bag lives only on their device.
- **Privacy:** `bag_reminders` records only that a reminder was sent, and is removed with the account.

To switch it off, run `select cron.unschedule('bag-reminders');` in the Supabase SQL Editor.
