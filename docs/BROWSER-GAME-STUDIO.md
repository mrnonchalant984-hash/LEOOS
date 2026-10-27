# LeonardX Browser Game Studio

## Current workflow

1. Sign in and open `/app/game-studio`, or ask Leo to create a browser game. An explicit build request in chat creates a draft project using the same server-side plan and ownership checks as `/api/setup/projects`.
2. The project contains an actual runnable `index.html`, source files, README, package metadata, and a `leonardx.game.json` descriptor. Current starter families include Canvas platformer, endless runner, 2D racing, sliding puzzle, top-down collection/adventure, Three.js 3D exploration, and Three.js 3D racing.
3. The Studio loads the saved project through the authenticated owner-scoped workspace API and renders `index.html` in an iframe with `sandbox="allow-scripts"` and no `allow-same-origin`. The iframe CSP blocks arbitrary network connections for Canvas games; the 3D starter permits only the Three.js jsDelivr runtime.
4. Source edits are local until Save source is selected. The save endpoint checks ownership and file/size/path rules. Restart reloads the preview. Runtime error and unhandled-rejection messages are best-effort and are not a substitute for automated browser testing.
5. Export ZIP downloads the saved source archive only after rechecking login, ownership, game type, valid `index.html`, path restrictions, and sensitive-file/content exclusions. MCP can return a base64 ZIP for archives at or below 1 MB; larger archives use the authenticated Studio download route.

## MCP and Leo

- `create_browser_game`: create and save an owned browser-native starter; requires write scope and explicit confirmation.
- `start_browser_game_preview`: verify an owned saved entry point and return the Studio route. It does not claim a browser was opened or tested.
- `export_browser_game_project`: create a real bounded ZIP from owned saved files.
- `read_project_files` and `save_project_files` in Leo's tool mode can read and merge edits into the authenticated user's LeonardX project workspace. Save requires `confirm: true`, rejects unsafe/secret paths, and explicitly does not deploy.
- Existing owner-only MCP tools `inspect_main_website` and `update_main_website` are the route for reading GitHub Actions/Vercel deployment state and committing approved changes to the configured LeonardX main repository. The update tool requires the latest inspected commit SHA, `mcp:write`, and `confirm: true`. It is not exposed as an unrestricted automatic write inside ordinary chat.
- For a website/web-app/SaaS request in chat, Leo creates a draft project and offers a Review & Build action that opens the existing explicit build/deploy approval screen. The existing pipeline uses verified GitHub/Vercel integration and reports its own provider result; this change does not silently deploy production or claim automatic repair/redeploy succeeded.

## Active boundaries and limitations

- The starter generator is not an arbitrary natural-language compiler. It chooses a distinct playable starter family from the prompt. A connected model/client must generate and save custom mechanics and assets through the project-file tools when a request goes beyond the starter's implemented behavior.
- 2D assets are procedural shapes. A dedicated asset upload/asset-library UI, persistent project version history, browser automation/console testing, AI repair retry loop, published-game URL lifecycle, unpublish/update controls, and static Vercel publishing adapter remain incomplete.
- Three.js uses jsDelivr in the starter HTML; offline use requires bundling the dependency locally.
- Existing Godot project records and historical SQL metadata are preserved rather than destructively converted. They are not automatically playable in Browser Game Studio; create a new browser project or explicitly migrate the legacy source.
- The retirement migration has not been applied to any database by this change. Run the migration dry-run and staging verification before deployment.
