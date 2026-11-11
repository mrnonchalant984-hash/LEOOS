# LeonardX deployment and CI/CD guide

The supported release gate is `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`. Review migrations with `npm run db:dry-run`; applying them is a separate approved action. Vercel environment variables must be configured per environment, and production deployment/rollback remains an external operator action. The current successful build is recorded in [`LEONARDX_SCALABILITY_IMPLEMENTATION_LOG.md`](./LEONARDX_SCALABILITY_IMPLEMENTATION_LOG.md).

## Cloudflare Workers

Cloudflare deployment uses the OpenNext adapter, not a plain Next.js build followed by `wrangler deploy`. In the Cloudflare Workers build settings, set:

- Build command: `npm run cloudflare:build`
- Deploy command: `npm run cloudflare:deploy`

The build command runs the normal typecheck and Next.js build, then adapts its output into `.open-next/worker.js`. The deploy command uses the OpenNext adapter to deploy that Worker. `wrangler.jsonc` points Wrangler to this generated entry point and disables source-map uploads because the generated maps exceed Cloudflare's upload limit. Do not configure `npm run build` and `npx wrangler deploy` as the Cloudflare commands; that combination does not produce the Worker entry point.

The adapter dependency is recorded in `package.json` and `package-lock.json`; it will be installed by the normal clean install in Cloudflare's build environment.
