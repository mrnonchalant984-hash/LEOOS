# AI Studio production checklist

Status definitions: **Implemented** means code exists; **Automated test** means a repository test/check covers it; **Live-provider verified**, **Staging deployed**, and **Production verified** require separate operational evidence.

| Check | Status |
| --- | --- |
| Uses the existing Next.js App Router, authentication, credit controls, and private Supabase media bucket | Implemented |
| Text-to-image workflow and existing generation persistence | Implemented; live provider use not verified in this change |
| OpenAI image edit with upload size, MIME, and file-signature validation | Implemented; automated upload validation test added |
| Original and edited images stored separately in private storage | Implemented; requires configured Supabase storage |
| User-scoped image history and signed asset access | Implemented; no cross-user live test performed |
| Runway Gen-4.5 text-to-video and status polling | Existing implementation reused; live provider use not verified in this change |
| Image-to-video, creative projects, and project save/reuse | Not implemented |
| Real-provider edit/generation smoke test | Not run; credentials and provider credits were not tested |
| Database migration applied in staging or production | Not verified |
| Vercel preview or production deployment | Not verified |
| Production security, load, accessibility, and mobile browser review | Not performed |

## Environment configuration

Configure these values in the server environment, not in client variables:

| Name | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only Supabase admin operations |
| `OPENAI_API_KEY` or `LEO_API_KEY` | Yes for image operations | Server-side image generation/edit provider credential |
| `LEO_IMAGE_MODEL` | Optional | Server-side model override; provider must support the selected Images API operation |
| `LEO_IMAGE_PLATFORM_CREDITS` | Optional | Server-side platform credit reservation per image request |
| `RUNWAYML_API_SECRET` | Required for video | Server-side Runway credential |
| `RUNWAY_VIDEO_MODEL` | Optional | Existing video workflow currently supports `gen4.5` only |
| `RUNWAY_GEN45_PLATFORM_CREDITS_PER_SECOND` | Required for non-owner video credits | Application credit conversion; not Runway's provider-credit unit |

Apply the existing generation migration and confirm the private `leo-files` bucket is configured before release. Do not put real credentials in `.env.example`, source control, or chat.

## Deployment, smoke test, and rollback

1. Apply migrations to a staging database using the repository's migration process and verify the private bucket.
2. Configure server-only provider credentials and valid credit settings in Vercel Preview.
3. Test with an authorized staging account: create an image, upload a supported image for edit, confirm both assets are private and distinct, verify status/history, and download only through the ownership-checked media endpoint.
4. Test unauthorized access, cross-user asset IDs, malformed files, mismatched MIME/signatures, oversized uploads, duplicate request IDs, credit exhaustion, and provider errors.
5. Verify logs and responses contain no provider secret or private storage path. Run lint, typecheck, tests, and production build.
6. Promote only after a real non-production provider smoke test and migration review. Production status must be confirmed in Vercel and Supabase; this implementation has not done so.
7. Roll back by reverting the Studio page/component, `/api/studio` handlers, image-edit helper, navigation entry, and associated tests/docs. No new migration was introduced; existing image/video endpoints and tables are unchanged.
