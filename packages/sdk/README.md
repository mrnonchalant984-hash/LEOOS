# @braverton/sdk

Official TypeScript client for the Braverton API. Zero dependencies. Requires Node 18+.

## Install

Repository source package: `@braverton/sdk` (npm publication is a separate release step).

```sh
npm install @braverton/sdk
```

## Quick start

The SDK is Braverton-branded. The historical `LeoApiError` and `LeoRateLimitError` export names remain unchanged for source compatibility.

Create a key at `/developers` with `read` scope for account, model-list, and project reads. Include `write` scope if you want to create projects or call model inference, then:

```ts
import { BravertonClient, LeoApiError, LeoRateLimitError // legacy exported error names retained for compatibility } from '@braverton/sdk';

const braverton = new BravertonClient({ apiKey: process.env.BRAVERTON_API_KEY! }); // defaults to https://leoos-omega.vercel.app
// Pass baseUrl explicitly for self-hosted or staging deployments.

try {
  const { data, request_id } = await braverton.projects.list();
  console.log(data, request_id);
  const models = await braverton.models.list();
  const answer = await braverton.messages.create({ model: models.data[0]?.id, messages: [{ role: 'user', content: 'Say hello.' }] });
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
import { verifyWebhookSignature } from '@braverton/sdk';

// rawBody must be the exact request body string, before JSON parsing.
const ok = verifyWebhookSignature(process.env.LEO_WEBHOOK_SECRET!, req.headers['leo-signature'] as string, rawBody);
if (!ok) return res.status(400).end();
```

Requests older than 5 minutes are rejected by default (`toleranceSeconds`).

## What is covered today

The SDK supports authenticated project listing/creation/status, model listing, non-streaming and server-sent-event streaming text messages, usage history, and webhook signature verification. File uploads and tool calls are not exposed by the current public v1 API. Cloud deployment requires a configured project and connected deployment provider.

Agent coordination contracts (path boundaries, run telemetry, and bounded scratchpad metadata) are available from `@braverton/sdk/orchestration`. They are contracts and local policy helpers, not a hosted multi-agent worker service.

### Streaming responses

```ts
for await (const event of braverton.messages.stream({ messages: [{ role: "user", content: "Explain streaming." }] })) {
  if (event.event === "content_block_delta") {
    const delta = event.data.delta as { text?: string } | undefined;
    process.stdout.write(delta?.text ?? "");
  }
}
```
