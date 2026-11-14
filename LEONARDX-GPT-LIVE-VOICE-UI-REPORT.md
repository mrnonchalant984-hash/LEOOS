# LeonardX — GPT-style Live Voice UI update

## Current status correction

The current widget falls back to the turn-based `/api/voice` flow because `/api/realtime/session` returns `gemini_turn_based`. The live transcript/activity feed and screen/camera controls described below are not verified as active in the current source. No live browser or deployment validation has been performed.

## Intended UI update (not verified as active)

- Replaced the compact voice pop-up with a responsive, full-height live conversation surface.
- Added a live Leo orb with listening/thinking/speaking states.
- Live user transcription appears while the user speaks.
- Live assistant transcription appears while Leo speaks.
- Added an on-screen activity feed for authorized tool calls, showing the tool's readable name, running/completed/error state, and a bounded result preview.
- Kept the existing voice selector, mute control, end-call action, authenticated tool bridge, and chat-history persistence.
- Added a focused regression assertion for the live transcript and activity UI.

## Verification

- Focused voice regression suite: 6 passed, 0 failed.
- Full repository test command: 454 passed, 9 failed, 2 skipped. The failing test files could not load because this workspace has no `node_modules` and required packages such as `zod` and `jszip` are absent. This is an environment/dependency failure, not evidence that all other tests pass in a production build.
- TypeScript/JSX transpilation of `components/LEOWidget.tsx`: 0 syntax diagnostics.
- Full Next.js build, typecheck, browser QA, microphone session, and live Gemini session: not run.

## Explicitly not changed / remaining work

- This update does **not** implement the raw-audio WebSocket proxy. The current transport still uses the existing browser-to-Gemini Live connection with a short-lived, server-minted credential; privileged tools continue through authenticated LeonardX endpoints. Do not describe this as fully server-proxied audio.
- Screen sharing, camera/video input, and live visual understanding are not implemented. The on-screen activity feed is a UI representation of actual tool-call status/results, not a fake screen-share feature.
- No GitHub commit, push, PR, Vercel deployment, or production change was performed.

## Files changed

- `components/LEOWidget.tsx`
- `tests/voice-shared-orchestration.test.mjs`
