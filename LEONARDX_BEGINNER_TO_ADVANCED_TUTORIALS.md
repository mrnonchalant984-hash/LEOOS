# LeonardX tutorials

1. Run `npm install`, then `npm run dev`; never copy `.env` values into chat or commits.
2. Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build` before a release.
3. Create an API key in `/developers`, keep it server-side, and use the examples in [`packages/sdk/README.md`](./packages/sdk/README.md).
4. Use `npm run db:dry-run` before an approved migration; never use reset against a shared project.
5. For incidents, follow [`LEONARDX_OBSERVABILITY_AND_INCIDENT_RUNBOOK.md`](./LEONARDX_OBSERVABILITY_AND_INCIDENT_RUNBOOK.md).
6. For scale exercises, use only seeded staging fixtures from [`LEONARDX_LOAD_TEST_PLAN.md`](./LEONARDX_LOAD_TEST_PLAN.md).
