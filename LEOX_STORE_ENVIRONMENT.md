# LeoX Store environment

Required application configuration:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — server only; never prefix with `NEXT_PUBLIC_`.
- `STORE_CHECKOUT_ENABLED` — set to literal `true` only after all payment/business/security release gates are approved. Leave unset or `false` to keep checkout disabled.
- `STORE_PAYOUTS_ENABLED` — set to literal `true` only after Paystack transfer approval, verified recipient/bank workflow, and payout operations are ready. Checkout also requires this flag.
- `PAYSTACK_SECRET_KEY` — server-side Paystack key required for initialization, verification, webhook validation, and refund operations.
- `NEXT_PUBLIC_SITE_URL` — production HTTPS origin used for payment return links and notification links; configure and verify the corresponding Paystack callback/webhook URLs.
- `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, and `WEB_PUSH_SUBJECT` — VAPID credentials/contact subject for opt-in web push. Keep the private key server-side. Push UI stays hidden unless all three are configured.

The Store uses the existing `user_rate_limits` table and `consume_user_rate_limit` RPC. Optional notification email delivery uses the existing mail configuration (`RESEND_API_KEY`, `CONTACT_FROM_EMAIL`) when configured. `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` is present in the repository template for other payment surfaces; Store checkout and transfers are initiated server-side and do not rely on a browser-supplied key.

Use local ignored environment files or encrypted hosting settings; never put credentials in source control. The complete implementation and checkout gates are in [LEOX_STORE_RELEASE_GAPS.md](./LEOX_STORE_RELEASE_GAPS.md). A static configuration check does not prove provider approval or production health.
