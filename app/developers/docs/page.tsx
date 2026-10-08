import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'LEO OS API Documentation',
  description: 'Authenticate with API keys, call the LEO OS v1 API, receive signed webhooks, and use the TypeScript SDK.',
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
  ['401', 'invalid_api_key', 'The Authorization header is missing, malformed, or the key does not exist.'],
  ['401', 'api_key_revoked', 'The key was revoked. Create a new one.'],
  ['401', 'api_key_expired', 'The key passed its expiry date. Create a new one.'],
  ['403', 'insufficient_scope', 'The key does not have the scope this endpoint needs.'],
  ['429', 'rate_limited', 'More than 60 requests in the last minute. Wait for the Retry-After seconds.'],
  ['500', 'server_error', 'Something failed on our side. Retry, and quote the request_id if it persists.'],
];

export default function DeveloperDocsPage() {
  return <main className="mx-auto max-w-4xl px-4 py-16">
    <p className="text-sm text-yellow-300"><Link href="/developers">Developers</Link> / Documentation</p>
    <h1 className="mt-2 text-4xl font-black">LEO OS API documentation</h1>
    <p className="mt-3 text-zinc-400">Version <code>v1</code>. This page documents only what is live today. Endpoints and events are added here as they ship.</p>

    <nav aria-label="On this page" className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm">
      <ul className="grid gap-2 sm:grid-cols-2">
        {[['authentication', 'Authentication'], ['scopes', 'Scopes'], ['projects', 'List projects'], ['rate-limits', 'Rate limits'], ['errors', 'Errors and request IDs'], ['webhooks', 'Webhooks'], ['sdk', 'TypeScript SDK'], ['versions', 'Versions'], ['changelog', 'Changelog']].map(([id, label]) => <li key={id}><a href={`#${id}`} className="text-yellow-300 hover:underline">{label}</a></li>)}
      </ul>
    </nav>

    <Section id="authentication" title="Authentication">
      <p>Create an API key on the <Link href="/developers" className="text-yellow-300">Developers page</Link>. Send it as a Bearer token on every request. Keys start with <code>leo_live_</code>. The full key is shown only once when you create it, and we store only a hash, so a lost key cannot be recovered. Revoke it and create a new one.</p>
      <Code>{`curl ${BASE}/api/v1/projects \\\n  -H "Authorization: Bearer leo_live_YOUR_KEY"`}</Code>
      <p>Keep keys on your server. Never put them in browser code, public repositories, or client-side apps.</p>
    </Section>

    <Section id="scopes" title="Scopes">
      <p>Each key has scopes that limit what it can do. A key without the needed scope receives <code>403 insufficient_scope</code>.</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-zinc-400"><tr><th className="py-2 pr-4">Scope</th><th className="py-2">Allows</th></tr></thead><tbody className="divide-y divide-zinc-800"><tr><td className="py-2 pr-4"><code>projects:read</code></td><td className="py-2">Read your own projects.</td></tr></tbody></table></div>
    </Section>

    <Section id="projects" title="List projects">
      <p><code>GET /api/v1/projects</code>. Requires <code>projects:read</code>. Returns up to 100 of the key owner&apos;s projects. A key can only ever see projects owned by the account that created it.</p>
      <Code>{`{\n  "data": [\n    {\n      "id": "uuid",\n      "business_name": "Example Ltd",\n      "website_type": "website",\n      "custom_domain": null\n    }\n  ],\n  "request_id": "uuid"\n}`}</Code>
    </Section>

    <Section id="rate-limits" title="Rate limits">
      <p>Each key may make 60 requests per minute. Over the limit you receive <code>429 rate_limited</code> with a <code>Retry-After</code> header (seconds). Back off and retry after that time.</p>
    </Section>

    <Section id="errors" title="Errors and request IDs">
      <p>Every response, success or error, includes an <code>x-request-id</code> header. Errors use this shape:</p>
      <Code>{`{\n  "error": {\n    "code": "insufficient_scope",\n    "message": "This key lacks the \\"projects:read\\" scope.",\n    "request_id": "uuid"\n  }\n}`}</Code>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-zinc-400"><tr><th className="py-2 pr-4">HTTP</th><th className="py-2 pr-4">Code</th><th className="py-2">Meaning</th></tr></thead><tbody className="divide-y divide-zinc-800">
        {errors.map(([status, code, meaning]) => <tr key={code}><td className="py-2 pr-4">{status}</td><td className="py-2 pr-4"><code>{code}</code></td><td className="py-2">{meaning}</td></tr>)}
      </tbody></table></div>
      <p>If you contact support about an error, include its <code>request_id</code>.</p>
    </Section>

    <Section id="webhooks" title="Webhooks">
      <p>Add an HTTPS endpoint on the Developers page. LEO OS sends a signed <code>POST</code> with a JSON body when an event occurs. Endpoints must be public HTTPS URLs on the default port. Localhost, private networks, and redirects are not supported.</p>
      <p><strong>Available event:</strong> <code>webhook.test</code>, sent when you press &quot;Send test&quot;. Other events will be listed here once they are live.</p>
      <Code>{`POST /your-endpoint\ncontent-type: application/json\nleo-event: webhook.test\nleo-delivery-id: 6f1c...\nleo-signature: t=1790000000,v1=9a3b...\n\n{\n  "id": "6f1c...",\n  "type": "webhook.test",\n  "created": 1790000000,\n  "data": { "message": "This is a test event from LEO OS." }\n}`}</Code>
      <p><strong>Verify the signature.</strong> Compute HMAC-SHA256 of <code>{'{t}.{raw body}'}</code> with your signing secret and compare it to <code>v1</code> using a constant-time comparison. Reject requests whose timestamp is more than 5 minutes old. Use the raw body, not re-serialised JSON.</p>
      <p><strong>Delivery and retries.</strong> Respond with any <code>2xx</code> status within 8 seconds to confirm receipt. Anything else, or a timeout, counts as a failure. Failed deliveries are retried after 1 minute, 5 minutes, 30 minutes, 2 hours, and 6 hours (6 attempts in total), then marked failed. How quickly a retry runs depends on how often the retry job is scheduled. Delivery status and errors are shown in the log on the Developers page. Because retries can repeat an event, use the <code>id</code> field to ignore duplicates.</p>
    </Section>

    <Section id="sdk" title="TypeScript SDK">
      <p><code>@leo-os/sdk</code> wraps the API with typed errors and a webhook verifier. It has no dependencies and needs Node 18 or newer. It is not yet published to npm; see the package README in the repository for build steps.</p>
      <Code>{`import { LeoClient, verifyWebhookSignature } from '@leo-os/sdk';\n\nconst leo = new LeoClient({ apiKey: process.env.LEO_API_KEY! });\nconst { data } = await leo.projects.list();\n\n// In your webhook handler (rawBody is the unparsed request body string):\nconst ok = verifyWebhookSignature(secret, req.headers['leo-signature'], rawBody);`}</Code>
    </Section>

    <Section id="versions" title="Versions">
      <p>The API is versioned in the URL path. Everything here is <code>v1</code>. Backwards-incompatible changes will ship under a new version path, and v1 keeps working.</p>
    </Section>

    <Section id="changelog" title="Changelog">
      <ul className="space-y-3">
        <li><strong>v1, 2026-10-08.</strong> Added API keys with scopes, expiry, and revocation. Added <code>GET /api/v1/projects</code>, rate limiting (60 per minute per key), and request IDs. Added signed webhooks with retries and a delivery log (event: <code>webhook.test</code>). Added the TypeScript SDK.</li>
      </ul>
    </Section>
  </main>;
}
