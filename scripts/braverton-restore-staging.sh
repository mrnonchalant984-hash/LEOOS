#!/usr/bin/env bash
set -euo pipefail
if [[ "${RESTORE_TARGET_ENV:-}" != "staging" ]]; then
  echo "Refusing restore: set RESTORE_TARGET_ENV=staging. This script never targets production." >&2
  exit 1
fi
: "${BACKUP_AGE_IDENTITY_FILE:?Set path to age private identity file}"
: "${BACKUP_ARCHIVE:?Set path to encrypted .tar.gz.age backup}"
: "${RESTORE_DB_URL:?Set isolated staging database URL}"
: "${RESTORE_STORAGE_S3_ENDPOINT:?Set isolated staging Storage S3 endpoint}"
: "${RESTORE_STORAGE_S3_ACCESS_KEY_ID:?Set staging Storage access key}"
: "${RESTORE_STORAGE_S3_SECRET_ACCESS_KEY:?Set staging Storage secret}"
: "${SUPABASE_STORAGE_BUCKETS:?Set space-separated storage bucket names}"
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
age --decrypt --identity "$BACKUP_AGE_IDENTITY_FILE" --output "$workdir/backup.tar.gz" "$BACKUP_ARCHIVE"
tar -C "$workdir" -xzf "$workdir/backup.tar.gz"
pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error --dbname "$RESTORE_DB_URL" "$workdir/database.dump"
for bucket in $SUPABASE_STORAGE_BUCKETS; do
  AWS_ACCESS_KEY_ID="$RESTORE_STORAGE_S3_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="$RESTORE_STORAGE_S3_SECRET_ACCESS_KEY" \
  aws --endpoint-url "$RESTORE_STORAGE_S3_ENDPOINT" s3 sync "$workdir/storage/$bucket" "s3://$bucket" --delete --only-show-errors
done
echo "Staging restore completed. Run application smoke tests and compare expected record counts before any production recovery decision."
