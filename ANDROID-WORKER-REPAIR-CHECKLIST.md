# LeonardX Android Worker: remaining repairs

- [ ] Review and merge Version 5 source into the default branch.
- [ ] Confirm queue and reliability SQL migrations in the production Supabase migration ledger.
- [ ] Add GitHub Actions secrets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` pointing to that exact production project.
- [ ] Ensure GitHub Actions is enabled; manually run `LeonardX Android build queue worker`.
- [ ] Confirm read-only preflight passes (queue schema exists; `leo-files` exists and is private).
- [ ] Confirm worker claims the intended queued job (it claims the oldest eligible job, not a requested job ID).
- [ ] Set Vercel `ANDROID_HOSTED_WORKER_ENABLED=true` only after the hosted worker is configured; redeploy.
- [ ] Recheck MCP capabilities for `hostedWorkerEnabled=true` and `buildMode=hosted-github-actions`.
- [ ] Recheck job status for completed + progress 100 + positive size + SHA-256 + completed timestamp.
- [ ] Download as the owning user via LeonardX authenticated artifact route; compare actual bytes SHA-256.
- [ ] Run full test/typecheck/lint/production build after installing dependencies.
- [ ] Review GitHub Actions runner minutes; the five-minute polling workflow uses GitHub runner time.
- [ ] Leave `vercel.json` and existing Vercel Hobby cron schedules unchanged.
