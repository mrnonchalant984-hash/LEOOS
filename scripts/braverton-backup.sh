#!/usr/bin/env bash
set -euo pipefail
: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL}"
: "${SUPABASE_STORAGE_S3_ENDPOINT:?Set SUPABASE_STORAGE_S3_ENDPOINT}"
: "${SUPABASE_STORAGE_S3_ACCESS_KEY_ID:?Set Supabase Storage S3 access key}"
: "${SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY:?Set Supabase Storage S3 secret}"
: "${SUPABASE_STORAGE_BUCKETS:?Set space-separated storage bucket names}"
: "${BACKUP_AGE_RECIPIENT:?Set the age public recipient}"
: "${BACKUP_S3_ENDPOINT:?Set off-site S3-compatible backup endpoint}"
: "${BACKUP_S3_BUCKET:?Set off-site backup bucket}"
: "${BACKUP_S3_ACCESS_KEY_ID:?Set off-site backup access key}"
: "${BACKUP_S3_SECRET_ACCESS_KEY:?Set off-site backup secret}"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
mkdir -p "$workdir/storage"

pg_dump "$SUPABASE_DB_URL" --format=custom --no-owner --no-privileges --file "$workdir/database.dump"
for bucket in $SUPABASE_STORAGE_BUCKETS; do
  mkdir -p "$workdir/storage/$bucket"
  AWS_ACCESS_KEY_ID="$SUPABASE_STORAGE_S3_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="$SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY" \
  aws --endpoint-url "$SUPABASE_STORAGE_S3_ENDPOINT" s3 sync "s3://$bucket" "$workdir/storage/$bucket" --only-show-errors
done

tar -C "$workdir" -czf "$workdir/braverton-$timestamp.tar.gz" database.dump storage
age --recipient "$BACKUP_AGE_RECIPIENT" --output "$workdir/braverton-$timestamp.tar.gz.age" "$workdir/braverton-$timestamp.tar.gz"

export AWS_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY"
aws --endpoint-url "$BACKUP_S3_ENDPOINT" s3 cp "$workdir/braverton-$timestamp.tar.gz.age" \
  "s3://$BACKUP_S3_BUCKET/braverton/$timestamp/braverton-$timestamp.tar.gz.age" --only-show-errors

retention="${BACKUP_RETENTION_DAYS:-90}"
if [[ ! "$retention" =~ ^[0-9]+$ ]] || (( retention < 30 )); then
  echo "BACKUP_RETENTION_DAYS must be at least 30." >&2
  exit 1
fi
cat > "$workdir/lifecycle.json" <<JSON
{"Rules":[{"ID":"braverton-market-backup-retention","Status":"Enabled","Filter":{"Prefix":"braverton/"},"Expiration":{"Days":$retention},"NoncurrentVersionExpiration":{"NoncurrentDays":30}}]}
JSON
aws --endpoint-url "$BACKUP_S3_ENDPOINT" s3api put-bucket-lifecycle-configuration \
  --bucket "$BACKUP_S3_BUCKET" --lifecycle-configuration "file://$workdir/lifecycle.json"

echo "Encrypted Braverton backup uploaded: braverton/$timestamp/ (database + configured Storage buckets)."
