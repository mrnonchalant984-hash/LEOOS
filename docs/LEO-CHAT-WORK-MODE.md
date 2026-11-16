# Leo Chat Work mode

## Product behavior

- Chat and Work are two modes inside the same `/app` Leo conversation. Switching modes does not navigate to `/engineering` and does not discard the current conversation.
- Work mode changes the empty-state prompt, shows task starter prompts, offers a project-file upload entry point, and changes the composer placeholder.
- The dedicated `/engineering` workflow remains available as an explicit sidebar link for users who want that specialized pipeline.
- Work mode is sent to `/api/chat` as a validated `work_mode` boolean. The backend adds work-specific instructions while retaining the normal chat session, history, user authorization and attachment handling.
- The assistant must distinguish uploaded material from files on the user's local computer. It may only inspect uploaded content or connected workspaces/tools that are actually available and authorized.

## Current attachment behavior and limits

- Existing document upload path supports PDF, DOCX, PPTX, XLSX, TXT, MD, CSV and JSON. Up to three document attachments can be included with a chat message; each is limited by the existing 10 MB upload limit.
- Existing image attachment path supports PNG, JPEG and WebP; up to three images can accompany a chat message.
- Work-mode file picker allows multiple selections, but processes at most three files per selection.
- Code files and ZIP archives use the existing `/api/file-review` Gemini review path. That endpoint currently returns a one-off review; it does not mount a ZIP as a durable editable workspace or preserve the archive as a reusable attachment for every later turn.
- A durable project workspace, arbitrary repository tree upload, extraction limits/virus scanning, file-level edit/save operations, and cross-turn ZIP context remain separate implementation work. The UI and system prompt do not claim those capabilities exist.

## Verification

This change was made without installing dependencies or running the full test suite, TypeScript check, production build, browser automation, remote Supabase checks, or live Gemini tests. Verify locally after `npm ci`.
