# LeoX Store commerce release status

This document distinguishes implemented code from release work requiring real infrastructure, legal review, or operational evidence.

## Implemented in this worktree

- Owner-only moderation queue and approve/reject/remove/restore actions, with two-factor verification and moderation audit rows.
- Seller listing dashboard; seller-scoped listing lookup and pause/resume-for-review/mark-sold actions.
- Product discovery filters for text, category, country, region, city, currency and price, with bounded pagination.
- Seller profile, saved listing, seller delivery option, conversation, message, report, review, notification preference, audit, and private image attachment schema with row-level security.
- Participant-checked conversation/message APIs, unread counts, saved product APIs, report submission, and rate-limited image normalization to WebP.
- Migration configures private message storage and a public optimized product-image bucket with owner-scoped upload path policies.

## Not complete or not release verified

- **Database release:** Neither this migration nor the earlier listing migration has been applied. The locally linked Supabase ref is `xqyrbdsdojbxgqgghucf`; environment variables contain no Supabase access token, database password, URL, anon key, or service role key. The project metadata alone does not prove staging. Do not apply until an operator confirms the ref is the intended staging project. Verify schema/RLS, `consume_user_rate_limit`, and `user_rate_limits` after applying.
- **Moderation:** The queue is presently an API-backed page, not a fully integrated moderator role system. Access is limited to the existing owner + verified 2FA helper. Add scoped moderator roles before delegating.
- **Seller tools:** Editing listing details, seller profile UI, analytics backed by event data, profile completion, appeals, and verification review are not implemented. Resume returns a paused listing to `pending_review`.
- **Images:** Upload validates decoded image format and dimensions and produces WebP. Listing edits/removal cleanup, abuse scanning, malware/metadata policies, product image UI, and image retention are outstanding. Private conversation attachments have policies but no upload/signed-URL endpoints.
- **Discovery:** The code supports filters and page numbers, but category/country/region/city/currency catalogs, locale-aware location pickers, stable ranking based on marketplace events, and pagination UI remain outstanding.
- **Messaging:** Core text messaging and read/unread state are implemented. Blocking controls, conversation UI, attachment endpoints, push/email notification delivery, and abuse throttling review are outstanding.
- **Trust and safety:** Listing/report moderation audit foundations exist. Report review UI/workflow, appeals, prohibited product taxonomy/enforcement, seller verification workflow, and eligibility proof for reviews are outstanding. Review writes are not exposed until purchase transactions can establish eligibility.
- **Buyer/seller features:** Saved products work at API level. Delivery options and notification preferences have schema only; no management UI/delivery fulfillment integration exists.
- **Legal/privacy:** No policy text is published as approved legal advice. Retention, account/data deletion for marketplace records/storage, export, and consent flows need product/legal decisions and implementation.
- **Release verification:** No staging integration, migration apply/rollback rehearsal, RLS integration tests, mobile/browser QA, security/abuse test, backup check, or production health observation has been run.

## Staging release procedure

1. Confirm the Supabase project ref in the deployment control plane is staging and matches the configured CLI link; record the operator and timestamp.
2. Take/verify a recoverable staging backup. Review both Store migrations and compare the remote schema. Apply migrations to staging only.
3. Run authenticated and anonymous RLS checks: active listings are public; pending/rejected/removed listings are private; sellers cannot read or mutate another seller's listings/saves; unrelated users cannot read conversations or messages; only participants can write; message attachment access is participant-scoped; only owner + verified 2FA can moderate.
4. Verify the existing `user_rate_limits` table and `consume_user_rate_limit` RPC against the live schema. Exercise allowed and exceeded user/IP dimensions and confirm fail-closed behavior.
5. Run typecheck, targeted tests/lint, full test/lint, production build, browser/mobile checks, abuse/security checks, and the production preflight. Capture results and rollback steps before any production release.

## Rollback considerations

The migrations are additive, but the storage policies and buckets affect new Store assets. Stop Store write traffic first. Roll back with a separately reviewed forward migration that removes Store policies/buckets only after confirming no user assets need retention; restore the pre-migration database backup if schema rollback is unsafe. Never drop or recreate the existing rate-limit table/RPC as part of Store rollback.
