# LeonardX Disaster Recovery Plan

Date: 2026-10-12

## Status summary

- PARTIAL: backup and recovery processes are not documented end-to-end in this repo.
- BLOCKED: actual restore drill requires a valid staging environment and DB credentials.
- VERIFIED WITH EVIDENCE: application is configured for Supabase and external service hooks, but production backup/restore mechanics were not exercised here.

## Known dependencies

- Supabase Postgres and storage
- Vercel deployment artifacts
- provider credentials and env config
- source repos and deployment logs

## Recommended recovery objectives

- RTO: 4–12 hours for prod incidents, depending on severity
- RPO: less than 15 minutes if configured with point-in-time recovery

These are targets, not verified guarantee numbers.

## Required backup inventory

- database snapshots and PITR
- storage objects and generated site artifacts
- env files and secret vault entries
- deployment metadata and build history
- worker state, queue records, and webhook delivery log history

## Recovery procedure

1. confirm incident scope and freeze writes if necessary
2. restore DB from latest valid snapshot or PITR
3. restore app environment secrets and config from vault
4. redeploy application from known-good commit
5. rehydrate queue state and job records
6. verify auth, payment, AI, and project endpoints
7. validate webhooks and monitoring

## Recovery drill requirements

- Execute in isolated staging only.
- Do not perform destructive recovery in production.
- Test DB restore, env redeploy, and queue replay explicitly.

## Evidence status

- PARTIAL: backup and recovery plan exists at a policy level, not operationally verified.
- BLOCKED: restore drill cannot be run without credentials and a safe environment.
