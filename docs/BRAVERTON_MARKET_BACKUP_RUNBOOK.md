# Braverton Market backup and recovery runbook

## Current project facts
- The connected Supabase organization was read as **Free**.
- Supabase's current documentation says Free projects do not receive automatic daily backups and recommends regular exports with off-site backups. Pro, Team and Enterprise receive managed daily database backups.
- Database backups do not include Storage API objects. This workflow separately downloads configured Storage buckets before encrypting the combined archive.
- The live Storage bucket inventory includes `marketplace-products` and `marketplace-private` for marketplace data. The separate `leo-files` bucket is outside this marketplace-only backup scope; add it if the owner wants a whole-platform backup.

## Prepare encryption and off-site storage
1. Create an independent S3-compatible bucket outside the Supabase project. Do not use a bucket in the same failure domain as the database.
2. On a trusted local machine, generate an age identity with `age-keygen -o age-identity.txt`.
3. Keep `age-identity.txt` private and offline in a secure password manager or encrypted vault. Never commit it or upload it to GitHub.
4. Get the public recipient with `age-keygen -y age-identity.txt`; store only that public recipient in GitHub secret `BACKUP_AGE_RECIPIENT`.
5. Create a Supabase Storage S3-compatible access key with read/list permission for the marketplace buckets.
6. Create an off-site S3 access key with permission to upload objects, inspect object metadata and set lifecycle policy on the backup bucket.

## Required GitHub Actions configuration
Set these repository secrets:
- `SUPABASE_DB_URL`: direct database connection string with a backup-capable database role; use the direct Postgres connection rather than a transaction pooler.
- `SUPABASE_STORAGE_S3_ENDPOINT`, `SUPABASE_STORAGE_S3_ACCESS_KEY_ID`, `SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY`: Supabase Storage S3-compatible credentials.
- `BACKUP_AGE_RECIPIENT`: age public recipient only.
- `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`: independent off-site S3-compatible backup destination.

Set repository variable `SUPABASE_STORAGE_BUCKETS` to `marketplace-products marketplace-private`. Add any additional marketplace bucket after reviewing the live bucket inventory. Do not store credentials in repository variables or source code.

The backup workflow runs daily at 02:30 UTC after it is present on the default branch. If configuration is incomplete, it records a skipped run in the workflow summary; a skipped run is **not** a backup. The script validates the database dump, encrypts the database and Storage archive with age, uploads the encrypted archive, verifies the remote checksum and applies a 90-day retention policy under the `braverton/` prefix.

Configure GitHub Actions failure notifications to reach the owner. Confirm the first scheduled run succeeds; do not infer success from a green skipped run.

## Restore drill (staging only)
1. Obtain a recent encrypted archive from the off-site bucket and the matching age private identity.
2. Provision an isolated Supabase staging project and separate empty Storage buckets.
3. Set `RESTORE_TARGET_ENV=staging`, `BACKUP_AGE_IDENTITY_FILE`, `BACKUP_ARCHIVE`, `RESTORE_DB_URL`, the staging Storage S3 credentials/endpoint, and the bucket list.
4. Run `bash scripts/braverton-restore-staging.sh`. The script refuses to run unless the explicit target is `staging`.
5. Validate schema/migration state, buyer and seller records, product image objects, order/fulfilment timelines, affiliates, suppliers, and object access.
6. Run the application staging integration suite and record elapsed restore time and recovered backup timestamp.
7. Never test restore against production. Production recovery requires owner-led incident approval, a separate change plan, downtime notice, and a verified pre-restore backup.

## Operational acceptance criteria
- Latest daily backup uploaded and age-encrypted.
- Both database dump and all configured Storage buckets present in archive.
- Remote object checksum verified.
- Bucket retention policy verified in the provider console.
- Failure alert reaches the owner.
- At least one successful staging restore drill, with counts and logs recorded.
- Recovery point objective: at most 24 hours between successful daily runs; recovery time objective is measured by the staging drill.

## Known limitation until owner configuration
The repository cannot create GitHub repository secrets, provision an off-site bucket, generate/store a private encryption identity, or complete a restore drill on its own. Until those external settings are configured and the scheduled workflow succeeds, backups are **implemented but not operationally verified**.
