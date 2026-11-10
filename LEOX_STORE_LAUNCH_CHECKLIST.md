# LeoX Store launch checklist

## Implemented in this worktree

- [x] Repository and app architecture inspected; existing App Router, auth, Supabase, and visual design reused.
- [x] Public listing discovery and active product details added.
- [x] Authenticated submissions validated and held for moderation.
- [x] Additive database migration and Store SEO metadata/sitemap support added.
- [x] Listing validation unit tests, typecheck, and targeted lint pass.

## Release gates still open

- [ ] Repair the two NUL-filled tracked test files and resolve the existing sandbox contract test failure.
- [ ] Implement and authorize seller listing management plus moderator review.
- [ ] Implement seller profiles, images/storage, private messaging, saved products, delivery, trust/reviews, reporting, notifications, and admin controls.
- [ ] Complete full African country/currency data and safe location/category filters.
- [ ] Apply migration and verify constraints, RLS, and limiter RPC in staging.
- [ ] Pass full lint, full test suite, production build, API/security/RLS and browser/mobile tests.
- [ ] Verify staging configuration, backups, monitoring, and rollout/rollback.
- [ ] Obtain explicit authorization before production migration or deployment.
