# Adlink database migration inventory

This document is an inventory of migration files present on
`feat/adlink-2.0-phase-1`. It is not evidence that any migration has been
applied to Neon.

## Files present on this branch

| File | Purpose |
| --- | --- |
| `001_initial_schema.sql` | Initial marketplace, booking, evidence, payment-event and audit schema |
| `002_super_admin_role.sql` | Adds the `super_admin` role |
| `003_auth_credentials.sql` | Authentication credential storage |
| `003_auth_sessions.sql` | Session storage |
| `004_auth_sessions.sql` | Session schema follow-up |
| `005_financial_ledger.sql` | Publisher earnings and payout ledger |
| `006_payout_request_items.sql` | Links payout requests to individual earnings |
| `013_publisher_verification.sql` | Publisher verification review fields |
| `016_campaign_modes.sql` | Self-service and managed campaign modes |
| `017_managed_campaign_review.sql` | Managed campaign review status and notes |
| `018_managed_campaign_operations.sql` | Managed campaign assignment and progress fields |

## Gaps requiring reconciliation

The following sequence numbers are not present in this branch's migration
directory: `007`–`012`, `014`, and `015`.

Do not assume these migrations were unnecessary, applied, or safely represented
by another branch. In particular, earlier project notes mention payment-provider
work on a separate Bachs branch. Its migration files and deployment history must
be compared before deciding how to reconcile the sequence.

## Safe migration procedure

1. Retrieve the missing migration files and relevant branch/commit history.
2. Inspect the actual Neon schema and migration history using an authorized,
   read-only connection.
3. Compare every migration with the live schema; do not infer applied status
   from a successful application build or Vercel deployment.
4. Prepare one reviewed, ordered migration plan that accounts for existing
   objects and data. Make it rerunnable only where that is demonstrably safe.
5. Test the plan against a separate Neon branch or disposable database first.
6. Obtain explicit approval before applying schema changes to the shared or
   production Neon database.

Until this reconciliation is complete, keep changes that query columns from
migrations `016`–`018` out of production use. Do not run these migrations
automatically during deployment.

## Current release boundary

This branch is a development/preview branch. This inventory does not authorize
merging, production deployment, payment-setting changes, or database writes.
