# Workspace runtime architecture

LeonardX Work, LeoCode sandbox operations, user-confirmed skill scripts, and authorized repository operations are dispatched to the private `LEOOS-RUNTIME` GitHub Actions workflow. Each job uses a fresh GitHub-hosted runner and is finite; it is not a long-running dev server or persistent interactive terminal.

Private project archives are stored in Supabase Storage and fetched only after a short-lived HMAC ticket is validated and the queued job is atomically claimed. Results are bounded, signed, stored against the job owner, and retrieved through the authenticated job-status API. User code runs in a separate workflow step without the archive-transfer or callback secret in its environment. Dependency lifecycle scripts are disabled during `npm ci`.

Cloudflare is not the persistent interactive terminal/workspace runtime. A separate Cloudflare Workers preview pipeline can build supported Next.js projects with OpenNext (including Server Actions) or deploy static assets. It is a finite preview deployment workflow, not a long-running editable development server. The preview worker remains separately gated by account configuration, queue migrations, resource limits, and live acceptance checks.
