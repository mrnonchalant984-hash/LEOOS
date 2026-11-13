# LeonardX capability inventory

Audit date: 2026-11-10  
Repository: `mrnonchalant984-hash/LEOOS`  
Commit inspected: `1f8ab8d` (`Fix Cloudflare build memory limit`)  
Scope: source, migrations, tests, GitHub Actions, and Vercel configuration. No production writes or deployment were performed.

## Baseline and limits

- The isolated worktree began clean. `node_modules` was absent.
- The repository reports Next.js `16.3.6`. Its required local agent guide under `node_modules/next/dist/docs/` was unavailable during initial inspection, so Next route/component changes must wait until the dependency installation completes and the applicable guide is read.
- `.env.example` has configuration names but no values. Production secrets, Supabase migration state, private storage state, GitHub Actions secret state, and live provider access are not established by source inspection.
- Existing test files cover Android queue contracts, skill validation and intentional non-execution, public URL SSRF controls, Expo artifact verification, MCP behavior, and browser game export. Current test count/result has not yet been run in this checkout.
- The prior audit reports in the repository are historical; they refer to different commits and cannot establish current production behavior.

## Workstream inventory

| Capability | Existing implementation | Gap / acceptance work | Dependencies and environment | Security and data considerations | Likely files / validation |
| --- | --- | --- | --- | --- | --- |
| Workspace and project downloads | Owner-scoped workspace file GET/PATCH; browser game ZIP export with path and secret filtering; template ZIP; private authenticated Android, Expo, and Godot artifact endpoints. | No general workspace full ZIP, selected-file/folder endpoint, or project-type-neutral artifact export UI. Browser game ZIP is in-memory JSZip, not a bounded large-export service. | Supabase `projects.files`, `media_assets`, private `leo-files`; `SUPABASE_URL`, service role key. | Reuse owner checks; path validation; filter credentials and secret-like content; avoid raw storage paths; bound memory/time or use a durable export worker for large data. | `app/api/workspaces/[id]/files/route.ts`, `app/api/games/[id]/export/route.ts`, `components/ide/WebIde.tsx`, `components/WorkspaceArtifacts.tsx`; ZIP integrity, ownership, traversal, omission, and download tests. |
| Skills engine | Built-in `skills/<name>/SKILL.md`; user-owned `skills`/`skill_files` with RLS migration; create/list/load/enable-disable/delete and scoped reads. Leo loads skill instructions progressively. | No ZIP import/export, support-file persistence lifecycle, duplicate/version history, or installation status. Script endpoint deliberately returns 503; no secure script runner. Skills are not a general executable-code feature and must remain so until an external isolated runner exists. | Apply `20261026200000_skills.sql`; Supabase. No isolated runner contract/config currently identified. | Admin client operations must include owner constraints; archive paths and sizes require validation; untrusted instructions are not executable; never run uploaded code in Next process. | `lib/skills/registry.ts`, `app/api/skills/**`, `supabase/migrations/20261026200000_skills.sql`, `tests/skills.test.mjs`, `app/api/skills/run/route.ts`. |
| Web research | Leo chat can request Gemini Google Search grounding via `lib/ai/provider-registry.ts`; public URL fetcher pins public DNS, blocks private addresses/unsafe redirects, and enforces size/time/content-type limits. | Standalone `/api/research` is explicitly disabled (503); no persisted history/reports/export found. Website analysis can reuse guarded fetcher, but extraction/citations and source verification need a dedicated contract. | `GEMINI_API_KEY` or `GOOGLE_API_KEY`, Supabase for persistence, `enforceUserRateLimit`; existing grounded provider. | Preserve citations only from actual grounding chunks or fetched URLs; mark model synthesis as inference; treat site content as untrusted; SSRF-safe fetch on every redirect; scope history to owner. | `app/api/research/route.ts`, `lib/ai/provider-registry.ts`, `lib/public-site-fetch.ts`, `lib/public-site-url.ts`, chat integration; add grounding/source/history tests and migration if durable history is introduced. |
| Android generation/build | Durable idempotent queue, recurring GitHub Actions worker, lease/recovery, Gradle compilation, APK ZIP/signature/package/checksum verification, private storage, owner-authenticated download. | API creates only the hardcoded Calculator project; worker asserts calculator package/source, so arbitrary app types are not supported. Logs are mostly generic command failures; cancellation and AAB are not established. Actual hosted build requires configured migration, GitHub secrets, SDK availability, and private bucket. | Android queue/artifact/reliability migrations; GitHub Actions `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; Android SDK/Gradle; private `leo-files`; worker configuration. | Existing owner row predicates and lease ownership are important; preserve secrets boundary and never pass service credentials into Gradle. Do not claim APK success without produced and validated bytes. | `lib/android-build.ts`, `lib/android-build-worker.ts`, `scripts/android-build-worker.mjs`, `app/api/builds/android/**`, `.github/workflows/android-build-worker.yml`, Android migrations/tests. |
| Voice | Authenticated, rate-limited Gemini audio upload transcription, optional Gemini chat turn, and TTS response; standalone TTS endpoint; Leo UI has recording and realtime connection states. | Realtime session route and meeting realtime route explicitly return 503. UI attempts the OpenAI Realtime SDP flow, while platform documents Gemini-only migration: provider mismatch. Recorded upload size/type/language and persisted private audio/download lifecycle are not demonstrated; output is returned inline. | `GEMINI_API_KEY` or `GOOGLE_API_KEY`; optional existing `OPENAI_API_KEY` does not by itself mean realtime is enabled. | Limit body before parsing, validate MIME and duration/size, do not expose permanent API key, keep microphone states tied to actual events, handle disconnect/cancel. | `app/api/voice/route.ts`, `app/api/speak/route.ts`, `app/api/realtime/session/route.ts`, `app/api/meetings/[id]/realtime-session/route.ts`, `components/LEOWidget.tsx`; mock provider and input/state tests. |
| Ecosystem integration, MCP, and production operations | Existing chat/tools, MCP Streamable HTTP/OAuth, project/build/artifact tools, agents/queues, image/media generation, game studio, Android and Expo build paths, database security migrations, CI workflows. | The requested end-to-end scenarios span independently gated capabilities; advertised tool parity, migration deployment, runner/provider settings, workflow secrets, and actual production confirmations are not all evidenced. | Supabase auth/schema/RLS/storage, Google, GitHub, Vercel, Android worker, optional Expo/Runway/Cloudflare configuration. | Keep current authorization/provider abstractions; migrations additive and ordered; production deploy requires separate authorization; report implemented/tested/integrated/production-verified separately. | `app/api/chat/**`, `lib/mcp/**`, `supabase/migrations/**`, `.github/workflows/**`, `vercel.json`, integration and release tests. |

## Current findings to carry into implementation

1. Reuse the existing ZIP export filtering, but extract a shared, unit-tested policy before exposing general project archives.
2. The local text file editor caps workspaces at 250 files and 2 MB; large-project export is therefore not currently a supported editor workflow. Do not claim scalable streaming based on the existing JSZip route.
3. A pure “isolated” script runner cannot be made safe by running child processes inside the web server. A real separate sandbox service is an infrastructure requirement; without it, keep the endpoint fail-closed and report the exact configuration blocker.
4. Google grounding is already part of the configured Gemini abstraction. A research endpoint should use that existing abstraction rather than inventing another model/provider path.
5. The Android pipeline has real build verification machinery but its schema and worker contracts are calculator-specific. Generalizing source and artifact metadata must preserve existing calculator jobs and idempotency.
6. Voice UI and server provider expectations disagree. Fixing the UI/server contract is required before live realtime claims can be made; recorded voice remains the supported fallback.

## Environment variable reference status

Names are documented in `.env.example`; values are intentionally omitted. Relevant existing configuration includes `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` / `GOOGLE_API_KEY`, `OPENAI_API_KEY`, `ANDROID_BUILD_WORKER_ENABLED`, `ANDROID_BUILD_WORKER_SECRET`, `CRON_SECRET`, `EXPO_TOKEN`, `EXPO_ACCOUNT_NAME`, and existing MCP/worker variables. Their presence and provider-side validity have not been verified. No new variable is considered required until an implementation adds a real consumer and documentation.

## Progress checklist

- [x] Phase 0 source and architecture inventory started; primary routes, migrations, worker contract, frontend hooks, tests, and configuration inspected.
- [ ] Phase 0 full baseline test, lint, typecheck/build, all route/migration/security inspection completed.
- [ ] Phase 1 universal workspace/project export implemented and verified.
- [ ] Phase 2 skills packaging/management/integration completed; isolated execution either implemented through an actual sandbox or explicitly blocked by absent infrastructure.
- [ ] Phase 3 standalone research, source traceability/history/export completed.
- [ ] Phase 4 reusable Android generator and worker contracts completed.
- [ ] Phase 5 recorded/realtime voice status and supported provider path completed.
- [ ] Phase 6 cross-capability integration checked.
- [ ] Phase 7 security/configuration/migration review completed.
- [ ] Phase 8 interface integration completed.
- [ ] Phase 9 requested automated verification completed.
- [ ] Phase 10 production readiness report updated; no production deployment or migration applied.
