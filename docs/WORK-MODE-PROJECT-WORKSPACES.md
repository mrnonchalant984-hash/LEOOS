# Leo Work Mode — durable project workspaces

Work mode stays inside Leo Chat. It does not route users to the separate Engineering workflow.

## Implemented in this handoff

- Authenticated project workspace creation and recent-workspace listing (`/api/workspaces`).
- Private, persistent source archives in the existing private `leo-files` Supabase Storage bucket.
- Revisioned workspace metadata in `project_workspace_sources`.
- ZIP and individual source-file import through `/api/workspaces/:id/source`.
- Path validation, traversal rejection, secret-file exclusion, symlink rejection, generated-folder exclusion, file-count and byte limits.
- Owner-scoped reads and writes; server routes verify that the project belongs to the authenticated user.
- Manifest listing, text-file reads, optimistic-revision text saves, and file deletion.
- A basic in-chat file browser/editor for text/code files.
- Work-mode chat sends the selected project ID; Leo receives bounded excerpts from saved workspace files. File contents are treated as untrusted data, not instructions.
- Concurrent edits use revision compare-and-swap. A stale save returns HTTP 409 instead of silently overwriting a newer workspace.

## Limits

- ZIP upload: 25 MB compressed.
- Workspace: 1,500 files, 50 MB uncompressed total.
- Individual file: 5 MB.
- Leo context: up to 12 text files and 36,000 characters per request.
- Common source/config/document formats are editable as text. Binary assets can be stored and listed but are not edited in the text editor.
- Excluded paths include `.git`, `node_modules`, `.next`, `dist`, `build`, `coverage`, `.turbo`, `.vercel`, `.env*`, private keys and certificate/key stores.

## Required deployment step

Apply `supabase/migrations/20261115190000_project_workspace_sources.sql` to the target Supabase project. The migration assumes the existing `projects` table and private `leo-files` Storage bucket. The application uses the server-side Supabase service role only after checking authenticated project ownership; no direct client write policy is created for workspace metadata.

## API

- `GET /api/workspaces` — list the user's latest projects.
- `POST /api/workspaces` — create a project workspace (`{ "name": "..." }`).
- `GET /api/workspaces/:id/source` — list workspace files and revision.
- `POST /api/workspaces/:id/source` — import a ZIP archive or one source file as an archive.
- `GET /api/workspaces/:id/source?path=src/app.tsx` — read an editable text file.
- `PUT /api/workspaces/:id/source` — save `{ "path", "content", "revision" }`.
- `DELETE /api/workspaces/:id/source` — delete `{ "path", "revision" }`.

All endpoints require a signed-in user. Project ownership is checked on every source operation. Responses are private/no-store.

## Important verification still required

Dependencies and tests were intentionally not installed or run in this handoff. On staging, apply the migration, confirm the `leo-files` bucket exists and is private, then test upload/import, cross-device listing, text edit/save, stale revision conflict, unauthorized project ID access, ZIP path traversal, secret-file rejection, size limits, storage cleanup, and Leo context retrieval. A real runtime build and browser test are still required before calling this production verified.
