# Self-host LeonardX and the runner on one VM

This is a small-deployment option when Vercel Hobby cannot reach a private runner. It is a compromise to the runner's dedicated-VM security guidance: the runner uses Podman and gVisor on the same host as the web application, so a host-level runner compromise can affect LeonardX. Prefer a separate runner VM for production or sensitive workloads.

## Layout

- Run LeonardX as a Node.js production service listening only on `127.0.0.1:3000`.
- Run the Python runner as a separate service listening only on `127.0.0.1:8787`.
- Keep Podman rootless and install/register gVisor `runsc` for the runner's service account. Do not expose a Podman socket to LeonardX.
- Set `LEO_SANDBOX_URL=http://127.0.0.1:8787` and `LEO_SANDBOX_HMAC_SECRET` in LeonardX's server-side environment. Set the identical key as `RUNNER_HMAC_SECRET` for the runner. The local HTTP URL is explicitly allowed by the application proxy.
- Put a reverse proxy such as Nginx in front of LeonardX, listening on the VM's public web ports, or use a Cloudflare Tunnel targeting `http://127.0.0.1:3000`. Do not publish port 8787, and do not set Cloudflare Access service-token values for the loopback connection.
- Keep Supabase, email, AI provider, payment, and other external service credentials in LeonardX's protected environment only. They do not belong in the runner environment.

## Prepare the VM

Use a supported Linux VM with enough memory and disk for the Next.js app, Podman, the gVisor runtime, build artifacts, workspaces, and the offline npm cache. Set up a dedicated unprivileged account for each service. Configure a host firewall to allow only SSH from trusted sources and the chosen web ingress; the runner port must not be reachable externally.

Install the Node.js version supported by the repository's Next.js version, Python 3, rootless Podman, and gVisor. Verify `podman run --runtime=runsc ...` works as the runner account before enabling the runner service. Follow [README.md](./README.md) for the fixed sandbox image and offline dependency cache setup.

## Configure services

Build LeonardX from a reviewed checkout on the VM or in CI, then run its production server with `npm start`, `HOSTNAME=127.0.0.1`, and `PORT=3000`. The repository's `start` script is `next start`; Next.js recommends placing a reverse proxy in front of a self-hosted server. Keep the checkout/build artifacts persistent and restart the app service after deployment.

Run `services/isolated-runner/server.py` under its separate service account with:

```text
RUNNER_HOST=127.0.0.1
RUNNER_PORT=8787
RUNNER_CONTAINER_ENGINE=podman
RUNNER_IMAGE=localhost/leonardx-runner:node22
RUNNER_WORKSPACE_ROOT=/var/lib/leonardx-runner/workspaces
RUNNER_NPM_CACHE=/srv/leonardx-npm-cache
RUNNER_HMAC_SECRET=<same random 32+ character value configured as LEO_SANDBOX_HMAC_SECRET>
```

Store service variables in root-readable environment files (for example, mode `0600`); do not commit them or put secrets in `NEXT_PUBLIC_*` variables. Ensure the runner account owns its workspace/cache directories and its rootless Podman storage. Start the runner before enabling skill or LeoCode isolated execution.

## Replace Vercel Cron

`vercel.json` currently schedules these authenticated endpoints daily. Configure a host scheduler or external cron service to send `Authorization: Bearer $CRON_SECRET` to the public LeonardX origin at the same UTC times:

| UTC | Endpoint |
| --- | --- |
| 09:00 | `/api/cron/hosting` |
| 10:00 | `/api/cron/webhooks` |
| 11:00 | `/api/internal/agents/worker` |
| 12:00 | `/api/internal/workflow-worker` |
| 13:00 | `/api/internal/workforce/worker` |
| 14:00 | `/api/cron/build-artifacts` |

Use a protected scheduler secret store; do not put the bearer token in a URL or shell history. Verify each endpoint's response and application logs after the first run. Check for any other Vercel-only features in use before DNS cutover.

## Cutover checklist

1. Back up the current environment configuration and confirm external service credentials and callback/redirect URLs are understood.
2. Build and start both services; verify the public app through the reverse proxy and verify the runner locally with an authenticated request. Do not enable the runner until the `runsc` test passes.
3. Confirm the application uses the loopback runner URL and matching HMAC secrets. Leave Cloudflare Access variables empty for this same-host route.
4. Configure TLS/domain routing to the app only, firewall the runner port, and test sign-in, database access, exports, skill execution, and LeoCode sandbox execution.
5. Install and verify the cron replacements above before disabling the Vercel deployment. Keep a rollback path until health checks and scheduled jobs have run successfully.

This guide prepares a same-VM deployment; it does not move production traffic, create a VM, configure DNS, or apply application secrets.
