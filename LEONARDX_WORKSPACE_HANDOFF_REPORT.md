# LeonardX Work Mode Workspace Upgrade

This upgrade extends the existing Chat/Work toggle so Work mode can retain project source files as a durable workspace rather than using one-off file review for code and ZIP uploads.

## Added

- `lib/workspace-source.ts`: private ZIP archive storage, safe path validation, archive limits, manifest generation, text file reads/writes/deletes, and revision compare-and-swap.
- `app/api/workspaces/route.ts`: authenticated workspace listing and creation with project-plan and project-capacity checks.
- `app/api/workspaces/[id]/source/route.ts`: authenticated import, listing, reading, editing and deletion endpoints.
- `supabase/migrations/20261115190000_project_workspace_sources.sql`: owner-scoped workspace metadata table with RLS and revision metadata.
- `docs/WORK-MODE-PROJECT-WORKSPACES.md`: architecture, limits, API contract and staging acceptance checklist.
- `components/LEOWidget.tsx`: persistent workspace upload/list/edit UI and project context handoff.
- `app/api/chat/route.ts`: bounded saved-workspace excerpts included in Work-mode model context, with untrusted-file prompt-injection handling.

## Safety and reliability

- Uses existing private `leo-files` bucket; no public URLs are created.
- Server verifies project ownership for each source operation.
- Rejects path traversal, secret paths, symlinks and common generated dependency/build folders.
- Caps archive size, file count, per-file size and total expanded size.
- Uses immutable versioned archive object names and optimistic revision updates; stale writes return 409.
- Removes superseded or failed archive objects where possible.

## Capability boundary

The current implementation provides durable upload, storage, browsing, text editing, download, and bounded file context for Leo. It does not yet provide an isolated terminal/container, package installation, live application preview, automatic test execution, or autonomous AI writes back into this source archive. Those capabilities require a separate execution adapter and sandbox policy; this handoff does not claim they are present.

## Required before production

Apply the new Supabase migration. Confirm the existing Storage bucket is private. Then install dependencies and run the full TypeScript/build/test suite locally. Perform staging tests for RLS/tenant isolation, upload limits, malformed and hostile ZIP files, concurrent edits, cross-device restore, editor save, and Leo context loading. This ZIP has not been live-tested against Supabase or deployed to Vercel. No dependencies were installed and no tests/build were run, as requested.
