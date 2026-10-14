LeonardX UX upgrade overlay

Contents:
- LeonardX-UX-Upgrade.patch: patch for the reviewed baseline file blobs. It adds the separate Developer API pricing route, links it from Leo AI pricing, and improves workspace navigation.
- app/developers/pricing/page.tsx and tests/workspace-navigation.test.mjs: included for direct inspection.
- LEONARDX-UX-AND-READINESS-REPORT.md: source-level readiness findings and staging checklist.

Apply from the root of a clean checkout of the reviewed LeonardX main baseline:
  git apply --check LeonardX-UX-Upgrade.patch
  git apply LeonardX-UX-Upgrade.patch
  node --test tests/workspace-navigation.test.mjs

This package was not pushed to GitHub because the connected GitHub integration denied branch creation with HTTP 403. No commit, pull request, merge, database migration, or deployment was performed. Paid Developer API prices/quotas remain intentionally unpublished until approved and enforced server-side.
