# LeonardX deployment and CI/CD guide

The supported release gate is `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`. Review migrations with `npm run db:dry-run`; applying them is a separate approved action. Vercel environment variables must be configured per environment, and production deployment/rollback remains an external operator action. The current successful build is recorded in [`LEONARDX_SCALABILITY_IMPLEMENTATION_LOG.md`](./LEONARDX_SCALABILITY_IMPLEMENTATION_LOG.md).
