# Private GitHub Actions runtime adapters

The private `LEOOS-RUNTIME` repository is the single execution workflow for four job kinds: `workspace`, `leocode`, `skill`, and `repository`. The public application authenticates the user, checks ownership/entitlement, stores the ZIP in the private Supabase `leo-files` bucket, records a `private_runtime_jobs` row, then dispatches only opaque identifiers and a short-lived HMAC ticket. The workflow obtains the archive once from `/api/internal/runtime/payload`, which atomically claims the queued job and returns metadata in a response header. It returns bounded stdout/stderr and exit status to `/api/internal/runtime/result`. Users poll `/api/runtime/jobs/:id`; that endpoint scopes reads to the authenticated owner.

## Adapters

- LeoCode: `POST /api/leocode/sandbox` queues inspect/test/typecheck/lint/build after LeoCode entitlement and rate-limit checks.
- Skill scripts: `POST /api/skills/run` requires explicit confirmation, an enabled skill owned by the caller, a script under `scripts/`, and bounded JSON input.
- Repository operations: `POST /api/workforce/repository-runner` is platform-owner-only and queues status/diff/test/build against the uploaded workspace archive.
- Workspaces: `POST /api/workspaces/:id/runtime` uses the same runtime job store and provider.

## Required configuration

Application environment: `CRON_SECRET` (32+ random characters), `LEO_WORKSPACE_GITHUB_OWNER`, `LEO_WORKSPACE_GITHUB_REPOSITORY=LEOOS-RUNTIME`, `LEO_WORKSPACE_GITHUB_WORKFLOW=workspace-runtime.yml`, `LEO_WORKSPACE_GITHUB_REF=main`, and a GitHub App installation token with Actions: write on the private runtime repository (or a suitably scoped `GITHUB_TOKEN`).

Private repository Actions secrets: `LEONARDX_BASE_URL` (HTTPS production base URL) and `CRON_SECRET` (same value as the application). Do not add user project secrets or GitHub write tokens to the runtime workflow.

Apply `supabase/migrations/20261115190000_private_runtime_jobs.sql` before enabling execution. Ensure the private storage bucket `leo-files` exists and is private.

## Security and limitations

GitHub-hosted runners are ephemeral managed VMs; each job is time-limited. Uploaded project code is untrusted and must never receive application secrets, GitHub App credentials, or repository write tokens. Dependency install lifecycle scripts are disabled. Skill scripts are user-requested arbitrary code and run without application credentials. The workflow only has `contents: read`. Output is truncated before persistence. Job archive downloads are one-time and expire after ten minutes.

Repository `git_status`/`git_diff` operate on `.git` metadata only if it exists in the uploaded archive. The current workspace archive format generally contains source files, not a full Git clone; therefore these operations do not provide remote GitHub repository history or push/commit functionality. This adapter deliberately does not push code.

Cloudflare is not implemented by this adapter. GitHub Actions remains the active provider until a separately isolated Cloudflare runtime and entitlement-aware routing are implemented and verified.
