# Remote device pairing setup

The remote pairing API stores one-time code hashes and relay events in Supabase. A ZIP update cannot create tables inside the configured Supabase project by itself; the migration must be applied to the database used by the local LeonardX server.

## Required environment

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; never expose or commit it)

## Apply the migration

From the project root, ensure the Supabase CLI is installed and the project is linked to the correct Supabase project. Then run:

```powershell
npx supabase migration list
npx supabase db push
```

The new forward migration `20261014160000_remote_pairing_schema_repair.sql` recreates the pairing tables idempotently even if the older `20261013180000_remote_device_pairing.sql` migration was skipped because of migration ordering. Review the target project before applying any database migration.

Restart the local Next.js server after migration and test `POST /api/remote/pairings` while signed in. A successful creation returns HTTP 201. HTTP 401 means the request is not authenticated; HTTP 503 usually means Supabase configuration or the pairing schema is unavailable.

## Local dashboard navigation

The private workforce pages are separate routes: `/workforce`, `/workforce/conversations`, `/workforce/jobs`, `/workforce/monitoring`, `/meeting-room`, and `/workflows`. They must not be redirected to `/agents`. If owner authorization is rejected, the page should show an explicit access error. Confirm `OWNER_EMAIL` matches the signed-in owner's profile email and that the profile role is `owner`. If two-factor verification is enabled, the browser must also have a valid trusted-admin-device cookie.
