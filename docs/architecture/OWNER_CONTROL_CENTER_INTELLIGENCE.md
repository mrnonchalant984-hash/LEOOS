# Owner Control Center Intelligence

## Scope

This is an additive extension to the existing `/admin` Owner Control Center. It preserves the existing admin dashboard, authentication, user management, payment, subscription, and hosting screens. The new panel is protected by the existing owner identity, 2FA, and trusted-admin-device requirements.

## Data sources

The reporting API reads the existing production schema through the server-side service-role client. It currently uses:

- `profiles`, `ai_usage`, `payments`, `subscriptions`
- `hosting_subscriptions`, `hosting_renewal_payments`
- `agent_runs`, `agent_jobs`, `bram_tool_events`, `mcp_tool_audit`, `engineering_workflows`
- `website_projects`, `project_builds`, `deployment_events`, `cloudflare_preview_jobs`
- `workforce_worker_heartbeats`, `background_tasks`, `error_events`, `admin_logs`
- The additive pricing, FX, financial snapshot, credit policy, credit ledger, and expense tables created by the migration in this branch.

The analytics API has a 20,000-row cap per source. It reports truncation rather than pretending a capped result is complete. Date filters apply to usage, payment, hosting renewal, and expense reporting. The dashboard polls every 30 seconds; this is efficient polling, not a realtime database subscription.

## Financial rules

- Payment revenue is included only for verified successful/refunded payment records. Pending and failed payments are not revenue.
- Refunds are separated from gross revenue. The existing payment schema records a refund timestamp/reference but does not expose partial-refund amounts in the selected record contract; the current net calculation therefore treats a recorded refund as a full-payment refund.
- NGN revenue is calculated from the recorded kobo amount using integer/decimal arithmetic. Other currencies are listed but not silently converted.
- MRR is derived from active subscriptions linked to verified successful payments, using the recorded monthly/quarterly/yearly billing period. It is not a forward-looking forecast.
- Expenses are entered by the owner. USD expenses require a saved historical USD/NGN snapshot. Unconverted expenses make the NGN expense total/profit unavailable.
- AI commercial value uses the verified paid-tier model price effective at the request timestamp and a saved USD/NGN snapshot effective at that timestamp. No price is seeded by assumption.
- Actual AI cash expenditure is separate. It is unavailable unless the provider reports a cost or an administrator has evidence to confirm zero-cost usage. Token counts alone never become an actual bill.
- Net operating result is withheld until actual AI cost coverage and expense conversion coverage are complete. Estimated AI value is never subtracted from actual cash profit.
- The model pricing form requires an owner confirmation and HTTPS source URL. This is an attestation, not automated verification of the external source.

## Credits

The current production plan catalogue has feature-specific allowances and separate developer API credits; it does not establish a generic AI-token allowance and token-to-credit conversion. The migration adds an owner-configurable policy and immutable AI usage credit ledger. The UI can preview eligible historical charges, but it does not deduct balances or apply historical charges. This is deliberate until the owner approves which plan allowance/balance funds token credits and the associated no-negative-balance rules. Image-generation and failed requests are excluded from the preview.

## Health monitoring

The Gemini check requests the model catalogue only; it does not generate a completion. Gemini model presence is reported separately. Supabase database/Auth/Storage, optional GitHub/Vercel/Cloudflare APIs, MCP reachability, queue backlog, and worker heartbeat are checked independently. Missing credentials, unavailable heartbeat evidence, or an unsupported scheduler heartbeat are reported as UNKNOWN, not green.

## Hosting renewal reminders

The new cron endpoint sends a reminder for each individual hosting record whose next renewal is within 30 days. It respects the linked account's email opt-out and updates `last_reminder_at` only after successful delivery. The GitHub Actions workflow runs daily at 09:00 UTC and can also be manually dispatched. It requires repository secrets `BRAVERTON_APP_URL` and `CRON_SECRET`, plus a server-side Web3Forms access key in the application environment. Without these settings, the workflow skips or the endpoint returns a configuration error; it does not claim delivery.

## Deployment and production gate

The migration is additive and is not applied to production by this branch. No merge or production deployment is performed here. The draft must pass lint, tests, typecheck, and production build, followed by an owner-approved migration/rollback review and live acceptance using real records before production use.
