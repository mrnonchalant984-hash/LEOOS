# LeonardX troubleshooting playbook

- Build fails: run `npm run typecheck`, then `npm run lint`, inspect the first source error, and rerun `npm run build`.
- Migration mismatch: run `npm run db:dry-run`; do not reset production.
- 401 API: check key prefix, scope, expiry/revocation and base URL; never print the key.
- 429 API: honor `Retry-After` and inspect shared limiter health.
- Webhook retry backlog: inspect signature, endpoint safety, response status and claim age.
- Agent queue stuck: verify `CRON_SECRET`, worker flag, scheduler invocation and lease/retry state.
- Missing monitoring: verify Vercel/Sentry project configuration manually; do not infer from code presence.
