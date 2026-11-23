# Braverton CLI (legacy package name: @leo-os/cli)

The Braverton command-line client provides authenticated access to the supported Braverton project API. The npm package retains its historical name for compatibility; the installed command is available as `braverton`, with `leo` and `leonardx` retained as aliases for existing users.

```sh
npm install @leo-os/cli
braverton login --api-key "$BRAVERTON_API_KEY" # defaults to https://leoos-omega.vercel.app
braverton projects list
braverton projects create "My app" --type web_app
braverton models list
braverton chat --message "Hello from Braverton"
braverton usage
```

Login validates the key against the public `/api/v1/me` endpoint. The token is stored in the user's local config with restrictive file permissions and is never printed after login. Project list/create and status operations use `/api/v1`; model requests require an active API subscription and available credits. Model listing and account metadata do not spend credits. Cloud deployment remains separate from model inference.

## Supported commands

- `braverton login --api-key <key> --base-url <url>` validates a key against `/api/v1/me` before storing it in the user config directory with restrictive file permissions.
- `braverton init <workspace-id>` links the current directory through `.leo/config.json`. It refuses to overwrite an existing link.
- `braverton status` fetches actual project metadata without downloading project files.
- `braverton agents strategy <strategy>` selects a local coordination strategy. `check-path` enforces explicit directory fences. Git worktree operations use a separate checkout, allowlisted npm validation scripts, a serialized merge lock, and revalidation after rebase.
- `braverton agents scratchpad read|add` stores bounded metadata in `.leo/scratchpad.json`; it does not store code blobs or credentials.
- `braverton models list` lists model IDs exposed by the deployment without consuming model credits.
- `braverton chat --message "Hello" [--model gemini-3.5-flash-lite]` calls the public Gemini text inference endpoint and requires an active API plan and sufficient credits.
- `braverton usage` reads recent token and credit usage.

The API currently uses the historical `leo_live_` key prefix and existing `.leo/` local configuration directory for backward compatibility. These identifiers are protocol/storage details, not the public product brand. Do not rename them in client code until a versioned migration is available.

## Cloud execution limits

`braverton deploy --brief` and `braverton ship` currently stop with an explicit message. The production agent/build and deployment APIs require authenticated browser-session and plan/ownership checks; there is no API-key CLI dispatch endpoint yet. These commands do not submit tasks or claim a deployment. The local preview terminal is also non-executing by design.

Git worktrees isolate checkouts, not operating-system processes or credentials. Do not run untrusted agent-generated code in them as if they were a security sandbox.
