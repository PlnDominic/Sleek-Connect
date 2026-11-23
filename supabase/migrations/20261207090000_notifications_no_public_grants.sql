-- Customer messages (phone numbers, emails, order links) were protected by row level security alone: the public roles still held
-- table privileges. Take the privileges away too, so a missing policy can never expose them. The server and the database
-- functions use the service role and the table owner, which are unaffected.
revoke all on public.notifications from anon, authenticated;
