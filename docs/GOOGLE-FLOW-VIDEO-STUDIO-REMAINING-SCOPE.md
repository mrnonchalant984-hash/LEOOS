# Google Flow Video Studio — Remaining Implementation Scope

This document tracks the work required to turn the initial Google Veo provider cutover into a complete, testable video-production workflow. The items below are **planned, not implemented** by the current provider cutover.

## 1. Google Flow connector

- Add a provider-neutral MCP client adapter for a user-configured Google Flow-compatible MCP server.
- Discover and validate tools/capabilities from the MCP server at connection time; do not hard-code undocumented Flow endpoints or assume that Google Flow exposes a public generation API.
- Store connector credentials server-side, encrypted at rest, scoped to the owning user/workspace, and never expose secrets to the browser or logs.
- Add connection health, capability discovery, request timeout, cancellation, retry/backoff, and clear unsupported-capability errors.
- Keep the official Vertex AI Veo adapter as the supported direct-generation path when no verified Flow MCP connector is configured.
- Require explicit user authorization before a connected Flow tool can submit jobs or access user assets.

**Acceptance:** a configured MCP test server can be connected, discovered, invoked, and disconnected; invalid credentials and unavailable tools produce actionable errors; no secret appears in logs or client responses.

## 2. Script and storyboard pipeline

- Add a structured screenplay response contract: project brief, audience, runtime, tone, narration language, scenes, and continuity notes.
- Generate editable scripts and storyboards through the configured Gemini text model; validate all model output against a strict schema before saving.
- Each scene must carry a stable ID, order, duration, visual prompt, camera/motion direction, transition, narration segment, and optional reference-asset IDs.
- Provide a review/edit/approve step before any paid video generation begins.
- Recalculate total runtime and estimated credits whenever scene durations change.

**Acceptance:** malformed model output is rejected safely; users can edit/reorder scenes; saved drafts can be reopened without losing scene IDs or ordering; generation cannot start until the storyboard is approved.

## 3. Multi-scene generation and assembly

- Create a durable project/job model that tracks each scene independently and the overall project lifecycle.
- Submit approved scenes to the selected provider using supported durations and aspect ratios; persist provider operation IDs and per-scene status.
- Resume interrupted projects, retry eligible failed scenes, and prevent duplicate submissions with idempotency keys.
- Assemble completed scenes in storyboard order, apply supported transitions, and verify the final media file before publishing it to private Supabase storage.
- Keep partial outputs private and clearly label them as incomplete until final assembly succeeds.

**Acceptance:** a multi-scene test project survives worker restarts, resumes polling, does not double-charge or double-submit, preserves scene order, and exposes a final downloadable asset only after file validation.

## 4. Narration and audio integration

- Integrate the existing LeonardX voice provider through its server-side voice orchestration; do not create a second independent credential path.
- Generate narration per approved script segment with configurable voice/language settings supported by the connected provider.
- Track narration generation separately from video generation, store audio privately, and support regeneration of one segment without rebuilding unrelated scenes.
- Synchronize narration timing with scene durations; include generated Veo audio only when the selected workflow supports it and the user chooses it.
- Add audio-level, duration, and media-container validation before final assembly.

**Acceptance:** a test script produces narration segments, each segment maps to the correct scene, failed audio generation is recoverable, and the final assembled output passes playback and duration checks.

## 5. End-to-end verification and release gates

- Add deterministic unit tests for schema validation, provider capability mapping, job state transitions, idempotency, credit reservation/refund, access control, and storage failure handling.
- Add mocked integration tests for MCP discovery/invocation, Gemini script generation, Veo operation polling, narration, and final assembly.
- Add staging-only live tests that require explicit environment flags and test credentials; never run paid live generation in ordinary CI.
- Verify owner and non-owner authorization, per-user project isolation, signed URL expiry, upload size limits, cancellation, retry, and cleanup of abandoned temporary assets.
- Run lint, typecheck, unit tests, production build, and staging smoke tests; record the exact commit and results.
- Keep production deployment and database migration as separate, explicitly approved release actions.

**Acceptance:** CI passes all deterministic checks; a staging end-to-end run creates, reviews, generates, narrates, assembles, stores, previews, and downloads a real test video; the release report identifies any unverified provider capability.

## Current boundary

The existing branch adds a server-side Google Veo text-to-video adapter and the initial Studio controls. It does not yet implement the Flow MCP connector, script/storyboard authoring, multi-scene orchestration/assembly, narration synchronization, or a live end-to-end test. Do not describe those capabilities as available until their acceptance criteria above are met.
