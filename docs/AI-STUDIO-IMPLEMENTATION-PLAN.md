# AI Studio implementation plan

## Dependency-ordered stages

1. **Audit existing infrastructure:** Next.js/React versions, auth, credits, image/video providers, generation jobs, media storage, migrations, tests, and deployment schedule.
2. **Secure image-edit vertical slice:** validate upload and prompt, authenticate and rate-limit, reuse existing credit controls, call the configured image provider, save original and result privately, persist job status, issue signed result URLs, and cover validation with tests.
3. **Studio workspace:** add responsive controls for only supported text-to-image, image-edit, and text-to-video operations; show provider results and bounded private history; link it from app navigation.
4. **Release evidence:** run targeted tests, TypeScript, lint, and build. Record which provider calls were verified with live credentials versus tested locally or with mocks.

## Current implementation scope

Stages 1–3 are implemented for the operations listed in the architecture matrix. This is a useful working vertical slice, not the entire multi-provider creative platform.

## Deferred work and prerequisites

- Image-to-video and video editing require a verified provider capability, server adapter, provider-specific validation and job lifecycle.
- Durable projects and media organization require an explicit creative project-to-asset schema and ownership/RLS policies.
- Durable async image edits require a worker/scheduler architecture suitable for the deployed plan; the current edit call is synchronous.
- Templates, masks, reference images, batch generation, prompt enhancement, admin provider health, and generation analytics need separate implementation and provider evidence.
- Real-provider smoke tests require valid configured non-production provider credentials and available credits. Automated/static checks do not substitute for that evidence.
- Billing prices must not be inferred from UI settings. Configure credit conversions only after reviewing current provider pricing.
