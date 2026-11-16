# LeonardX Work runtime: GitHub Actions

## Repository split

- `LEOOS` stays public and contains the LeonardX application, UI, API, and ordinary CI/CD/background workflows.
- `LEOOS-RUNTIME` is a separate **private** repository containing only the dedicated Work workspace execution workflow. Its repository is maintained and pushed separately; it is not part of the public `LEOOS` source tree.
- Do not put the Work runtime workflow in the public application repository.

## Configure the private runtime repository

1. Create a private repository named `LEOOS-RUNTIME` under the configured GitHub owner.
2. Push the workflow and README from the separate `LEOOS-RUNTIME` folder to the private repository's `main` branch.
3. Install the LeonardX GitHub App on the private repository with Metadata: read and Actions: write permissions.
4. Add repository Actions secrets: `LEONARDX_BASE_URL=https://leoos-omega.vercel.app` and `CRON_SECRET` (same random 32+ character value configured on the LeonardX server).
5. Configure LeonardX server environment:
   - `LEO_WORKSPACE_RUNTIME_PROVIDER=github_actions`
   - `LEO_WORKSPACE_GITHUB_OWNER=<GitHub owner>`
   - `LEO_WORKSPACE_GITHUB_REPOSITORY=LEOOS-RUNTIME`
   - `LEO_WORKSPACE_GITHUB_WORKFLOW=workspace-runtime.yml`
   - `LEO_WORKSPACE_GITHUB_REF=<private repo default branch>`
   - `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_INSTALLATION_ID`
   - `CRON_SECRET` (same value as the repository secret)

## Transfer security

The application signs a ten-minute HMAC ticket bound to the job ID, owner ID, workload kind, operation and expiry. The internal archive endpoint validates the ticket and atomically claims the job before returning its owner-scoped ZIP. The shared secret is used only by the archive-fetch and result-reporting steps and is unset before project commands run. Workflow inputs and logs must be accessible only to trusted private-repository maintainers.

## Operations and limits

Supported: `inspect`, `install`, `test`, `typecheck`, `lint`, `build`, `git_status`, `git_diff`. The current workflow is Node.js/npm-oriented and uses a fresh GitHub-hosted Ubuntu runner for each finite job. It is not a persistent interactive terminal, always-on dev server, or live preview environment. `npm` lifecycle scripts are disabled during dependency installation; the requested package scripts still execute project code and therefore receive no production credentials.

GitHub-hosted runners are temporary Linux VMs managed by GitHub. This eliminates the need for LeonardX to operate its own Linux runner host, Podman, or gVisor for Work jobs; it does not mean the runner OS is not Linux. GitHub Actions free usage is subject to account plan, usage limits and billing. Do not promise unlimited execution.

## Cloudflare later

Cloudflare is deliberately **not enabled as a runtime provider yet**. Do not select `cloudflare` until a Cloudflare-native isolated runtime, private archive transfer, tenant boundaries, usage/entitlement check and health verification are implemented. An account-plan upgrade alone cannot switch providers without those checks. The Work API returns a clear unavailable response for Cloudflare rather than falling back to the retired gVisor/Podman service.
