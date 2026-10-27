# LeonardX Browser Game Studio implementation report

Date: 2026-10-27

## Delivered in the local source tree

- Added `lib/builders/browser-game-starter.ts` with runnable HTML/Canvas starters for platformer, endless runner, 2D racing, sliding puzzle and top-down collection/adventure, plus Three.js/WebGL exploration and racing scenes. The 3D racing starter includes keyboard/touch steering, traffic obstacles, collision state, speedometer, distance, and restart.
- Added authenticated `/app/game-studio` UI with project list, natural-language brief form, sandboxed live preview, source editing, save, restart, best-effort runtime diagnostics, and ZIP export.
- Added `GET /api/games/[id]/export`, which verifies the session, owner, game project type and `index.html`, then builds a real ZIP from persisted files while excluding secret/environment/dependency paths and common token/private-key patterns.
- Added MCP tools `create_browser_game`, `start_browser_game_preview`, and `export_browser_game_project`. They are account-scoped; creation requires write scope/confirmation. Inline MCP ZIP response is capped at 1 MB.
- Added Leo tool-mode `read_project_files` and `save_project_files` for the authenticated user's owned workspace. Saves merge only changed paths, require `confirm: true`, reject unsafe/secret paths, and never claim to deploy.
- Changed explicit website/web-app/SaaS/game build requests in chat to create a plan-checked draft workspace. Games link to Browser Game Studio; web projects link to the existing Review & Build flow with its explicit deployment approval.
- Changed new game creation in `/api/setup/projects` and MCP to use browser-native source, changed game provider capabilities to `browser-native`, removed the Godot build API routes, Godot service/container, engine starters, Godot project directory, and dedicated GitHub workflow from the active source tree, and removed Godot controls from the IDE cloud-build panel.
- Added `supabase/migrations/20261027160000_retire_engine_game_builds.sql`, which prevents new non-Expo engine build reservations while preserving historical job records. It has not been applied to any database.
- Updated deployment docs, capability catalog, and tests. Existing mobile Expo functionality and unrelated Android/mobile workers were retained rather than conflated with browser games.

## Validation performed

- Focused test command:
  `node --experimental-strip-types --test tests/browser-game-starter.test.mjs tests/browser-game-studio.test.mjs tests/cloud-build-integrations.test.mjs tests/plan-builders.test.mjs tests/application-capabilities.test.mjs`
  Result: **22 passed, 0 failed, 0 skipped**. A separate regression group covering the prior SEO/provider repairs passed **44 passed, 0 failed, 0 skipped** (66 passing test executions across both focused groups).
- Node syntax checks passed for the changed non-JSX TypeScript routes/modules and the live-service verification script.
- The MCP protocol test could not start because the checkout's `node_modules/@modelcontextprotocol/sdk/client/index.js` is missing.
- `npm run typecheck` is blocked because `next` is not installed in the incomplete local dependency tree. `npm run lint` is blocked because `eslint` is not installed. A full `npm test` attempt timed out before a final suite summary. npm registry access previously failed with `EAI_AGAIN`, so dependency installation could not be completed.
- No real browser automation was available; the generated HTML has unit/source checks but has not been visually exercised in Chromium/WebKit. No live Supabase migration, provider call, GitHub commit, Vercel deployment, or production data change was performed.

## Important incomplete acceptance items

1. This is a browser-native starter generator, not yet a general-purpose AI game compiler. Prompts outside the implemented starter families need the connected model/client to generate and save additional code; no in-product AI code-generation/repair loop was added here.
2. A dedicated game asset upload/library workflow and asset persistence separate from source files are not implemented; current starters use procedural graphics and Three.js primitives.
3. Browser automation, collision/input acceptance tests in a real browser, and automatic log-to-AI repair with bounded retries remain unimplemented.
4. Version history, static Vercel publication, verified public game URLs, updating/unpublishing, and publication-state persistence remain unimplemented. The system does not return a fake published URL.
5. The request to check GitHub/Vercel errors and automatically repair/redeploy is not fully completed. The existing website deployment path still has explicit approval and provider verification, and the owner-only main-repository MCP tools can inspect GitHub/Vercel and push approved changes, but this change does not implement an automatic repair/redeploy loop.
6. Historical Godot migrations and records remain for audit/backward compatibility; the retirement migration still needs a reviewed staging dry-run and application. Old Godot projects are not automatically migrated into browser source.
7. The local chat can read/save owner-scoped LeonardX workspace files in tool mode. Direct main-repository writes remain gated through the existing owner-only MCP `update_main_website` tool, latest inspected commit SHA, write scope and explicit confirmation; there is no unrestricted internal-chat push to the main branch.

## Deployment status

**Not deployed.** The modified files are in the supplied local source archive only. The previous GitHub connector write attempt was denied with 403, and no new GitHub branch or pull request was created. Production behavior is unchanged until these changes are reviewed, dependencies are restored, tests/typecheck/lint/build pass, the migration is dry-run and applied through the approved process, and deployment is explicitly authorized.
