# LeonardX ZIP upgrade — 2026-11-15

## Delivery status

This ZIP extends the supplied LeonardX repository without rebuilding it. It contains the previous image/voice/chat and production handoff changes plus a second pass against the exact 20-section master directive.

## New work in this pass

- Added a clear Chat / Work switch in the Leo chat workspace. Chat stays on `/app`; Work opens the existing `/engineering` workflow workspace rather than creating a duplicate app.
- Added the same Chat / Work navigation to the shared workspace shell.
- Added pinned-to-bottom conversation scrolling, a “Jump to latest” action when a reader scrolls up, and safe new-chat behavior.
- Changed conversation restoration to prefer the signed-in account copy and fall back to a local saved copy with an explicit notice if account sync is unavailable.
- Added pending image replacement and owner-scoped private-storage deletion for removed/replaced unsent chat images, alongside previews, validation, and multimodal submission.
- Improved focus visibility, low-contrast metadata, reduced-motion behavior, and mobile safe-area composer spacing.
- Added `tests/chat-workspace-experience.test.mjs` for the new chat/work, scrolling, restore, image replacement, and accessibility behavior. Tests were added but not run, as requested.
- Added `docs/MASTER-DIRECTIVE-GAP-AUDIT.md`, which maps all 20 sections of the user's master directive to actual repository evidence and clearly lists remaining gaps.

## Previous handoff work retained

- Authenticated private chat-image upload and owner-scoped media validation.
- Gemini multimodal image input wiring.
- Voice input hardening and configurable Gemini audio/image model defaults.
- Contextual document export controls.
- Build/deploy diagnostics, workflow queue inspection, LeoCode runtime preflight, sandbox host preflight, live Gemini smoke script, remote RLS audit SQL, release-readiness page, and laptop verification runbook.

## Verification boundary

- Archive integrity is checked after packaging.
- Dependency installation was not performed.
- Tests, lint, typecheck, and production build were not run in this pass.
- Remote Supabase/RLS, live Gemini, Vercel, browser, VS Code runtime, and sandbox isolation were not exercised.
- No GitHub push, database migration, or deployment was performed.

See `docs/MASTER-DIRECTIVE-GAP-AUDIT.md` for the full 20-section status matrix and laptop acceptance order.
