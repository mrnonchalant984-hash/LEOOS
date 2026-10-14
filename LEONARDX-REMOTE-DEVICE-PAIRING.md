# LeonardX Remote Device Pairing

This release adds a server-mediated remote workspace relay to Leo AI.

## Included
- Same-account device pairing using a one-time 10-character hexadecimal code.
- Pairing codes are SHA-256 hashed in the database, expire after five minutes, and can be claimed once.
- Authenticated create/claim/list/revoke API endpoints, with shared database-backed rate limiting.
- A paired-device list, live message relay, and a “Share current chat” handoff that lets the other device open the same server-backed chat session.
- Server-sent events (SSE) for low-latency updates, with server-side event polling and reconnection.
- RLS enabled and direct `anon`/`authenticated` table grants revoked; access is mediated by server handlers using the service role.
- Revoking a pair terminates the stream on its next server-side status check.

## Required setup
1. Configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in the deployment environment.
2. Apply `supabase/migrations/20261013180000_remote_device_pairing.sql` to the same Supabase project.
3. Deploy the updated Next.js application.
4. Sign in to the same Leo account on both devices. On the first device choose **Remote devices → Generate pairing code**. On the second choose **Remote devices → Pair this device** and enter the code.

## Scope and safety boundary
The relay provides authenticated cross-device messaging/events, a shared connection status, and explicit handoff of a server-backed chat session. It does **not** grant browser screen capture, mouse/keyboard control, or arbitrary laptop command execution. Those capabilities require a separately installed desktop agent, explicit OS-level consent, and a narrowly scoped command protocol; this implementation intentionally does not pretend browser-only pairing can control the operating system.

## Verification
The `tests/remote-device-pairing.test.mjs` tests check key security and wiring invariants. Full TypeScript, ESLint, test suite, and production build must be run in an environment with dependencies installed. The migration must be applied before the endpoints can operate in production.
