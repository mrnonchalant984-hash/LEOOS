# LeonardX Workspace and Offline Draft Update

## Changes in this update

- Added a mobile navigation drawer to the full Leo AI workspace. It includes chat navigation, recent chats, memory, tools, projects, account links, developer workspace, and remote-device pairing.
- Added a visible browser network state in the workspace header. This reports the browser's online/offline signal only; it does not imply that an AI provider is reachable.
- Added a single locally persisted offline prompt draft. When the browser is offline, the prompt is saved in local storage and is **not** sent or represented as an executed task. The user must explicitly choose **Send now** after reconnecting or discard the draft.
- Added source-level regression tests for mobile navigation and offline draft behavior.

## Important limitations

This update does not make cloud model inference available without an internet connection. Offline draft storage is not an offline AI runtime, durable cloud queue, or background worker. Local inference still requires a separately installed and configured local model runtime plus an integration that invokes it. Cloud tasks surviving device shutdown require a deployed durable worker and queue, which must be configured and verified separately.

The existing remote-device pairing feature remains a server-mediated message/session relay. It does not grant unattended operating-system, screen, mouse, keyboard, or terminal control.

## Verification

Run:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

The test command requires the project dependencies and a compatible Node.js version. The Supabase remote-device migration must be applied to the intended database before remote pairing endpoints can work in a deployed environment. No production deployment or database migration is performed by this archive update.
