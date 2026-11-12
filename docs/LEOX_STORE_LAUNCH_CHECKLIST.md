# LeoX Store launch checklist

This is an implementation and release checklist. A checked-in feature is not a production approval. Live checkout remains gated until the operator confirms that the configured Supabase and Paystack accounts are the intended production accounts and completes the business configuration below.

## Implemented in application code

- Seller-managed fulfillment status, delivery notes, courier name, HTTPS tracking link and delivery issue capture. Buyers receive an in-app order notification. No courier API or live rate quote is connected.
- Buyers and sellers can open order disputes; staff has an owner/2FA-protected work queue for dispute review and resolution.
- Report review endpoint with moderation audit records, plus an appeal submission path for affected users.
- Seller verification requests and staff decision workflow. Verification does not collect identity documents; define a safe provider and evidence policy before treating the badge as identity assurance.
- Support ticket submission and owner work queue.
- Usable signed-in inbox with block/unblock, reporting, constrained image/PDF upload, private storage and short-lived participant-scoped signed download links. Malware scanning and retention/cleanup still require an operational decision.
- Privacy export endpoint for account and marketplace records, and a deletion request workflow. Deletion requests are reviewed and do not hard-delete financial records automatically.
- In-app notifications and optional email delivery for new messages and fulfillment changes, controlled by per-user preferences. Email requires configured Resend credentials and verified sender. Push delivery is not connected.

## Required before live buyers

- [ ] Confirm Supabase project reference, environment, backup and recovery owner. Do not assume a project is staging because it is linked.
- [ ] Apply migration `20261111140000_leox_store_launch_workflows.sql` in staging and verify each table's RLS, grants, policies, indexes, and service-role access.
- [ ] Run cross-account RLS checks with at least two buyers and two sellers: orders, fulfillments, disputes, inbox, reports, verification requests, tickets, data requests, notifications, and private storage.
- [ ] Add automated tests for migration idempotency, state transitions and access control. The migration and application changes in this branch have not been applied to staging or verified against live database credentials.
- [ ] Confirm Paystack account, webhook signature validation, callback URLs, refund process, seller payout model, settlement timing and reconciliation. Keep live payment routing disabled until a responsible operator approves these values.
- [ ] Set `STORE_CHECKOUT_ENABLED=true` only after the preceding payment and business settings have written approval. Checkout returns 503 while it is unset or false.
- [ ] Decide delivery collection, seller delivery rules, courier coverage/rates, tracking provider, delivery issue SLA, return policy, and tax/VAT rules for each launch market.
- [ ] Configure email provider and sender domain. Push notifications need a selected provider, user consent and device-token lifecycle.
- [ ] Approve marketplace terms, privacy notice, prohibited items, returns, seller verification, dispute and retention policies with qualified reviewers.
- [ ] Provide user deletion/data export service-level targets and retention exceptions for orders, payments, disputes and abuse evidence.
- [ ] Complete end-to-end browser and mobile checks, keyboard/accessibility checks, payment sandbox tests, abuse/security review, backup restore drill, rollback rehearsal, and monitoring/alert ownership.
- [ ] Verify production health after a controlled launch: checkout success/failure rates, webhook lag, refund exceptions, order fulfillment age, report backlog, support response time, database errors and storage access.

## Rollback notes

Take and verify a database backup before applying a production migration. Prefer a forward-fix for schema changes. If rollback is required, stop checkout and writes first, preserve orders/payment records, and have the database operator assess dependent records before removing any tables or columns. Restore from the pre-migration backup only under the approved recovery plan. Reconcile Paystack transactions and webhook deliveries after any restore.
