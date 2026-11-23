# Braverton Market backup and recovery runbook

## Current project facts
- Supabase organization plan was read as **Free** for project `xqyrbdsdojbxgqgghucf`.
- Supabase documents daily managed database backups for Pro, Team and Enterprise plans; Free projects are instructed to export data and keep off-site backups.
- This workflow therefore implements encrypted external logical backups; it does not enable paid PITR or change the Supabase plan.
- Database dumps do not include Storage objects, so the workflow separately downloads the configured Storage buckets before encrypting the combined archive.

## Required GitHub Actions configuration
Set these repository secrets:
- `SUPABASE_DB_URL`: database connection string with a backup-capable database role.
- `SUPABASE_STORAGE_S3_ENDPOINT`, `SUPABASE_STORAGE_S3_ACCESS_KEY_ID`, `SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY`: Supabase Storage S3-compatible credentials.
- `BACKUP_AGE_RECIPIENT`: age public recipient. Keep the matching private identity offline in a secure password manager.
- `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`: independent off-site S3-compatible backup destination.

Set repository variable `SUPABASE_STORAGE_BUCKETS` to the space-separated bucket names that contain Braverton data (at minimum `marketplace-products marketplace-private`, then add any further buckets after inventory). Do not store credentials in repository variables or source code.

The scheduled workflow runs daily at 02:30 UTC. If configuration is incomplete, it records a clear skipped status in the workflow summary; a skipped run is **not** a backup. Configure a bucket lifecycle policy with a 90-day current-object retention and 30-day noncurrent-version retention. The workflow applies that lifecycle to the `braverton/` prefix.

## Restore drill (staging only)
1. Obtain a recent encrypted archive from the off-site bucket and the matching age private identity.
2. Provision an isolated Supabase staging project and separate empty Storage buckets.
3. Set `RESTORE_TARGET_ENV=staging`, `BACKUP_AGE_IDENTITY_FILE`, `BACKUP_ARCHIVE`, `RESTORE_DB_URL`, the staging Storage S3 credentials/endpoint, and the bucket list.
4. Run `bash scripts/braverton-restore-staging.sh`. The script refuses to run unless the explicit target is `staging`.
5. Validate schema/migration state, buyer and seller records, product image objects, order/fulfillment timelines, affiliates, suppliers, and object access.
6. Run the application staging integration suite and record elapsed restore time and recovered backup timestamp.
7. Never test restore against production. Production recovery requires owner-led incident approval, a separate change plan, downtime notice, and a verified pre-restore backup.

## Operational acceptance criteria
- Latest daily backup uploaded and age-encrypted.
- Both database dump and all configured Storage buckets present in archive.
- Bucket retention policy verified in the provider console.
- Alerting on workflow failure enabled through GitHub Actions notifications.
- At least one successful staging restore drill, with counts and screenshots/log evidence recorded.
- Recovery point objective: at most 24 hours between daily runs; recovery time objective is measured by the staging drill.

## Known limitation until owner configuration
The repository cannot create GitHub repository secrets, provision an off-site bucket, generate/store a private encryption identity, or complete a restore drill on its own. Until those external settings are configured and the scheduled workflow succeeds, backups are **implemented but not operationally verified**.
