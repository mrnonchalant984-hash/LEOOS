# LeonardX API, SDK, CLI and webhook guide

The public contract is `/api/v1`; the SDK calls project list/create/status endpoints and verifies webhook signatures. The CLI supports login, init, project operations and local orchestration metadata; `deploy`/`ship` do not dispatch unsupported cloud operations. Webhook delivery supports HMAC, bounded retries and claims in [`lib/webhooks.ts`](./lib/webhooks.ts), but the legacy worker/schema must be consolidated. See [`packages/sdk/README.md`](./packages/sdk/README.md) and [`packages/cli/README.md`](./packages/cli/README.md).
