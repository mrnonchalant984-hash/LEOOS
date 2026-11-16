# Runtime handoff status

LeonardX Work now targets the separate private `LEOOS-RUNTIME` GitHub repository and GitHub-hosted ephemeral jobs. The previous instructions to deploy a dedicated Linux VM with Podman and gVisor are obsolete for Work. See `docs/workspace-runtime-github-actions.md`.

Cloudflare is a future provider only; there is no Cloudflare-native workspace runtime wired into this application yet. Existing LeoCode/skill/repository runner integrations are separate legacy paths and have not been migrated by this Work change.
