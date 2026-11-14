# LeonardX — Unified Leo Voice Implementation Report

## Implemented in this source update

- Leo Voice now uses the same `getLeoSystemPrompt()` system instructions as Leo Main Chat.
- Voice turns retrieve active user-approved `leo_memories` and the curated Leo knowledge base (`retrieveLeoKnowledge` / `formatKnowledgeContext`).
- Voice loads bounded history from the current `chats_v2` session, enforces ownership, and persists voice turns back into that same session.
- Voice invokes the existing `createUserAssistantTools` registry and `generateTextWithTools` executor. This reuses account-scoped project status/files, build status, provider readiness, skills, and approved read-only MCP tools.
- Explicit GitHub/repository questions expose the existing account-scoped repository read tools. No repository write tool is exposed from voice.
- Explicit requests to start/run a specialist agent expose a `run_agent` tool that delegates to the existing `/api/agents/run` route. Existing sign-in, plan, entitlement, owner-only, approval, rate-limit and ownership checks remain authoritative. The result is reported as queued when that is what the backend confirms.
- Explicit build requests can expose the existing project creation/save tools; deployment remains separately gated by explicit deployment intent and the existing executor checks.
- Research requests use the existing Gemini grounded Google Search path (`shouldUseWebSearch` + `generateText({ webSearch: true })`).
- Ordinary general-knowledge questions are handled by the shared configured Leo model rather than a voice-only knowledge script.
- Removed the requested Gemini quota/five-minute disclaimer from the Voice UI.
- Added four source-level regression tests for shared prompt/context, tool and agent wiring, Live-token bypass prevention, and disclaimer removal.

## Critical architectural decision and remaining gap

The previous browser-to-Gemini Live connection minted a direct client credential and sent audio directly to Gemini. That path could not securely call LeonardX's server-side tool registry, user memories, account permissions, or agent execution layer. Keeping it active would violate the requirement that Leo be one AI with one authorized orchestration boundary.

This update therefore stops minting direct Gemini Live tokens and routes conversational turns through the authenticated server-side shared orchestration path. Speech capture, transcription, speech generation, and playback remain available in turn-based mode.

**This is not yet full acceptance of the mission:** the previous low-latency Live audio streaming and true barge-in/interruption behavior are not preserved by the turn-based bridge. A secure server-side realtime audio bridge (or equivalent server-mediated tool-call protocol) is still required to restore those behaviors without bypassing authorization. Do not describe the implementation as complete until that bridge and live end-to-end parity tests exist.

## Verification

- Current root test suite: **496 passed, 0 failed, 2 skipped**. Focused Leo voice parity tests remain source-level and do not establish live service parity.
- TypeScript `transpileModule` syntax checks: voice route, realtime session route, tool orchestrator, and `LEOWidget.tsx` all passed.
- No live Gemini, Supabase, MCP, GitHub, browser, deployment, or agent execution test was run in this environment.
- Lint passes with six warnings and no errors. Typecheck passed previously. The latest production build compiled but the Node process exited abnormally during the subsequent build stage (Windows exit code `-1073740791`); the build is not considered successful.
- No commit, push, PR, production deployment, environment-variable change, or database migration was performed.

## Changed files

- `app/api/voice/route.ts`
- `app/api/realtime/session/route.ts`
- `components/LEOWidget.tsx`
- `lib/ai/tool-orchestrator.ts`
- `tests/voice-shared-orchestration.test.mjs`
