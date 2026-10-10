export type IntegrationKind = 'api' | 'sdk' | 'cli' | 'ide' | 'plugins' | 'webhooks';

export type IntegrationStudioStep = {
  id: string;
  title: string;
  description: string;
  fileName: string;
  code: string;
  focusLines: readonly number[];
  terminal: readonly string[];
  outputLabel: string;
};

export type IntegrationStudioScenario = {
  id: string;
  label: string;
  description: string;
  steps: readonly IntegrationStudioStep[];
};

export const integrationModes: readonly {
  id: IntegrationKind;
  label: string;
  referenceHref: string;
  referenceLabel: string;
  secondaryHref: string;
  secondaryLabel: string;
}[] = [
  { id: 'api', label: 'API', referenceHref: '/developers/docs', referenceLabel: 'Read API reference', secondaryHref: '/api-keys', secondaryLabel: 'Manage API keys' },
  { id: 'sdk', label: 'TypeScript SDK', referenceHref: '/developers/docs#sdk', referenceLabel: 'Read SDK guide', secondaryHref: '/docs/sdk', secondaryLabel: 'Open SDK overview' },
  { id: 'cli', label: 'CLI', referenceHref: '/developers/docs#cli', referenceLabel: 'Read CLI guide', secondaryHref: '/developers', secondaryLabel: 'Developer platform' },
  { id: 'ide', label: 'Web IDE', referenceHref: '/ide#workspace-reference', referenceLabel: 'Read IDE guide', secondaryHref: '/dashboard', secondaryLabel: 'Choose a workspace' },
  { id: 'plugins', label: 'Plugins', referenceHref: '/plugins#manifest-reference', referenceLabel: 'Read plugin guide', secondaryHref: '/api/plugins', secondaryLabel: 'View registry endpoint' },
  { id: 'webhooks', label: 'Webhooks', referenceHref: '/webhooks#webhook-endpoints', referenceLabel: 'Manage live endpoints', secondaryHref: '/developers/docs#webhooks', secondaryLabel: 'Read delivery guide' },
];

export const integrationScenarios: Record<IntegrationKind, readonly IntegrationStudioScenario[]> = {
  api: [
    {
      id: 'list-projects', label: 'List projects', description: 'A scoped read request to the implemented projects API.', steps: [
        { id: 'request', title: 'Authorize the request', description: 'Send a server-side API key as a Bearer token. The masked value below is only illustrative.', fileName: 'request.http', code: 'GET /api/v1/projects\nAuthorization: Bearer leo_live_<your-key>\nX-Request-ID: <optional-client-id>', focusLines: [1, 2, 3], terminal: ['[SIMULATION] No request sent', '> GET /api/v1/projects', 'Authorization: Bearer leo_live_<masked>'], outputLabel: 'Illustrative request · not executed' },
        { id: 'response', title: 'Read the response', description: 'The live route returns the authenticated account’s projects and a request ID.', fileName: 'response.json', code: '{\n  "data": [\n    { "id": "example-project-id", "project_name": "Example workspace", "status": "draft" }\n  ],\n  "request_id": "example-request-id"\n}', focusLines: [2, 3, 4, 6], terminal: ['[SIMULATION] Example response shape', 'HTTP 200 · illustrative only', 'data: project list', 'request_id: example-request-id'], outputLabel: 'Example response · not from your account' },
      ],
    },
    {
      id: 'missing-scope', label: 'Missing scope', description: 'An authorization error is a normal API outcome and should be handled explicitly.', steps: [
        { id: 'limited-key', title: 'Use a key without read access', description: 'A key missing the required scope is rejected before project data is returned.', fileName: 'request.http', code: 'GET /api/v1/projects\nAuthorization: Bearer leo_live_<write-only-key>', focusLines: [1, 2], terminal: ['[SIMULATION] No request sent', '> GET /api/v1/projects', 'Key scope: write only'], outputLabel: 'Illustrative request · not executed' },
        { id: 'forbidden', title: 'Handle the denial', description: 'The API returns HTTP 403 with an insufficient-scope error. No project data is included.', fileName: 'error.json', code: '{\n  "error": {\n    "code": "INSUFFICIENT_SCOPE",\n    "message": "The key requires the read scope."\n  },\n  "request_id": "example-request-id"\n}', focusLines: [2, 3, 4, 6], terminal: ['[SIMULATION] Example authorization failure', 'HTTP 403 · INSUFFICIENT_SCOPE', 'No project data returned'], outputLabel: 'Example error · not from a live request' },
      ],
    },
  ],
  sdk: [
    {
      id: 'sdk-projects', label: 'List projects', description: 'Use the typed client that is present in the repository package.', steps: [
        { id: 'build-package', title: 'Build the local package', description: 'The SDK is not published to npm yet. Build it from the repository before importing it locally.', fileName: 'terminal', code: 'cd packages/sdk\nnpx tsc -p tsconfig.json', focusLines: [1, 2], terminal: ['$ cd packages/sdk', '$ npx tsc -p tsconfig.json', '[SIMULATION] Commands are shown, not executed'], outputLabel: 'Local build instructions · not executed' },
        { id: 'sdk-call', title: 'Call the typed client', description: 'LeoClient.projects.list() uses the implemented API and returns typed project data.', fileName: 'example.ts', code: "import { LeoClient } from '@leo-os/sdk'\n\nconst leo = new LeoClient({\n  apiKey: process.env.LEO_API_KEY!\n})\n\nconst { data, request_id } = await leo.projects.list()", focusLines: [1, 3, 4, 5, 7], terminal: ['[SIMULATION] No SDK request made', 'Method: LeoClient.projects.list()', 'Authentication: server-side environment variable', 'Result: ApiResponse<Project[]>'], outputLabel: 'Example call · not executed' },
      ],
    },
    {
      id: 'sdk-rate-limit', label: 'Handle rate limits', description: 'The SDK exposes a dedicated error with retry timing when the API returns 429.', steps: [
        { id: 'catch-rate-limit', title: 'Catch the specific error', description: 'Use LeoRateLimitError to distinguish a rate limit from other API failures.', fileName: 'errors.ts', code: "import { LeoApiError, LeoRateLimitError } from '@leo-os/sdk'\n\ntry {\n  await leo.projects.list()\n} catch (error) {\n  if (error instanceof LeoRateLimitError) {\n    console.log(error.retryAfterSeconds)\n  } else if (error instanceof LeoApiError) {\n    console.error(error.status, error.requestId)\n  }\n}", focusLines: [1, 6, 7, 8, 9, 10], terminal: ['[SIMULATION] Example only; no API call made', '429 → LeoRateLimitError', 'retryAfterSeconds: read from Retry-After', 'requestId: available when returned by API'], outputLabel: 'Illustrative error handling · not executed' },
      ],
    },
  ],
  cli: [
    {
      id: 'cli-project-status', label: 'Link a project', description: 'Supported CLI commands authenticate and read project metadata.', steps: [
        { id: 'cli-login', title: 'Authenticate locally', description: 'Login validates the key against /api/v2/me before saving local CLI configuration.', fileName: 'terminal', code: 'leo login --api-key "$LEO_API_KEY" --base-url "https://your-leonardx-domain"', focusLines: [1], terminal: ['$ leo login --api-key "$LEO_API_KEY" --base-url "https://your-leonardx-domain"', '[SIMULATION] Command not run', 'Real command validates credentials before saving them'], outputLabel: 'Supported command · not executed here' },
        { id: 'cli-status', title: 'Link and inspect', description: 'The CLI checks project ownership, stores a local workspace link, then reads current metadata.', fileName: 'terminal', code: 'leo init <workspace-id>\nleo status', focusLines: [1, 2], terminal: ['$ leo init <workspace-id>', '[SIMULATION] Ownership check not performed', '$ leo status', '[SIMULATION] No workspace data fetched'], outputLabel: 'Supported commands · not executed here' },
      ],
    },
    {
      id: 'cli-deploy-boundary', label: 'Deployment boundary', description: 'Cloud task dispatch and deployment are not available to API-key CLI users.', steps: [
        { id: 'cli-deploy', title: 'A dispatch is requested', description: 'The CLI recognizes the command but deliberately refuses to submit a task.', fileName: 'terminal', code: 'leo deploy --brief "Add a settings page"', focusLines: [1], terminal: ['$ leo deploy --brief "Add a settings page"', 'Error: Cloud task dispatch is not exposed to API keys yet.', 'No task was submitted.'], outputLabel: 'Verified capability boundary · command not run' },
        { id: 'cli-ship', title: 'A deployment is requested', description: 'The current CLI has no API-key deployment endpoint, so it does not trigger a deployment.', fileName: 'terminal', code: 'leo ship', focusLines: [1], terminal: ['$ leo ship', 'Error: CLI deployment is not exposed to API keys yet.', 'No deployment was triggered.'], outputLabel: 'Verified capability boundary · command not run' },
      ],
    },
  ],
  ide: [
    {
      id: 'ide-workspace', label: 'Open and save files', description: 'The existing workspace editor uses the authenticated project-files route.', steps: [
        { id: 'ide-open', title: 'Open a real workspace', description: 'The dynamic IDE route receives a workspace ID; the server checks ownership before returning project files.', fileName: 'workspace-link.tsx', code: "<Link href={`/ide/${encodeURIComponent(workspaceId)}`}>\n  Open workspace\n</Link>", focusLines: [1, 2, 3], terminal: ['[SIMULATION] Navigation not performed', 'Route: /ide/[workspaceId]', 'Workspace files are loaded only after server-side ownership checks'], outputLabel: 'Illustrative navigation · no workspace loaded' },
        { id: 'ide-save', title: 'Save bounded file changes', description: 'The editor sends the file map to the existing authenticated route; path and byte limits are validated server-side.', fileName: 'save-files.ts', code: "await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/files`, {\n  method: 'PATCH',\n  headers: { 'content-type': 'application/json' },\n  body: JSON.stringify({ files })\n})", focusLines: [1, 2, 4, 5], terminal: ['[SIMULATION] No save request sent', 'Live handler: PATCH /api/workspaces/[id]/files', 'Limits: 250 files · 256 KB/file · 2 MB total', 'The preview terminal does not execute shell commands'], outputLabel: 'Documented flow · no files changed' },
      ],
    },
    {
      id: 'ide-console', label: 'Safe preview console', description: 'The in-workspace console reads the current editor buffer; it is not an operating-system shell.', steps: [
        { id: 'ide-help', title: 'Use supported preview commands', description: 'The real console supports help, ls, cat <path>, and clear; unknown commands are rejected.', fileName: 'console-help.txt', code: 'help\nls\ncat app/page.tsx\nclear', focusLines: [1, 2, 3, 4], terminal: ['[SIMULATION] Console commands not executed', 'Supported: help, ls, cat <path>, clear', 'No shell, build, or deployment command is available in this console'], outputLabel: 'Capability reference · not executed' },
      ],
    },
  ],
  plugins: [
    {
      id: 'plugin-manifest', label: 'Manifest validation', description: 'The current registry validates metadata and a small permission vocabulary.', steps: [
        { id: 'manifest-shape', title: 'Review a manifest', description: 'A valid manifest has a semantic version, API version 1, HTTPS entrypoint, and only declared permissions.', fileName: 'leo-plugin.json', code: '{\n  "id": "sample-inspector",\n  "name": "Sample Inspector",\n  "version": "1.0.0",\n  "apiVersion": "1",\n  "description": "Manifest example only",\n  "permissions": ["projects:read"],\n  "entrypoint": "https://example.invalid/plugin.js"\n}', focusLines: [2, 4, 5, 7, 8], terminal: ['[SIMULATION] Manifest not submitted', 'Schema: Zod-validated metadata', 'Entrypoint: HTTPS required', 'No extension code is loaded or executed'], outputLabel: 'Example manifest · not registered' },
        { id: 'manifest-limit', title: 'Know the runtime boundary', description: 'Registration is platform-owner-only and currently stored in process memory; no customer plugin execution or persistence is implemented.', fileName: 'registry-status.txt', code: 'GET  /api/plugins\nPOST /api/plugins  # platform owner only\n\n# Current runtime: metadata registry only', focusLines: [1, 2, 4], terminal: ['[SIMULATION] Registry status not queried', 'Registration: owner-authorized API', 'Persistence: process-local Map', 'Execution and marketplace: not available'], outputLabel: 'Verified limitation · no registry mutation' },
      ],
    },
  ],
  webhooks: [
    {
      id: 'webhook-signature', label: 'Verify a delivery', description: 'The current event is webhook.test; signature verification uses the raw request body.', steps: [
        { id: 'webhook-raw-body', title: 'Read the original body', description: 'Keep the raw body intact so its bytes match the HMAC signature.', fileName: 'handler.ts', code: "const rawBody = await request.text()\nconst signature = request.headers.get('leo-signature') ?? undefined", focusLines: [1, 2], terminal: ['[SIMULATION] No delivery received', 'Event: webhook.test', 'Header: leo-signature: t=…,v1=…'], outputLabel: 'Illustrative delivery · no endpoint contacted' },
        { id: 'webhook-verify', title: 'Check the signature', description: 'The SDK verifier checks HMAC-SHA256 and rejects timestamps outside its default tolerance.', fileName: 'handler.ts', code: "import { verifyWebhookSignature } from '@leo-os/sdk'\n\nconst valid = verifyWebhookSignature(\n  process.env.LEO_WEBHOOK_SECRET!,\n  signature,\n  rawBody\n)\n\nif (!valid) return new Response('Invalid signature', { status: 400 })", focusLines: [1, 4, 5, 6, 7, 9], terminal: ['[SIMULATION] Signature check not performed', 'Expected: HMAC-SHA256 over timestamp + raw body', 'Reject: missing, invalid, or stale signature'], outputLabel: 'Verification example · no signature checked' },
      ],
    },
    {
      id: 'webhook-tampering', label: 'Reject altered payloads', description: 'A changed body or stale signature must fail verification.', steps: [
        { id: 'webhook-tamper', title: 'Compare the exact body', description: 'Re-serializing parsed JSON can change bytes and invalidate a legitimate signature; altered bytes must not pass.', fileName: 'verification.test.ts', code: "const valid = verifyWebhookSignature(\n  secret,\n  receivedSignature,\n  rawBody + ' ' // changed body\n)\n\nif (!valid) {\n  return new Response('Rejected', { status: 400 })\n}", focusLines: [1, 4, 7, 8], terminal: ['[SIMULATION] No request received', 'Input: modified raw body', 'Expected outcome: signature rejected', 'No delivery or endpoint status changed'], outputLabel: 'Illustrative security case · not executed' },
      ],
    },
  ],
};

export function clampStudioStep(index: number, total: number): number {
  if (!Number.isFinite(index) || total <= 0) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), total - 1);
}

export function isFocusedStudioLine(line: number, focusLines: readonly number[]): boolean {
  return focusLines.includes(line);
}
