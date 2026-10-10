import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'LEO OS API Documentation',
  description: 'Authenticate with API keys, call supported LEO OS API routes, receive signed webhooks, and use the TypeScript SDK.',
  alternates: { canonical: '/developers/docs' },
};

const BASE = 'https://leoos-omega.vercel.app';

function Code({ children }: { children: string }) {
  return <pre className="mt-3 overflow-x-auto rounded-xl bg-black p-4 text-xs leading-6 text-zinc-300"><code>{children}</code></pre>;
}
function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return <section id={id} className="mt-12 scroll-mt-24"><h2 className="text-2xl font-black">{title}</h2><div className="mt-3 space-y-3 text-sm leading-7 text-zinc-300">{children}</div></section>;
}

const errors: [string, string, string][] = [
  ['401', 'UNAUTHORIZED', 'The Authorization header is missing, malformed, or does not contain a valid LEO key.'],
  ['401', 'INVALID_API_KEY', 'The key is unknown, revoked, or expired. Create a replacement key.'],
  ['403', 'INSUFFICIENT_SCOPE', 'The key does not have the scope required by this endpoint.'],
  ['429', 'RATE_LIMITED', 'The configured per-key limit was exceeded. Wait for Retry-After seconds.'],
  ['503', 'RATE_LIMIT_UNAVAILABLE', 'The shared rate-limit service could not be reached; retry after the supplied delay.'],
  ['400', 'VALIDATION_ERROR', 'The request body or parameters did not meet this endpoint’s requirements.'],
  ['500', 'DATABASE_ERROR', 'The request could not be completed. Retry and include the request ID if it persists.'],
];

export default function DeveloperDocsPage() {
  return <main className="mx-auto max-w-4xl px-4 py-16">
    <p className="text-sm text-yellow-300"><Link href="/developers">Developers</Link> / Documentation</p>
    <h1 className="mt-2 text-4xl font-black">LEO OS API documentation</h1>
    <p className="mt-3 text-zinc-400">Version <code>v1</code>. This page documents only what is live today. Endpoints and events are added here as they ship.</p>

    <nav aria-label="On this page" className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm">
      <ul className="grid gap-2 sm:grid-cols-2">
        {[['authentication', 'Authentication'], ['scopes', 'Scopes'], ['projects', 'List projects'], ['rate-limits', 'Rate limits'], ['errors', 'Errors and request IDs'], ['health', 'Health check'], ['webhooks', 'Webhooks'], ['sdk', 'TypeScript SDK'], ['cli', 'Command-line client'], ['versions', 'Versions'], ['changelog', 'Changelog']].map(([id, label]) => <li key={id}><a href={`#${id}`} className="text-yellow-300 hover:underline">{label}</a></li>)}
      </ul>
    </nav>

    <Section id="authentication" title="Authentication">
      <p>Create an API key on the <Link href="/developers" className="text-yellow-300">Developers page</Link>. Send it as a Bearer token on every request. Keys start with <code>leo_live_</code>. The full key is shown only once when you create it, and we store only a hash, so a lost key cannot be recovered. Revoke it and create a new one.</p>
      <Code>{`curl ${BASE}/api/v1/projects \\\n  -H "Authorization: Bearer leo_live_YOUR_KEY"`}</Code>
      <p>Keep keys on your server. Never put them in browser code, public repositories, or client-side apps.</p>
    </Section>

    <Section id="scopes" title="Scopes">
      <p>Keys accept the scopes <code>read</code>, <code>write</code>, <code>projects:read</code>, and <code>projects:write</code>. Each route checks its declared scope; a denied request returns <code>403 INSUFFICIENT_SCOPE</code>.</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-zinc-400"><tr><th className="py-2 pr-4">Route</th><th className="py-2">Required scope</th></tr></thead><tbody className="divide-y divide-zinc-800"><tr><td className="py-2 pr-4"><code>GET /api/v1/projects</code>, project reads</td><td className="py-2"><code>read</code></td></tr><tr><td className="py-2 pr-4"><code>POST /api/v2/projects</code></td><td className="py-2"><code>write</code></td></tr></tbody></table></div>
    </Section>

    <Section id="projects" title="List projects">
      <p><code>GET /api/v1/projects</code>. Requires <code>read</code>; a <code>projects:read</code> key also satisfies this read check. Returns up to 100 of the key owner&apos;s projects. A key can only ever see projects owned by the account that created it.</p>
      <Code>{`{\n  "data": [\n    {\n      "id": "uuid",\n      "project_name": "Example project",\n      "type": "web_app",\n      "status": "draft",\n      "progress": 0,\n      "created_at": "2026-10-10T10:00:00.000Z"\n    }\n  ],\n  "request_id": "uuid"\n}`}</Code>
    </Section>

    <Section id="rate-limits" title="Rate limits">
      <p>The current API-key limiter allows up to 120 requests per key in a 60-second window. Over the limit you receive <code>429 RATE_LIMITED</code> with a <code>Retry-After</code> header (seconds). Back off and retry after that time. If the shared limiter is unavailable, requests fail closed with <code>503 RATE_LIMIT_UNAVAILABLE</code>.</p>
    </Section>

    <Section id="errors" title="Errors and request IDs">
      <p>Every response, success or error, includes an <code>x-request-id</code> header. Errors use this shape:</p>
      <Code>{`{\n  "error": {\n    "code": "INSUFFICIENT_SCOPE",\n    "message": "The key requires the read scope."\n  },\n  "request_id": "uuid"\n}`}</Code>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-zinc-400"><tr><th className="py-2 pr-4">HTTP</th><th className="py-2 pr-4">Code</th><th className="py-2">Meaning</th></tr></thead><tbody className="divide-y divide-zinc-800">
        {errors.map(([status, code, meaning]) => <tr key={code}><td className="py-2 pr-4">{status}</td><td className="py-2 pr-4"><code>{code}</code></td><td className="py-2">{meaning}</td></tr>)}
      </tbody></table></div>
      <p>If you contact support about an error, include its <code>request_id</code>.</p>
    </Section>

    <Section id="health" title="Application liveness">
      <p><code>GET /api/health</code> is a lightweight liveness endpoint. A healthy response means the Next.js process can answer HTTP requests; it does not assert that Supabase, OpenAI, Paystack, or deployment services are available.</p>
      <Code>{`curl ${BASE}/api/health`}</Code>
      <Code>{`HTTP 200\ncache-control: no-store\nx-request-id: 90f7a5bc-0735-46eb-8f49-a56c5d1e4210\n\n{ "status": "ok" }`}</Code>
      <p>The endpoint intentionally makes no database, AI, or payment-provider calls. Use a provider-side uptime check for external reachability and service-dependent alerting.</p>
    </Section>

    <Section id="webhooks" title="Webhooks">
      <p>Add an HTTPS endpoint on the <Link href="/webhooks" className="text-yellow-300">Webhooks page</Link>. LEO OS sends a signed <code>POST</code> with a JSON body when an event occurs. Endpoints must be public HTTPS URLs on the default port. Localhost, private networks, and redirects are not supported.</p>
      <p><strong>Available event:</strong> <code>webhook.test</code>, sent when you press &quot;Send test&quot;. Other events will be listed here once they are live.</p>
      <Code>{`POST /your-endpoint\ncontent-type: application/json\nleo-event: webhook.test\nleo-delivery-id: 6f1c...\nleo-signature: t=1790000000,v1=9a3b...\n\n{\n  "id": "6f1c...",\n  "type": "webhook.test",\n  "created": 1790000000,\n  "data": { "message": "This is a test event from LEO OS." }\n}`}</Code>
      <p><strong>Verify the signature.</strong> Compute HMAC-SHA256 of <code>{'{t}.{raw body}'}</code> with your signing secret and compare it to <code>v1</code> using a constant-time comparison. Reject requests whose timestamp is more than 5 minutes old. Use the raw body, not re-serialised JSON.</p>
      <p><strong>Delivery and retries.</strong> Respond with any <code>2xx</code> status within 8 seconds to confirm receipt. Anything else, or a timeout, counts as a failure. The delivery record schedules up to five retries after 1 minute, 5 minutes, 30 minutes, 2 hours, and 6 hours. However, the currently configured Vercel cron invokes the retry worker once daily, so these times are eligibility delays—not a promise that a retry runs at that exact time. Delivery status and errors are shown on the Webhooks page. Because retries can repeat an event, use the <code>id</code> field to ignore duplicates.</p>
    </Section>

    <Section id="sdk" title="TypeScript SDK">
      <p><code>@leo-os/sdk</code> wraps the API with typed errors and a webhook verifier. It has no dependencies and needs Node 18 or newer. It is not yet published to npm; see the package README in the repository for build steps.</p>
      <Code>{`import { LeoClient, verifyWebhookSignature } from '@leo-os/sdk';\n\nconst leo = new LeoClient({ apiKey: process.env.LEO_API_KEY! });\nconst { data } = await leo.projects.list();\n\n// In your webhook handler (rawBody is the unparsed request body string):\nconst ok = verifyWebhookSignature(secret, req.headers['leo-signature'], rawBody);`}</Code>
    </Section>

    <Section id="cli" title="Command-line client">
      <p>The repository includes a local <code>@leo-os/cli</code> package. Login validates credentials against <code>/api/v2/me</code>; project list/create and linked-project status use existing API routes.</p>
      <Code>{`node packages/cli/src/index.mjs login --api-key "$LEO_API_KEY" --base-url https://your-leonardx-domain\nnode packages/cli/src/index.mjs projects list\nnode packages/cli/src/index.mjs projects create "My app" --type web_app`}</Code>
      <p>The package is not confirmed published. <code>leo deploy --brief</code> and <code>leo ship</code> currently stop without submitting a task or triggering a deployment because API-key dispatch endpoints are not available.</p>
      <p><Link href="/cli" className="text-yellow-300">Open the interactive CLI guide</Link>.</p>
    </Section>

    <Section id="developer-workspaces" title="Workspace and extension guides">
      <p><Link href="/ide" className="text-yellow-300">Web IDE guide</Link> describes the authenticated editor and non-executing console. <Link href="/plugins" className="text-yellow-300">Plugin registry guide</Link> documents the metadata-only manifest model and its current persistence/runtime limits.</p>
    </Section>

    <Section id="versions" title="Versions">
      <p>The API is versioned in the URL path. Everything here is <code>v1</code>. Backwards-incompatible changes will ship under a new version path, and v1 keeps working.</p>
    </Section>

    <Section id="changelog" title="Changelog">
      <ul className="space-y-3">
        <li><strong>v1, 2026-10-08.</strong> Added API keys with scopes, expiry, and revocation. Added <code>GET /api/v1/projects</code>, rate limiting (currently configured at 120 per minute per key), and request IDs. Added signed webhook tests and a delivery log (event: <code>webhook.test</code>). Added the TypeScript SDK source package.</li>
      </ul>
    </Section>
  </main>;
}
