# LeonardX Work mode update

Implemented in the existing Leo Chat workspace:

- Chat/Work is now a local segmented mode switch; Work no longer routes to `/engineering`.
- Work mode has its own "What should we work on?" empty state, suggested task prompts, project-file upload entry point, and work-focused composer placeholder.
- Work mode is sent as a validated `work_mode` flag to the existing `/api/chat` endpoint, so it stays in the same chat session and retains normal chat history and attachment handling.
- The backend adds work-specific instructions: inspect only uploaded or connected material, preserve existing project structure, and never claim local file access, edits, command execution, tests, or deployment without verified tool evidence.
- The dedicated Engineering workflow remains accessible explicitly from the sidebar.

Attachment scope is documented in `docs/LEO-CHAT-WORK-MODE.md`. Current document/image attachments can be included with the next chat message. Code files and ZIP archives still use the existing one-off file-review path; they are not yet durable editable project workspaces. This limitation is explicit and must not be represented as implemented project-file editing.

No dependency installation, test execution, TypeScript check, production build, browser test, remote Supabase test, live Gemini test, GitHub push, or deployment was performed.
