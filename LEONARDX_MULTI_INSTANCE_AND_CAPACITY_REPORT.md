# LeonardX Multi-instance and Capacity Report

Date: 2026-10-12

## Status summary

- PARTIAL: app logic is designed to run multiple instances, but no multiple-instance staging validation was run here.
- BLOCKED: actual capacity and scaling behavior require a staging environment with multiple app instances, DB connections, and workers.
- VERIFIED WITH EVIDENCE: repo has explicit auth + DB + worker logic that should be reviewed for singleton assumptions.

## What was checked

- Next.js app has standard serverless-style request handling.
- Supabase is used for auth/session data and server-side DB access.
- worker logic runs via cron endpoint rather than dedicated background daemon.
- application behavior is not validated for race conditions or cross-instance duplicates.

## Multi-instance risk areas

- auth cookies and session assumptions
- rate limiting across nodes
- duplicate job execution
- payment finalization under parallel requests
- AI request concurrency and provider quotas
- deployment job deduplication
- webhook retry ordering and duplicate delivery
- database pool consumption under multiple instances

## Capacity estimate

At current local evidence, we cannot state a supported user count or throughput number. The only verified fact is: the project compiles and routes are generated successfully.

## Required validation before claiming scale

- run N app instances behind a local load balancer
- confirm DB pool capacity and slow query behavior
- test duplicate payment/credit flows under concurrency
- test concurrent AI request limits with mock provider
- validate worker leader election or cron coordination
- confirm queue backlog stays bounded

## Recommendation

Keep the architecture modest until the team has environment-backed concurrency evidence. The current design can support growth, but the current repo does not yet provide measured evidence for multi-instance production scale.

## Evidence status

- VERIFIED WITH EVIDENCE: code paths exist; app builds cleanly.
- PARTIAL: multi-instance concurrency testing remains to be executed.
- BLOCKED: external environment required.
