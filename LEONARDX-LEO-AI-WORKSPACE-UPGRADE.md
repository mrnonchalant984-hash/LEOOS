# Leo AI Workspace Sidebar Upgrade

## Included
- Responsive desktop sidebar and compact mobile shortcut row.
- New chat action with a separate session ID.
- Recent chat list (up to 30 items), stored locally on the current browser/device; individual conversations are cached in local storage and can fall back to the existing chat API.
- Memory panel backed by the existing `/api/memory` endpoints, including create and delete actions.
- Navigation shortcuts for projects/library, templates/explore, account, pricing/upgrade, and the developer workspace.
- Images & tools shortcut opens the existing chat tool menu.
- Remote device pairing now has one-time codes, authenticated same-account pairing, device revocation, an SSE-backed message relay, and explicit current-chat handoff.

## Important limitations
- Recent chat metadata and cached messages are local to the browser/device. They are not a cloud-synced chat history yet.
- Remote pairing is a live message/event relay between paired, signed-in devices. It does not provide laptop screen sharing or mouse/keyboard control; that requires a separately installed desktop agent and explicit operating-system permissions. Chat history is still device-local and is not automatically cloud-synced.
- Memory requires a signed-in Supabase session because the existing API enforces authentication for writes.

## Verification
- Focused remote pairing security tests pass (3 tests). Selected existing API/SDK tests also pass (16 total across the selected test files).
- Full typecheck, lint, complete test suite, and Next.js build were not verified because `node_modules` is absent.
- Apply `supabase/migrations/20261013180000_remote_device_pairing.sql` and deploy the updated app before using the feature.
