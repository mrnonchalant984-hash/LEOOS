# LeonardX implementation update — 13 November 2026

## Scope changed in this batch

### AI streaming and agent execution

- Added authenticated `POST /api/agents/run/stream`, which reuses the existing protected agent-run endpoint and durable worker queue rather than creating a second execution engine.
- Added SSE lifecycle events for queued/running/terminal states and persisted per-tool `tool_started`, `tool_completed`, and `tool_failed` events. Tool arguments and credentials are not emitted to the browser.
- Updated the Agents workspace to consume the SSE stream and display agent/tool progress. If approval is required, the route returns the existing approval response and leaves the established approval workflow intact.
- Existing ordinary Leo chat streaming remains in `/api/chat/stream`; build/repository/image workflows continue to use their existing guarded routes until each one is migrated separately.

### Image generation diagnosis and repair

- The configured `gemini-nano-banana-2.1` model is an image-generation model in Google's current Gemini API model catalogue; it is not inherently a text-only model.
- The previous integration used `client.interactions.create(...)` and expected a top-level `output_image` property. The Gemini image response path used here is the documented `models.generateContent` response with `responseModalities: ['IMAGE']`, and the image bytes are returned in candidate content parts as `inlineData`.
- Replaced the previous response handling with `client.models.generateContent`, image response modality, image configuration, optional input-image `inlineData` for editing, candidate-part extraction, MIME validation, and explicit missing-image diagnostics.
- Image generation and image editing share this provider implementation. The 3D-concept and diagram modes still produce still images, not interactive 3D scenes.
- Improved image and visual route error classification so model-access/billing configuration failures are not hidden behind a generic temporary error.
- A live image request still needs to be verified with the production Gemini key and billing project. No credentials were available in this workspace.

### Affiliate dashboards and referral APIs

- Added affiliate application and dashboard APIs, referral-code generation, owner-only approval/rejection, referral click tracking, 30-day click attribution, self-referral rejection, and checkout attribution through an HttpOnly cookie.
- Added an affiliate dashboard showing referral visits, attributed orders, commission rate, and commission ledger.
- Commission entries are created only after all seller fulfillment rows are delivered and buyer-confirmed, with no open/reviewing dispute. The seven-day delay can be moved from `pending` to `eligible` by the scoped eligibility refresh function.
- Commission records are accounting entries only. No affiliate transfer or cash-out flow is claimed.

### Supplier centre and dropshipping workflows

- Added supplier application, owner review/approval, supplier dashboard, supplier catalogue creation, product activation/pausing, and supplier fulfilment update APIs.
- Added supplier catalogue and fulfilment UI, dropship listing creation, and owner-only supplier verification pages.
- Normal marketplace listing moderation remains mandatory: a dropship listing is created as `pending_review`; only the existing marketplace approval path can publish it.
- On confirmed payment, the database trigger creates supplier fulfilment requests, checks supplier verification and available stock, reserves supplier stock, and records an explicit failure/attention event if the supplier cannot fulfil.
- Supplier inventory changes synchronize the dropship listing stock. Supplier rejection/cancellation/failure restores reserved supplier stock. Supplier tracking updates synchronize the seller-facing fulfillment record; the buyer must still confirm delivery.
- This is an internal automated order/stock/fulfillment workflow. Automatic dispatch into an external supplier's own ERP/API is not complete because no supplier-specific API contracts, credentials, or webhook specifications were supplied. Suppliers currently accept and update fulfilment in the LeoX Supplier Centre.

### SecurePay/provider-dependent settlement

- Added a central settlement readiness adapter and included settlement mode in the owner commerce overview.
- The current active option remains Paystack delayed transfer after buyer-confirmed delivery, gated by `STORE_PAYOUTS_ENABLED=true` and a server-side `PAYSTACK_SECRET_KEY`.
- Explicitly reports `escrow: false` and `providerManagedSplit: false`. The platform does not claim to hold customer funds in an escrow or wallet.
- Added `LEOX_STORE_SECURE_SETTLEMENT.md` describing the current boundary and the provider-managed split work still required. Paystack split payments are a separate subaccount/split-group capability; the current multi-vendor checkout does not dynamically build a verified seller-specific split for each cart. That mode must remain disabled until the registered business account owner and provider confirm eligibility, setup, fees, refund/dispute handling, and applicable legal requirements.

### Full commerce administration

- Added an owner-only commerce overview API and admin page covering orders, seller payout states, affiliate commission liabilities, supplier fulfilment, and provider settlement mode.
- Added separate owner-only affiliate and supplier review pages and links from the existing marketplace operations screen.
- Existing product moderation, seller verification, dispute, refund, support, privacy and order workflows were preserved.

## Verification

- New targeted static regression tests for streaming agent/tool events, image response extraction, affiliate checkout attribution, and supplier stock/fulfilment workflows passed.
- Targeted static regression batch: 19 passed. The existing runtime image-model test could not import `@google/genai` because the SDK is not installed in the supplied workspace.
- Full repository test run: 446 tests total, 435 passed, 9 failed, 2 skipped. The failures are dependency-loading failures in this workspace, including missing `zod` and `jszip`; no assertion failure was reported by the newly added static tests.
- Typecheck, ESLint and production build were not completed because `node_modules` is absent (`next`, `tsc`, and required packages are not installed).
- Live Gemini image generation, live agent worker execution, staging Supabase trigger behavior, live Paystack settlement and browser UI checks remain unverified.
- The new migration was not applied. No production database was modified.
- No GitHub push or Vercel deployment was performed.

## Honest completion status

| Area | Status | Remaining verification/work |
|---|---|---|
| Ordinary Leo text streaming | Implemented in code; not live-verified | Install dependencies, typecheck/build, live Gemini and browser test. |
| Agent/tool progress streaming | Implemented against durable worker/event records; not live-verified | Confirm worker scheduler, DB event writes and browser SSE under staging. |
| Image generation/editing | Provider response integration repaired in code | Confirm server environment uses an enabled image model and valid Gemini key/billing; run live generation/edit test. |
| Affiliate APIs/dashboard | Implemented in code | Apply migration in staging; test click cookie, checkout attribution, refunds/disputes and commission ledger. No affiliate payout flow. |
| Supplier APIs/dashboard/verification | Implemented in code | Apply migration and verify owner review, supplier inventory and fulfillment transitions in staging. |
| Dropshipping | Internal order/stock/fulfilment automation implemented | External supplier ERP/API dispatch and webhook adapters require supplier-specific integration details. Manual supplier fulfilment remains available. |
| SecurePay/provider settlement | Provider-gated delayed Paystack transfer only | Provider-managed split settlement is not implemented; no escrow/custody claim. Requires business/provider setup and legal review. |
| Commerce administration | Read-only operational overview plus affiliate/supplier review pages | Add remaining operational actions only after staging workflows and provider reconciliation are verified. |

## Deployment safety

No production deployment, production database write, live payment transfer, or live checkout test was performed. Apply the migration in staging first and run the full verification suite after installing the repository's locked dependencies.


## Provider settlement and cash-out extension (2026-11-13)

- Added Paystack seller subaccount provisioning behind `STORE_PAYSTACK_SPLIT_ENABLED` and dynamic multi-split checkout using flat per-seller line-item shares. The flag remains false by default. Paystack provider-managed multi-split is not active until the registered business is approved and every seller has a verified subaccount.
- Added affiliate bank-recipient verification, payout requests for eligible commissions, owner approval/rejection, provider transfer initiation and reference-based reconciliation. `AFFILIATE_PAYOUTS_ENABLED` remains false by default; adult/legal owner and provider approval are prerequisites.
- Added an external supplier webhook adapter with HTTPS host allowlisting, server-only tokens, idempotency keys, immediate best-effort dispatch from the verified payment webhook and a protected retry worker. Supplier API-specific mapping and credentials must be configured for each supplier.
- Added admin affiliate payout review page and documented setup in `LEOX_STORE_PROVIDER_INTEGRATIONS.md`.
- Regression tests for the new provider flows: 15 targeted tests passed. No migrations were applied; no live Paystack transfer, supplier dispatch, GitHub push or production deployment was performed.

## Provider settlement, affiliate cash-out and supplier dispatch update (2026-11-13)

### Added
- Paystack subaccount creation for verified sellers when `STORE_PAYSTACK_SPLIT_ENABLED=true`; dynamic multi-split checkout distributes each seller's line-item share and leaves the platform commission in the primary account. Missing seller subaccounts fail checkout closed. The feature flag remains `false` by default.
- Affiliate payout destination verification, affiliate-submitted payout requests, owner approval/rejection, Paystack transfer initiation, and transfer webhook/reference reconciliation. `AFFILIATE_PAYOUTS_ENABLED=false` by default; enabling requires registered-business/provider approval and adult/legal owner review.
- Supplier webhook dispatch with server-only connector tokens, HTTPS exact-host allowlisting, idempotency keys, immediate best-effort dispatch after verified payment, and a protected retry endpoint at `/api/cron/store/supplier-dispatch`.
- Admin affiliate payout review page at `/admin/store/affiliate-payouts`.
- Setup and provider contract documentation in `LEOX_STORE_PROVIDER_INTEGRATIONS.md`.

### Verification status
- 20 targeted regression tests passed.
- Full suite: 450 tests; 439 passed, 9 failed, 2 skipped. The 9 failures are dependency-loading failures in the supplied workspace (`zod`, `jszip`, `@google/genai`, `@modelcontextprotocol/sdk`, `ajv`, and `undici` are absent); no assertion failure from the new targeted tests.
- `npm run typecheck` remains blocked because `next` is not installed (`next: not found`). Production build and lint therefore remain unverified.
- No Supabase migration was applied. No live Paystack transfer, live supplier dispatch, GitHub push, or production deployment was performed.

### Important rollout controls
- `STORE_PAYSTACK_SPLIT_ENABLED=false`
- `AFFILIATE_PAYOUTS_ENABLED=false`
- `STORE_SUPPLIER_CONNECTORS_JSON={}`
- `STORE_SUPPLIER_CONNECTOR_ALLOWED_HOSTS=`

Keep the payment flags disabled until business/provider approval, reconciliation testing, and adult/legal owner review are complete. The external supplier adapter requires a supplier-specific contract-compatible endpoint and credentials; it does not magically integrate arbitrary supplier APIs.
