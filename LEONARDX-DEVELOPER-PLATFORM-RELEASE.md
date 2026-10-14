# LeonardX Developer Platform Upgrade

## What changed in this source package

- API-key authentication is separated from billable model inference. Creating a key and reading account/project/model metadata do not spend inference credits; `/api/v1/messages` requires an active API plan and reserves credits before contacting the model provider.
- Added `GET /api/v1/models` and `POST /api/v1/messages` with both JSON and server-sent-event streaming responses. The Messages response uses a Claude-style `content: [{ type: "text", text: "..." }]` shape. Supported models are controlled by `LEONARDX_API_MODELS`.
- Added usage-based credit settlement from measured provider token usage. The proposed conversion is one usage credit per 1,000 total tokens; this is a configurable commercial assumption and must be cost-validated before launch.
- Updated the TypeScript SDK with default production base URL, model listing, text messages, usage history, typed API/rate-limit errors, and webhook signature verification.
- Fixed the CLI's self-dependency, made base URL optional for the production deployment, and added model-list, chat, and usage commands.
- Added real webhook events for project creation, successful project deployment, and completed API usage. Event delivery is deferred until after the request response, retries are queued, and HTTPS delivery pins the DNS address validated before connecting.
- Improved the Web IDE source editor with unsaved-change status, Ctrl/Cmd+S, file search (Ctrl/Cmd+P), JSON formatting, and safer workspace tools.
- Expanded OpenAPI documentation and added focused tests.
- Added site-wide title/description templates, canonical URLs on public landing pages, Google/Bing crawler directives, Open Graph/Twitter cards, Organization/WebSite/SoftwareApplication JSON-LD, and a web manifest.
- Rebuilt the XML sitemap around real public pages; added `llms.txt`; marked account/workspace surfaces `noindex`; and kept API endpoints out of crawler discovery.
- Replaced the `/leo-ai` redirect with a real public landing page containing descriptive copy, feature blocks, FAQs and FAQ structured data. Added a visible FAQ block and matching structured data to the homepage.

## Required setup before production use

1. Install dependencies from the repository root with `npm ci`.
2. Configure the production environment variables in `.env.example`, especially `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `LEONARDX_API_MODELS`, and `CRON_SECRET`.
3. Apply all new Supabase migrations using the project's approved database migration process. The inference settlement function is defined in `supabase/migrations/20261013160000_api_inference_metering.sql`.
4. Ensure the deployment plan supports the five-minute webhook retry cron configured in `vercel.json`; otherwise configure a supported queue/cron provider before production.
5. Run `npm run verify` in a complete dependency environment, then test with a real API key, an active subscription, provider credentials, and a test webhook receiver.
6. Validate subscription prices, included quotas, and the credit-to-token conversion against actual model/provider costs before public release.

## API usage example

```bash
# Validate and store the key locally; no model credits are consumed.
npx @leo-os/cli login --api-key "$LEO_API_KEY"
npx @leo-os/cli models list

# Requires an active API plan and sufficient usage credits.
npx @leo-os/cli chat --message "Explain REST APIs in two sentences."
npx @leo-os/cli usage
```

SDK example:

```ts
import { LeoClient } from '@leo-os/sdk';

const leo = new LeoClient({ apiKey: process.env.LEO_API_KEY! });
const result = await leo.messages.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Hello LeonardX' }],
});
console.log(result.content[0]?.text, result.usage);
```

## Verification boundaries

The focused API, SDK, CLI, OpenAPI, billing, webhook, and SEO source tests pass in this environment (34 tests in the latest focused run). TypeScript/TSX syntax parsing passed for the SEO-related files. The full test suite cannot complete because the local `node_modules` tree is incomplete and the existing plugin test cannot import `zod`; the install attempt timed out. A full Next.js build/typecheck and live provider/payment/webhook test therefore remain unverified here.

The Web IDE remains a secure source editor with workspace tools, not a general-purpose shell or isolated runtime. Arbitrary project code must not be executed on the application server. A genuine run/build/debug terminal requires a configured isolated execution provider and end-to-end validation; this package does not claim that capability is live. Streaming is implemented in the API and TypeScript SDK, but still requires a live provider/API-key integration test before production release.

This package has not been deployed and does not apply database migrations automatically.
