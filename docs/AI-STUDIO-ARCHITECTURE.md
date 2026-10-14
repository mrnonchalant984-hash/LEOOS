# AI Studio architecture

## Repository baseline

LeonardX is a Next.js 16.3.6 App Router application using React 19, TypeScript, Supabase Auth/Postgres/Storage, OpenAI's Node SDK, and an existing Runway integration. The workspace shell lives in `components/LEOAppShell.tsx`. Image generation already uses `generation_jobs`, `media_assets`, private `leo-files` storage, platform credits, and the `image_generation` feature allowance. Text-to-video already uses Runway Gen-4.5 with persisted jobs and status polling.

The Studio composes these existing systems and adds an authenticated image-edit operation. It does not introduce a second billing system, storage bucket, project model, or job queue.

## Request and data flow

1. `/studio` renders the workspace within the standard LeonardX app shell.
2. The client calls authenticated App Router handlers. It never receives provider credentials or chooses arbitrary provider URLs.
3. Text-to-image delegates to `/api/generate-image`.
4. Text-to-video delegates to `/api/generate-video`; the client polls `/api/generate-video/status` for its persisted Runway job.
5. Image editing posts a multipart image and prompt to `/api/studio/edit-image`. The server checks authentication, rate limits, prompt length, image size, declared MIME type and file signature before calling the configured OpenAI-compatible image API.
6. Source and result images are written as separate user-owned rows in `media_assets` and stored under non-public paths in the existing `leo-files` bucket. Jobs are associated to the authenticated user. The result route issues short-lived signed URLs only after checking asset ownership.
7. `/api/studio/history` returns a bounded page of the current user's generation jobs and freshly signed URLs for their stored assets. Storage paths and provider secrets are not returned.
8. Platform credit reservation and legacy feature-credit fallback reuse the existing server-side accounting RPCs. Provider failures attempt the existing idempotent refund paths.

## Provider capability matrix

| Capability | Provider | Status and limits |
| --- | --- | --- |
| Text-to-image | OpenAI Images API | Existing synchronous workflow. Uses `LEO_IMAGE_MODEL` or the existing default; output is stored privately. |
| Image edit | OpenAI Images API `images.edit` | Implemented synchronously for one PNG, JPEG, or WebP source no larger than 4 MB. Uses the configured image model and saves source and result separately. |
| Text-to-video | Runway Gen-4.5 | Existing asynchronous workflow; 2–10 seconds, landscape or portrait. Requires provider configuration and applicable plan/credit access. |
| Image-to-video | None exposed | Not implemented by the existing Runway adapter. |
| Project save/reuse | Not exposed in Studio | Existing website projects are not a suitable creative-project/media relationship; no fake save action is presented. |
| Masks, multiple references, templates, prompt enhancement | Not exposed | Not currently implemented and not advertised as supported. |

Provider capability availability still depends on server-side credentials, account access, plan/credit configuration, and provider service availability. A local text-model URL is not used for image or video operations.

## Security boundaries

- All provider calls and service-role database access run server-side.
- The caller's user ID comes from `getProfile`; request payloads cannot select another owner or asset.
- Generation history, jobs, and media queries constrain by authenticated user ID.
- Storage remains private; client access uses asset IDs routed through the ownership-checked media endpoint.
- Image edits are limited to 4 MB and PNG/JPEG/WebP with matching file signatures and declared MIME type. Filenames are not used as storage paths.
- Image-edit requests are rate-limited and use idempotency keys.
- Prompt, image, and user identifiers are not written to application logs by this feature.
- Credit reservation/refund uses the existing database functions. Refund failures are reported to the caller for support reconciliation.

## Deployment and operations

Required server configuration is the existing `OPENAI_API_KEY` (or supported `LEO_API_KEY`), Supabase URL and service-role key, plus the existing private `leo-files` bucket and the generation/credit migration. `LEO_IMAGE_MODEL` optionally selects the server-side image model. Video additionally requires `RUNWAYML_API_SECRET`, supported `RUNWAY_VIDEO_MODEL`, and configured credit conversion for non-owner accounts.

No new database migration was added. Before enabling this feature in an environment, verify that `20261013110000_leonardx_generation_credits.sql` has been applied and the `leo-files` bucket exists and is private. Do not enable public storage access.

The image edit runs synchronously inside a bounded Node.js route (maximum duration 120 seconds). It is not a durable queued edit workflow. Monitor the existing generation job records and provider usage. For rollback, revert the Studio route/page and navigation entry; existing image/video APIs and their tables remain unchanged.
