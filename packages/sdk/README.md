# @leo-os/sdk

Official TypeScript client for the LEO OS API. Zero dependencies. Requires Node 18+.

## Install

Not published to npm yet. To use it from this repository, build it (`cd packages/sdk && npx tsc -p tsconfig.json`) and import from `dist/`.
When published: `npm install @leo-os/sdk`.

## Quick start

Create a key at `/developers` (scope `projects:read`), then:

```ts
import { LeoClient, LeoApiError, LeoRateLimitError } from '@leo-os/sdk';

const leo = new LeoClient({ apiKey: process.env.LEO_API_KEY! });

try {
  const { data, request_id } = await leo.projects.list();
  console.log(data, request_id);
} catch (e) {
  if (e instanceof LeoRateLimitError) console.log('Retry in', e.retryAfterSeconds, 'seconds');
  else if (e instanceof LeoApiError) console.log(e.status, e.code, e.message, 'request id:', e.requestId);
  else throw e;
}
```

Never put your API key in browser code. Keep it on a server.

## Webhook signatures

```ts
import { verifyWebhookSignature } from '@leo-os/sdk';

// rawBody must be the exact request body string, before JSON parsing.
const ok = verifyWebhookSignature(process.env.LEO_WEBHOOK_SECRET!, req.headers['leo-signature'] as string, rawBody);
if (!ok) return res.status(400).end();
```

Requests older than 5 minutes are rejected by default (`toleranceSeconds`).

## What is covered today

Only what the API supports: `projects.list()` and webhook signature verification. More modules will be added as API endpoints are built.
