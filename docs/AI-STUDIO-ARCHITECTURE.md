# LeonardX AI Studio Architecture

Updated: 2026-10-29

## Existing architecture

LeonardX is a Next.js App Router application using React, TypeScript, Supabase Auth/Postgres/Storage, Google Gemini for platform text/image workflows, and the existing Runway video integration. The Studio reuses the existing `generation_jobs`, `media_assets`, private `leo-files` storage, platform credits, and image-generation entitlement; it does not create a second billing system or public storage bucket.

## Current workflow map

1. `/studio` renders within the existing application shell.
2. The client calls authenticated App Router handlers; it never receives provider credentials or selects arbitrary provider URLs.
3. Text-to-image delegates to `/api/generate-image`, which uses the image-capable Gemini model configured by `LEO_GEMINI_IMAGE_MODEL` (default `gemini-nano-banana-2.1`). Explicit image-generation requests in normal Leo Chat use the same server-side generation and credit path.
4. Image editing posts a multipart image and prompt to `/api/studio/edit-image`. The server validates authentication, rate limits, prompt length, image size, declared MIME type and file signature before calling the Gemini image model.
5. Source and result images are stored as user-owned rows in `media_assets` under private paths in the existing `leo-files` bucket. Jobs and assets are associated with the authenticated user; signed URLs are created only after checking ownership.
6. `/api/studio/history` returns a bounded page of the current user's generation jobs and signed URLs for that user's stored assets.
7. Credit reservation and refund use existing server-side accounting functions. Provider failures check the idempotent refund result and job-state updates; uncertain recovery is returned as an explicit support-required error rather than a success-shaped refund claim.
8. Text-to-video delegates to the existing `/api/generate-video` Runway workflow and polls its persisted job status.

## Capability matrix

| Capability | Provider | Status and limits |
| --- | --- | --- |
| Text-to-image | Gemini image model | Implemented in source; live provider, storage, credit, and RLS tests still required. |
| Image edit | Gemini image model | Synchronous for one PNG, JPEG, or WebP source up to 4 MB; live provider, storage, credit, and RLS tests still required. |
| Text-to-video | Runway | Existing asynchronous workflow; requires provider configuration and applicable plan/credit access. |
| Image-to-video | Not verified | Do not advertise as available until a supported provider workflow is confirmed. |
| Live audio/realtime | Gemini audio | Currently unavailable; no end-to-end workflow is certified. |
| Hosted browser/computer use | Not available | Disabled; the owner console shows this state rather than claiming execution. |
| Project media save/reuse | Not exposed in Studio | No fake save action is presented. |

## Security boundaries

- Provider calls and service-role database access run server-side.
- The caller's user ID comes from authenticated server context, not request payloads.
- Generation history, jobs, and media queries constrain by authenticated user ID.
- Storage remains private; clients use short-lived signed URLs after ownership checks.
- Chat history stores an authenticated media-asset reference; the media route rechecks ownership before issuing a fresh short-lived URL.
- Image edits are limited to 4 MB and PNG/JPEG/WebP with matching file signatures and declared MIME type.
- Image-edit requests are rate-limited and use idempotency keys.
- Prompts, images, and user identifiers are not logged by the image workflow.

## Deployment gates

Before enabling or certifying Studio in production, run credentialed staging checks for Gemini generation/edit, private storage, per-account isolation, idempotency, credit reserve/settlement/refund, and migration presence. Static tests alone are not proof of live provider or database correctness. This implementation has not been verified against live Gemini credentials, production Supabase storage, or a staging database. Local tests and static checks do not certify provider access, credit accounting, storage policies, or production readiness.
