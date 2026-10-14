# @leo-os/sdk

Official TypeScript client for the LEO OS API. Zero dependencies. Requires Node 18+.

## Install

Published on npm as `@leo-os/sdk@2.0.0`:

```sh
npm install @leo-os/sdk
```

## Quick start

Create a key at `/developers` with `read` scope for account, model-list, and project reads. Include `write` scope if you want to create projects or call model inference, then:

```ts
import { LeoClient, LeoApiError, LeoRateLimitError } from '@leo-os/sdk';

const leo = new LeoClient({ apiKey: process.env.LEO_API_KEY! }); // defaults to https://leoos-omega.vercel.app
// Pass baseUrl explicitly for self-hosted or staging deployments.

try {
  const { data, request_id } = await leo.projects.list();
  console.log(data, request_id);
  const models = await leo.models.list();
  const answer = await leo.messages.create({ model: models.data[0]?.id, messages: [{ role: 'user', content: 'Say hello.' }] });
  console.log(answer.content[0]?.text, answer.usage);
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

The SDK supports authenticated project listing/creation/status, model listing, non-streaming and server-sent-event streaming text messages, usage history, and webhook signature verification. File uploads and tool calls are not exposed by the current public v1 API. Cloud deployment requires a configured project and connected deployment provider.

Agent coordination contracts (path boundaries, run telemetry, and bounded scratchpad metadata) are available from `@leo-os/sdk/orchestration`. They are contracts and local policy helpers, not a hosted multi-agent worker service.

### Streaming responses

```ts
for await (const event of leo.messages.stream({ messages: [{ role: "user", content: "Explain streaming." }] })) {
  if (event.event === "content_block_delta") {
    const delta = event.data.delta as { text?: string } | undefined;
    process.stdout.write(delta?.text ?? "");
  }
}
```
