# LeoCode Native Agent & Agency Integration — Implementation Report

**Baseline:** `LEONARDX-provider-settlement-affiliate-cashout-supplier-dispatch.zip`
**Extension ID:** `leonardx.leocode` (preserved)
**Extension version:** `0.1.2`
**Production deployment:** Not performed
**Git commit / branch:** Not created

## 1. Initial repository findings

The supplied repository already contained a real VS Code extension rather than a blank shell:

- `extensions/leocode/package.json` contributed a native VS Code custom-agent profile through `contributes.chatAgents`, a LeoCode activity-bar view, commands, and language-model tools.
- `agents/leocode-native.agent.md` described a native workspace agent and the extension already registered two LeonardX MCP tools through `vscode.lm.registerTool`.
- The extension already used VS Code `SecretStorage`, safe workspace path filtering, symlink rejection, bounded workspace search, opt-in context sharing, proposal diffs, and explicit approval before applying proposed edits.
- `lib/agents/registry.ts` already held the specialist registry. `lib/agents/manager.ts` already filtered injected tools against each agent's `allowedTools` capabilities.
- MCP calls already passed through the authenticated LeonardX gateway, with read-only tool approvals and per-agent grants checked server-side.

The important gaps found before changes:

1. `leocode.reviewFile` only sent a review prompt to the chat view; it did not create structured findings or a dedicated review workflow.
2. There was no local review workflow for selected code, whole workspaces, or Git changes.
3. The terminal command used `Terminal.sendText`, so LeoCode could not collect command output or a reliable exit code.
4. The specialist picker could run one specialist but did not ask Leo Manager to plan, delegate, collect, and synthesize multiple specialist results.
5. A real server-side tool-injection mismatch existed: repository read tools were nested inside `allowBuildActions`. A read-only Code Review Agent with `repository_read`/`file_read` but without `file_write` did not receive the GitHub repository read tools it was authorized to use.
6. The existing MCP bridge supported LeonardX-connected, approved tools; it was not a direct arbitrary third-party MCP client.

## 2. Files changed

### VS Code extension

- `extensions/leocode/package.json` — version `0.1.2`; added commands for selection/workspace/Git review, review centre, specialist coordination, test discovery, and Git inspection.
- `extensions/leocode/package-lock.json` — synchronized extension version and VS Code engine metadata.
- `extensions/leocode/src/extension.ts` — registered the new review and coordination workflows; replaced terminal `sendText` execution with the approved shell-integration runner.
- `extensions/leocode/src/review/engine.ts` — bounded local review engine and structured findings.
- `extensions/leocode/src/review/centre.ts` — dedicated Review Centre, source navigation, suggested-fix handoff, diff-first safe fix and verification prompt.
- `extensions/leocode/src/review/orchestration.ts` — Leo Manager planning, account-visible specialist delegation, explicit approval, actual response collection and synthesis.
- `extensions/leocode/src/workspace/terminal.ts` — test-script discovery and exact-command-approved terminal execution with captured output/exit status.
- `extensions/leocode/agents/leocode-native.agent.md` — added instructions for using the new native review and specialist-coordination commands.
- `extensions/leocode/README.md` — updated feature and limitation documentation.
- `extensions/leocode/CHANGELOG.md` — added 0.1.2 notes.
- `extensions/leocode/test/code-review-centre.test.cjs` — new review, approval, orchestration and terminal behavior tests.
- `extensions/leocode/test/workspace-agent.test.cjs` — updated the terminal assertion for shell integration.

### LeonardX server orchestration

- `lib/ai/tool-orchestrator.ts` — moved repository read-tool injection outside the project-builder capability gate. `repository_read`/`file_read` specialists now receive the read-only repository tools independently of `file_write`/builder permissions. Git commit tools remain separately gated by `allowRepositoryWrites`.
- `tests/agent-specialist-permissions.test.mjs` — regression test for the repository read-tool injection mismatch.

## 3. Native VS Code capabilities

The existing native custom-agent manifest and extension identity were preserved. The new extension commands provide:

- Local review of the active file, current selection, selected workspace root, and staged/unstaged Git changes.
- Workspace file enumeration and source inspection within bounded file/byte limits, excluding credential/build/dependency paths and rejecting symlink traversal.
- Diagnostics from VS Code language services.
- Source-location navigation from review findings.
- Diff previews and confirmation-gated edits.
- Discovery of test/lint/typecheck/build scripts from project manifests.
- Terminal command execution through VS Code shell integration after exact-command approval. Actual output and exit status are collected when shell integration supports them; no fallback silently reports a successful result.
- Git branch and staged/unstaged/conflict status through the built-in Git extension.

The extension does not silently send local source files to LeonardX. Specialist coordination shares only a bounded workspace summary after the user opts in. Raw source sharing remains separately controlled by existing file-selection/context flows.

## 4. Code Review Centre

The new local Review Centre creates structured findings with:

- Finding ID, severity, file path, line/line range, category, classification, description, technical explanation, evidence, recommended correction, confidence, and verification status.
- Classifications for confirmed diagnostic defects, potential defects, suggestions, and uncertain findings.
- Language-service diagnostics are marked separately from heuristic static findings.
- Static checks cover credential-like literals (without including the detected value in the report), dynamic evaluation, injection-sensitive HTML APIs, empty catch blocks, TODO/FIXME markers, and trailing whitespace.
- The report is explicit that heuristic findings are not proof of exploitability and that an empty report does not prove the project defect-free.

A review is read-only. Findings can be opened at their source location and can be sent to Leo for a proposed correction. The only automatic correction currently offered is trailing-whitespace cleanup; it opens a diff, asks for explicit approval, verifies that the original file has not changed, and then applies the single-line edit. After an applied fix, the user can discover and run verification scripts.

A full semantic/LLM review engine, PR review, and automated multi-file remediation are not claimed as completed.

## 5. Specialist-agent integration

LeoCode now uses the existing `/api/agents` catalog and `/api/agents/run` endpoint:

1. The user describes an engineering task.
2. The extension asks whether a bounded workspace summary may be shared.
3. Leo Manager receives the task and available registry IDs and returns a bounded delegation plan.
4. The extension filters requested IDs against the account-visible registry and limits delegation to four specialists.
5. The user explicitly approves the proposed specialist runs.
6. Each specialist is invoked through the existing authenticated endpoint; returned status/result data is collected.
7. Leo Manager receives the actual specialist responses and is asked to synthesize agreement, conflicts, unknowns, and next steps.
8. The output channel shows the plan, synthesis status, and each raw specialist result.

If the manager plan is not parseable, a bounded deterministic fallback selects relevant existing specialists. No duplicate registry was created. The extension does not claim local file edits or test execution by remote specialists.

### Tool injection repair

`createUserAssistantTools` previously created repository read tools only inside the `allowBuildActions` block. That incorrectly coupled read-only repository access to project-builder/write permissions. Repository tree/read/status tools are now injected independently when `allowRepositoryAccess` is authorized. `github_commit_files` remains separately gated by explicit write authorization. MCP tools remain limited to server-approved read-only tools and per-agent grants.

## 6. MCP integration status

- Existing MCP discovery and invocation are preserved.
- VS Code language-model tools continue to expose LeonardX MCP catalog and call operations.
- The backend remains the authority for account ownership, enabled connections, tool approval, and execution permissions.
- The extension asks VS Code to confirm MCP calls; the backend rechecks approval.
- Specialist-side MCP access remains restricted to read-only tools explicitly granted to that specialist.
- Arbitrary third-party MCP server connections directly from the extension are not implemented; users connect those through the existing LeonardX MCP connection architecture.

## 7. Model routing

- Existing LeonardX `/api/chat` and `/api/agents/run` calls continue through the server-side model/provider architecture and its Gemini-first configuration.
- The native VS Code custom-agent host can use the model selected by the VS Code chat host. That host-managed native-agent model is distinct from LeonardX's server-side Gemini router; this implementation does not falsely report it as Gemini.
- No new model selector or provider credentials were added to LeoCode.
- Existing provider fallback rules remain server-owned.

## 8. Security and approvals

- Workspace reads remain bounded, secret-path filtered, redacted where context is shared, and symlink-aware.
- Local workspace review does not write files.
- Suggested changes are proposals; the built-in safe fix requires a diff, user approval, and stale-content check.
- Terminal execution requires approval of the exact command and runs in a visible VS Code terminal.
- Git status is read-only; no commit, push, or deployment command is automatically executed.
- MCP tool approval remains enforced in both extension and server paths.
- Remote specialist delegation requires user approval and uses account-visible agents only.
- Existing owner-only agent checks, model routing, quota checks, and server-side authorization are preserved.

## 9. Tests and verification

### Passed

- New Review Centre / orchestration / terminal static regression tests: **5 passed**.
- Workspace agent tests (including the updated terminal behavior assertion): **4 passed**.
- Combined extension-targeted tests: **9 passed, 0 failed**.
- Root agent-specialist permission, execution architecture, developer-agent, and LeoCode entitlement checks: **13 passed** in the selected run; one separate agent-contract test could not load because `zod` is absent.
- TypeScript syntax parsing with Node's TypeScript stripping: **passed** for the changed extension entrypoint, review modules, and terminal module.
- Full repository test run: **451 tests; 440 passed, 9 failed, 2 skipped**.

### Blocked / not verified

The nine full-suite failures are dependency-load failures in the supplied extracted workspace, not nine reported implementation assertion failures:

- Missing `zod`
- Missing `jszip`
- Missing `@google/genai`
- Missing `@modelcontextprotocol/sdk`
- Missing `ajv`
- Missing `undici`

`npm ci` in `extensions/leocode` timed out; an offline retry confirmed required package tarballs were not cached. Consequently:

- Extension TypeScript compilation is **not verified**.
- VSIX packaging is **not completed**.
- Extension-host activation and installation were **not tested**.
- Live LeonardX API specialist runs, MCP invocations, and local terminal shell-integration execution were **not tested** in a VS Code Extension Development Host.
- No live GitHub PR review integration was exercised.

The repository contains an older pre-existing `leocode-0.1.0.vsix`; it was not replaced or represented as the new 0.1.2 build.

## 10. Acceptance status

| Acceptance item | Status |
|---|---|
| Native VS Code custom-agent registration | Existing manifest preserved; not re-tested in Extension Host |
| Authorized workspace context and inspection | Implemented; runtime test pending |
| File and workspace review | Implemented with bounded local static checks and diagnostics |
| Structured findings and source locations | Implemented |
| Suggested corrections and diff preview | Implemented through Leo handoff and safe formatting fix |
| Approved file modification | Implemented for narrow safe fix; existing proposal workflow preserved |
| Test discovery and actual terminal output | Implemented using shell integration; runtime test pending |
| Code Review Agent repository tools | Injection mismatch repaired; runtime test pending |
| Leo Manager delegation and synthesis | Implemented against existing endpoints; live account test pending |
| Specialist results collected | Implemented; live account test pending |
| Approval enforcement | Existing server policy preserved; new local approval prompts added |
| Activity/reporting | Actual specialist results shown in Output Channel; persistent local-task telemetry not added |
| MCP authorized connections | Existing gateway and approvals preserved; arbitrary direct MCP unsupported |
| VSIX build/install | Not completed; dependencies unavailable |
| Existing LeonardX functionality | Changes are additive; full regression suite has 9 dependency-load failures |

## 11. Remaining work

1. Restore/install the locked extension and root dependencies in a network-enabled environment.
2. Run `npm ci` and `npm run compile` in `extensions/leocode`.
3. Run the extension tests after compilation and fix any TypeScript/API compatibility errors revealed by the actual VS Code typings.
4. Launch VS Code Extension Development Host and test activation, native agent discovery, local review, source navigation, diff/apply, test execution, Git inspection, and shell output capture.
5. Test Leo Manager planning and synthesis with an authenticated LeonardX account and verify each specialist's actual tool-call audit records.
6. Build and install the 0.1.2 VSIX in a compatible VS Code environment.
7. Add authorized GitHub pull-request review integration and persistent unified local/remote activity events if those are required for the next release.

No GitHub branch, commit, pull request, database migration, or production deployment was created or performed.
