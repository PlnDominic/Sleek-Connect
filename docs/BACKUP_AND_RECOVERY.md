# Sleek Connect Backup and Recovery Runbook

This runbook covers the hosted Supabase project, Supabase Storage, and the Vercel deployment. The production owner must complete the provider-specific setup before launch and rehearse restoration before accepting live orders.

## Ownership and targets

- **Incident owner:** Store owner or nominated administrator.
- **Database recovery point objective:** 24 hours at minimum; use Supabase point-in-time recovery when the production plan supports it.
- **Customer-facing recovery time objective:** 4 hours for a database outage; 1 hour for a Vercel rollback.
- **Backup retention:** Keep the provider's automated database backups for the longest available retention window and retain exported business backups for at least 90 days.
- **Sensitive data:** Never put database dumps, Storage exports, service-role keys, payment secrets, or customer exports in GitHub, Vercel logs, Slack, or issue comments.

## What must be backed up

1. **Postgres data:** Products, catalogue metadata, inventory, batches, orders, payments, returns, support cases, staff, audit logs, notifications, and customer records.
2. **Storage objects:** Product images and private return photos. Preserve object paths and metadata.
3. **Schema and configuration:** All files in `supabase/migrations`, `supabase/setup.sql`, `supabase/seed.sql`, Supabase Auth provider settings, redirect URLs, Storage bucket policies, and production environment variable names.
4. **Deployment configuration:** Vercel project settings, root directory (`apps/web`), production branch (`main`), cron configuration, domains, and deployment history.

## Pre-launch setup checklist

- [ ] Enable Supabase automated backups and point-in-time recovery if available.
- [ ] Confirm the backup region, retention window, and who can initiate a restore.
- [ ] Create a restricted backup destination owned by the business; encrypt exports at rest.
- [ ] Create a separate backup operator identity. Do not use a personal shared password.
- [ ] Confirm product-images and return-photos buckets are included in the Storage backup process.
- [ ] Record production project reference, Vercel project name, domain, and incident contacts in the private operations vault.
- [ ] Verify that `SUPABASE_SECRET_KEY`, payment credentials, messaging credentials, and `CRON_SECRET` can be rotated.
- [ ] Take a baseline backup before the first live order.
- [ ] Perform a restore rehearsal against a separate non-production Supabase project.

## Routine schedule

- **Daily:** Check the latest automated database backup status and review `/api/health` from an external monitor.
- **Weekly:** Export a schema/configuration snapshot, verify the notification cron has run, and review backup failure alerts.
- **Monthly:** Restore a recent database backup to a disposable project, run migrations and smoke tests, and verify that Storage objects can be read.
- **After every schema change:** Commit the migration to `main`, run CI, apply it to production, verify the relevant RPCs, and record the migration timestamp.
- **Before any destructive operation:** Take an on-demand backup and record the operator, reason, scope, and rollback plan.

## Database restore procedure

1. Declare an incident and stop any planned catalogue, inventory, refund, or fulfilment changes.
2. Capture the current Vercel deployment ID and database project state before changing anything.
3. If the database is available, export current audit and payment reconciliation data first.
4. Restore the selected Supabase backup or point-in-time snapshot into a new recovery project whenever possible. Do not overwrite production until the recovery project passes validation.
5. Apply the repository migrations in timestamp order only if the restored project is behind the expected migration version.
6. Verify the required tables, RPCs, grants, RLS policies, Storage buckets, and the reviews functions `get_product_reviews` and `get_review_summary`.
7. Point a preview deployment at the recovery project and run the smoke journey: browse, search, add to bag, checkout test order, staff sign-in, order lookup, and notification dispatch.
8. Rotate affected secrets if compromise is suspected. Update Vercel variables and Supabase Auth redirect settings.
9. Switch production configuration to the recovered project during a controlled maintenance window.
10. Confirm `/api/health` returns `status: ok`, then reopen order placement and document the incident.

## Storage recovery procedure

1. Identify the affected bucket and object prefix; preserve the current object listing if available.
2. Restore product images and return photos into a recovery bucket first, preserving paths and content types.
3. Verify public product-image URLs and private return-photo access through authenticated staff/customer flows.
4. Copy recovered objects into the production bucket only after verification. Never make return photos public during recovery.
5. Check product gallery records for missing paths and run a catalogue photo audit before reopening the store.

## Vercel recovery and rollback

- For an application regression, use the last known-good Vercel deployment and promote it to production.
- Confirm the deployment's environment variables point to the intended Supabase project.
- Verify the `Notification dispatch` GitHub Actions workflow (`.github/workflows/notification-dispatch.yml`) is enabled and its `SITE_URL` and `CRON_SECRET` secrets are set; the dispatcher accepts `Authorization: Bearer <CRON_SECRET>`.
- Run `/api/health`, a product page, checkout initialization, payment webhook test, and the staff sign-in page after rollback.
- If the rollback follows a schema change, keep the database migration backward-compatible until the application rollback is complete.

## Applying a migration before a deploy

Apply new migrations to the production Supabase project before the Vercel build runs: `next build` prerenders product pages and calls database functions such as `public.get_product_reviews`. If a build fails with "Could not find the function ... in the schema cache", confirm the function exists in the project that `NEXT_PUBLIC_SUPABASE_URL` points at, then run `notify pgrst, 'reload schema';` and push a fresh commit (a deployment that failed cannot be redeployed).

## Evidence to record

For every backup or restore, record the timestamp, operator, source backup/PITR time, target project, migration version, validation results, customer impact, and follow-up actions. Store the record outside the production database so it remains available during an outage.
