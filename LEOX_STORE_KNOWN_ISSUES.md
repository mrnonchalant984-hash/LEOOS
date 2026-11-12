# LeoX Store known issues and launch blockers

The earlier “foundation slice” issue list is obsolete. The application now contains broader buyer, seller, moderation, messaging, and payment code; presence in source does not prove a feature is complete or release-ready.

The current gaps are tracked in one place: [LEOX_STORE_RELEASE_GAPS.md](./LEOX_STORE_RELEASE_GAPS.md). Key blockers include:

- Paystack checkout/payout transfers require explicit environment flags, provider approval, credentials, reconciliation operations, and environment-specific test evidence.
- The new delivery/payout/push migration is local only and has not been applied; recorded remote migration history predates it.
- Seller delivery is arranged by the seller, with manually entered courier/tracking details; external courier booking/status APIs are not part of the selected workflow.
- Product image upload/edit/removal exists with a 2 MB input cap and 700 KB optimized WebP limit, but malware scanning and retention policy are unresolved.
- In-app/email and opt-in VAPID push code exists; VAPID configuration, browser end-to-end tests, delivery guarantees, and complete event coverage are outstanding.
- Live cross-account RLS/security testing, end-to-end browser/mobile validation, backup recovery, monitoring, legal approval, and production health checks are not evidenced.

Do not treat the feature set as production-ready. Preserve the fail-closed checkout gate until all release blockers are closed with recorded evidence.
