# LeonardX Developer Platform Upgrade

## What changed in this source package

- API-key authentication is separated from billable model inference. Creating a key and reading account/project/model metadata do not spend inference credits; `/api/v1/messages` requires an active API plan and reserves credits before contacting the model provider.
- Added `GET /api/v1/models` and `POST /api/v1/messages` with both JSON and server-sent-event streaming responses. The Messages response uses a Claude-style `content: [{ type: "text", text: "..." }]` shape. Supported models are controlled by `LEONARDX_API_MODELS`.
- Added provider-cost-based credit settlement from measured input and output tokens. Only models with a reviewed provider price are exposed; the current API model is `gpt-4o-mini`. Paid Developer custom-agent runs use that same rated model and meter actual input/output usage; the platform owner bypasses plan and credit gates.
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
2. Configure the production environment variables in `.env.example`, especially `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, and `CRON_SECRET`. `LEONARDX_API_MODELS` can only select model IDs with reviewed cost rates.
3. Apply all new Supabase migrations using the project's approved database migration process. The inference settlement function is defined in `supabase/migrations/20261013160000_api_inference_metering.sql`.
4. Ensure the deployment plan supports the five-minute webhook retry cron configured in `vercel.json`; otherwise configure a supported queue/cron provider before production.
5. Run `npm run verify` in a complete dependency environment, then test with a real API key, an active subscription, provider credentials, and a test webhook receiver.

## Developer API provider-cost review

Reviewed on **2026-10-16** against the [official OpenAI API pricing page](https://developers.openai.com/api/docs/pricing), Standard processing rates for `gpt-4o-mini`: **$0.15 / 1M input tokens** and **$0.60 / 1M output tokens**. LeonardX charges at the measured input/output mix, rounded up per request, using one credit as a maximum **$0.0006** provider inference cost. The one-credit minimum per successful request is included in the ceiling. Unpriced model IDs in `LEONARDX_API_MODELS` are ignored and cannot be called.

At full monthly quota use, the maximum modeled OpenAI inference expense versus the listed monthly subscription prices is:

| Plan | Monthly credits | Maximum modeled provider cost | USD price / gross margin | NGN price / gross margin at stress rate |
| --- | ---: | ---: | ---: | ---: |
| Builder | 2,000 | $1.20 | $9 / 86.7% | ₦9,900 / 69.7% |
| Growth | 10,000 | $6.00 | $35 / 82.9% | ₦39,900 / 62.4% |
| Scale | 40,000 | $24.00 | $129 / 81.4% | ₦149,000 / 59.7% |
| Business Starter | 5,000 | $3.00 | $25 / 88.0% | ₦29,900 / 74.9% |
| Business Pro | 25,000 | $15.00 | $79 / 81.0% | ₦99,000 / 62.1% |
| Business Scale | 100,000 | $60.00 | $249 / 75.9% | ₦299,000 / 49.8% |

NGN comparisons use a conservative **₦2,500 per USD stress-test assumption**, not a claim about the current official exchange rate. Margins are gross inference-cost margins only; they exclude Paystack fees, taxes, hosting, support, and other operating expenses. Recheck the official model rates before enabling any additional model or changing quota/prices. The API and paid custom-agent runs reserve credits using UTF-8 input bytes plus message framing and the requested maximum output, then settle against provider-reported usage. The reservation stays within the existing 100-credit database RPC bound for the documented request limits. If a request may have reached the provider but fails before usage reconciliation completes, LeonardX conservatively retains the full request reservation rather than risk refunding provider work that may have incurred a charge.

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

The complete repository test suite passes (**167 tests**), and the focused API/billing tests pass (**14 tests**). `npx next typegen` and `npx tsc --noEmit` pass. ESLint reports no errors; the repository-wide run reports one existing warning in `app/meeting-room/page.tsx`. I did not run a local production build because a live `next dev --turbopack` process is writing to `.next/dev`; GitHub Actions ran `npm run verify` successfully, including the production build. Live provider/payment/webhook integration tests have not been run.

The Web IDE remains a secure source editor with workspace tools, not a general-purpose shell or isolated runtime. Arbitrary project code must not be executed on the application server. A genuine run/build/debug terminal requires a configured isolated execution provider and end-to-end validation; this package does not claim that capability is live. Streaming is implemented in the API and TypeScript SDK, but still requires a live provider/API-key integration test before production release.

This cost-audit revision has not been deployed and requires no new database migration. Previously applied migrations are still required on any other database environment.
