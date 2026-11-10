# LeoX Store known issues and launch blockers

This implementation is a tested foundation slice, **not a production-ready marketplace**.

## Blocking gaps

- The new migration is not applied or validated against staging; credentials and live schema status are unverified.
- The repository-wide test and lint commands fail on NUL-filled tracked test files; an existing sandbox contract test also expects an unimplemented `DELETE` route.
- No moderator/admin workflow can approve or reject submitted listings. New listings remain private in `pending_review` until that system exists.
- No seller profile onboarding/dashboard, listing editing/removal, product images or secure storage, buyer-seller messaging, saved items, delivery configuration, reviews, verification, notifications, or seller analytics.
- Country/currency data is not authoritative or complete; the current form accepts a user-entered ISO-style code and does not convert currencies.
- No prohibited-product moderation, reporting, appeals, account enforcement, or marketplace audit trail.
- No dynamic country/city/category/seller discovery routes or browser-level/mobile acceptance evidence.
- Production configuration, migration state, backups, and deployment health are unverified; no deployment occurred.

Do not select a production-ready or deployed release status until these controls and release gates are implemented and verified.
