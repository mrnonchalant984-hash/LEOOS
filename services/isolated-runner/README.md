# Isolated repository runner (separate service)

This service accepts HMAC-authenticated, timestamped tasks, extracts a bounded source archive safely, and starts a **fresh no-network container** for each operation. Supported operations are fixed: inspect, apply_patch, offline dependency install, test, typecheck, lint, build, and limited Git status/diff/log/branch/commit operations. It does not accept arbitrary shell commands or caller-supplied container images.

## Important deployment boundary

Run the service on a **dedicated disposable VM** with a rootless Podman engine and a private network. Install and register the gVisor `runsc` OCI runtime; the runner always passes `--runtime=runsc` and fails closed if it is unavailable. Do not run it on the Next.js production host, do not expose it publicly, and do not mount a privileged Docker socket into the web application. The runner needs access to the container engine; compromise of the runner host can therefore affect containers on that host. Keep it isolated from production credentials and databases. Configure a private authenticated reverse proxy/mTLS in addition to HMAC, and rotate `RUNNER_HMAC_SECRET`.

Prepare a network-enabled, disposable package-cache directory by running `npm ci --cache /srv/leonardx-npm-cache --prefer-offline --no-audit --no-fund` for each approved project lockfile, then set `RUNNER_NPM_CACHE=/srv/leonardx-npm-cache` on the runner host. The cache must contain all packages and versions for the workspace lockfile. The sandbox copies that cache into the workspace and runs `npm ci --offline`; it never fetches dependencies over the network. Do not place npm auth tokens or registry configuration in this cache.

Build the fixed sandbox image on the runner host:

```sh
podman build -t localhost/leonardx-runner:node22 -f services/isolated-runner/Dockerfile services/isolated-runner
```

Run the service with `RUNNER_HOST=0.0.0.0`, `RUNNER_PORT=8787`, `RUNNER_CONTAINER_ENGINE=podman`, `RUNNER_IMAGE=localhost/leonardx-runner:node22`, `RUNNER_WORKSPACE_ROOT=/var/lib/leonardx-runner/workspaces`, `RUNNER_NPM_CACHE=/srv/leonardx-npm-cache`, and a random 32+ character `RUNNER_HMAC_SECRET`. Bind it to a private interface only. Example launch command after setting these variables in the service manager: `python3 services/isolated-runner/server.py`. Configure the web application with `LEO_SANDBOX_URL` (private HTTPS origin) and the same HMAC secret as `LEO_SANDBOX_HMAC_SECRET`. Do not reuse production provider, Supabase, or payment credentials in the runner. Workspaces are nested under the authenticated tenant UUID; the API proxy derives that UUID from the verified LeonardX session rather than accepting a caller-provided tenant.

The container is run with gVisor `runsc`, no network, read-only root filesystem, non-root UID, no-new-privileges, all capabilities dropped, bounded by PID/memory/CPU/time limits, and given a tenant-scoped persistent workspace. Workspace locks expire after the maximum possible operation window, and exported archives omit symlinks, Git metadata, dependencies, and secret-like files.

Request body fields: `job_id`, `operation`, and one of `workspace_zip_base64`, an existing `workspace_id`, or an allowlisted GitHub `repository` slug. Set `RUNNER_ALLOWED_REPOSITORIES=owner/repo,owner/another-repo` on the runner host to allow repository clones. Imported ZIPs get a local baseline commit; repository clones preserve `.git` in the server-managed workspace. Reuse the returned `workspace_id` for subsequent jobs; workspaces expire after six idle hours. Optional `patch`, `branch`, and `commit_message` fields are operation-specific. Sign the exact UTF-8 JSON bytes using HMAC-SHA256 over `timestamp + '.' + body`, sent as `X-Runner-Timestamp` and `X-Runner-Signature`. The runner returns bounded logs and a workspace ZIP when it is within the configured limit.

The authenticated application proxy also supports deleting an idle workspace. It signs `{"tenant_id":"<authenticated-user-uuid>"}` and sends `DELETE /v1/workspaces/<workspace-uuid>`; the runner refuses deletion while an operation lock is active and only resolves the workspace under that tenant's root. Job containers are short-lived and stop when their fixed operation exits; the persistent workspace stores files, not a long-running application process.

## Known limitations

- This is a deployable service component and authenticated API integration, not a claim that a runner is already deployed or penetration-tested. Deployment must verify the installed gVisor runtime and dedicated-host controls before enabling `LEO_SANDBOX_URL`.
- Repository archives must be exported by a trusted caller. `.git`, `.env*`, `node_modules`, `.next`, key files, and credential-named files are rejected. GitHub clone URLs are constructed only from exact repository slugs on the host allowlist; no remote push is supported. Git operations affect the isolated local workspace only.
- Dependency installation is not performed over the network in the sandbox. Prepare dependencies in a reviewed offline cache/image before relying on builds. This means installs/builds can fail if dependencies are not included in the prepared cache.
