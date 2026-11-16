# LeonardX private GitHub Actions runtime

The private `LEOOS-RUNTIME` repository owns `.github/workflows/workspace-runtime.yml`. It runs each request on a fresh GitHub-hosted runner. The public application repository retains application CI and invokes this workflow through the GitHub App.

## Supported workload adapters

- `workspace`: inspect, install, test, typecheck, lint, build, git status and git diff for saved Work projects.
- `leocode`: execute a supplied JavaScript, TypeScript or Python source bundle.
- `skill`: execute the selected JavaScript skill script with JSON input on stdin.
- `repository`: inspect, install, test, typecheck, lint, build, git status and git diff for a supplied text-file snapshot. This adapter does not clone private remote repositories or push commits.

All submissions create a `private_runtime_jobs` record. The caller receives a job ID and can poll `GET /api/runtime/jobs/{id}`. The workflow retrieves a short-lived, HMAC-authorized archive from `POST /api/internal/runtime/payload` and reports completion to `POST /api/internal/runtime/result`.

## Required configuration

Application environment:

- `CRON_SECRET`: random secret of at least 32 characters. Set the same value as a GitHub Actions secret; do not expose it to user code.
- `LEO_WORKSPACE_GITHUB_OWNER`: owner of the private runtime repository.
- `LEO_WORKSPACE_GITHUB_REPOSITORY`: private runtime repository name, normally `LEOOS-RUNTIME`.
- `LEO_WORKSPACE_GITHUB_WORKFLOW`: normally `workspace-runtime.yml`.
- `LEO_WORKSPACE_GITHUB_REF`: workflow branch, normally `main`.
- GitHub App credentials used by `getMainWebsiteGitHubToken`; the App needs Actions: write on the private runtime repository.

Private `LEOOS-RUNTIME` repository Actions secrets:

- `LEONARDX_BASE_URL`: public HTTPS LeonardX application origin.
- `CRON_SECRET`: same random secret as the application.

Apply `supabase/migrations/20261115190000_private_runtime_jobs.sql` before enabling the adapters. Ensure `leo-files` is a private Supabase Storage bucket.

## Security and operational limits

- Uploaded files are stored in private Supabase Storage, not committed to GitHub.
- Job payloads are limited to 4 MB compressed by default. Sensitive environment/key files and unsafe paths are rejected by the archive builder.
- Runtime jobs run with `contents: read` and no repository write token. The shared secret is used only in payload-fetch and result-callback steps and is not passed to user scripts.
- Skill scripts and submitted code are untrusted. They execute in an ephemeral hosted runner; do not add privileged secrets, deployment tokens, or write permissions to the execution step.
- GitHub Actions jobs are finite tasks, not persistent terminals or always-on development servers.
- Repository adapter currently works on uploaded source snapshots. It does not clone arbitrary private Git remotes or push changes.
- Cloudflare remains unimplemented; do not automatically route jobs there until a Cloudflare-native isolated runtime and plan entitlement check are implemented.
