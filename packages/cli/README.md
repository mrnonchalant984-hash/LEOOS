# @leo-os/cli

The supported LeonardX CLI for the authenticated project API.

```sh
npm install
node src/index.mjs login --api-key "$LEO_API_KEY" --base-url https://your-leonardx.example
node src/index.mjs projects list
node src/index.mjs projects create "My app" --type web_app
```

Login validates the key against the public `/api/v1/me` endpoint. The token is stored in the user's local config with restrictive file permissions. It is never printed after login. Project list/create and status operations use `/api/v1`; cloud deploy commands remain unavailable until authenticated task and deployment APIs exist.
# LEO OS CLI

The package exposes both `leo` and the legacy `leonardx` binary. Link it locally with `npm link` from this package, or invoke `node src/index.mjs` while developing.

## Supported commands

- `leo login --api-key <key> --base-url <url>` validates a key against `/api/v1/me` before storing it in the user config directory with restrictive file permissions.
- `leo init <workspace-id>` links the current directory through `.leo/config.json`. It refuses to overwrite an existing link.
- `leo init` verifies that the current API-key account owns the workspace before linking. `leo status` fetches actual project metadata without downloading project files.
- `leo agents strategy <strategy>` selects a local coordination strategy. `check-path` enforces explicit directory fences. Git worktree operations use a separate checkout, allowlisted npm validation scripts, a serialized merge lock, and a revalidation after rebase.
- `leo agents scratchpad read|add` stores bounded metadata in `.leo/scratchpad.json`; it does not store code blobs or credentials.
- Existing project list/create and logout commands remain available.

## Cloud execution limits

`leo deploy --brief` and `leo ship` currently stop with an explicit message. The production agent/build and deployment APIs require the authenticated browser-session and plan/ownership checks; there is no API-key CLI dispatch endpoint yet. These commands do not submit tasks or claim a deployment. The local preview terminal is also non-executing by design.

Git worktrees isolate checkouts, not operating-system processes or credentials. Do not run untrusted agent-generated code in them as if they were a security sandbox.
