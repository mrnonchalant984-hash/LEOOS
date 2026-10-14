# LeonardX routing and remote-pairing repair

## Changes in this package

- Removed primary navigation links from the Workforce dashboard that sent users into the customer-facing `/agents` area. The workforce dashboard, engineer conversations, durable job queue, monitoring dashboard, meeting room, and workflow studio remain separate routes.
- Added a route regression test that checks the owner workforce/meeting layouts do not issue a redirect to `/agents` and that each private workspace route has its own page.
- Added `supabase/migrations/20261014160000_remote_pairing_schema_repair.sql`, an idempotent forward migration that creates the remote pairing and event tables. The original pairing migration has an older timestamp than some existing migrations; the new forward migration gives existing databases a current migration they can apply.
- Improved pairing API error messages to identify the forward migration to apply when Supabase reports missing pairing storage.
- Added `docs/REMOTE-DEVICE-PAIRING-SETUP.md` with local setup and migration instructions.

## Verification

- Relevant routing/pairing regression tests: 5 passed.
- Full available Node test set excluding `tests/plugins.test.mjs`: 133 passed, 0 failed.
- The full Next.js production build and semantic TypeScript check have not been verified in this environment because the local dependency installation previously lacked the required Next.js/TypeScript executables. Run `npm ci`, `npm run typecheck`, and `npm run build` locally before pushing.

## Important external dependency

The ZIP cannot apply SQL to the Supabase project automatically. To clear pairing HTTP 503 caused by missing tables, link the Supabase CLI to the intended database and run `npx supabase db push`, then restart the local Next.js server. Confirm the target project before applying migrations. The app still requires valid Supabase URL, anon key, server-only service role key, and an authenticated user.

## Security and routing

The private engineering pages remain owner-authorized. If the owner API returns 401/403, the app should show a sign-in/access message instead of redirecting to `/agents`. If the same old behavior persists after using this package, confirm the development server is started from this extracted project directory and clear `.next` before restarting.
