# Workspace runtime architecture

LeonardX Work, LeoCode sandbox operations, user-confirmed skill scripts, and authorized repository operations are dispatched to the private `LEOOS-RUNTIME` GitHub Actions workflow. Each job uses a fresh GitHub-hosted runner and is finite; it is not a long-running dev server or persistent interactive terminal.

Private project archives are stored in Supabase Storage and fetched only after a short-lived HMAC ticket is validated and the queued job is atomically claimed. Results are bounded, signed, stored against the job owner, and retrieved through the authenticated job-status API. User code runs in a separate workflow step without the archive-transfer or callback secret in its environment. Dependency lifecycle scripts are disabled during `npm ci`.

Cloudflare is not an active execution provider in this implementation. A future Cloudflare-native provider requires an isolated execution service, entitlement checks, health checks, secure archive transfer, and result delivery before it can be enabled. Cloudflare Pages previews are a separate feature.
