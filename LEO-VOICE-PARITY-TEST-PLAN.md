# Leo Main Chat ↔ Leo Voice Parity Test Plan

**Status:** prepared; live authenticated execution pending.

Run each prompt once in Main Chat and once in a fresh Leo Voice session under the same signed-in account and active chat. Compare factual content, context, and whether the expected authorized tool actually ran. Save transcripts and tool audit evidence; do not mark parity passed from matching text alone.

| # | Identical test prompt | Expected evidence |
|---:|---|---|
| 1 | Who are you? | Identifies itself as Leo, LeonardX's AI assistant; no invented identity. |
| 2 | Who is your owner? | Uses the canonical founder/owner information from the shared system prompt and curated knowledge. |
| 3 | What is LeonardX? | Explains the platform accurately using shared platform knowledge. |
| 4 | What is LeoX Store? | Explains the separate marketplace product without confusing it with LeonardX core. |
| 5 | What can you do on this platform? | Lists only capabilities currently available to this account and avoids claiming unavailable features. |
| 6 | Can you check my project's deployment status? | Calls the account-scoped project/build status tool; reports verified database status and URL only if present. |
| 7 | Can you inspect a website? | Calls `inspect_public_website` for a public URL; returns observed title/headings/content, not guessed results. |
| 8 | Can you research something online? | Performs Google Search and distinguishes sourced/current findings from general knowledge. |
| 9 | Can you execute an available agent? | Starts an agent only after the explicit request; verify the returned run/job ID and account authorization. |
| 10 | Can you explain what is happening in my workspace? | Uses available account-scoped project/build/observability tools; does not invent current workspace state. |

## General-knowledge control

Also ask both interfaces one ordinary non-LeonardX question (for example, explain how photosynthesis works) to confirm that Leo has broad general knowledge and is not constrained to platform-only answers.

## Actual tool-operation checks

- Project status: compare the same owned `project_id`; verify the same status and timestamps from the data source.
- Website inspection: use the same public HTTPS URL; compare the fetched HTTP status, page title, headings, and excerpt.
- Web research: ask the same time-sensitive question; compare the retrieved sources and date context.
- Agent: explicitly authorize one harmless read-only audit task; verify one agent run is queued and that no completion is claimed until the run reports it.
- MCP/GitHub: only test integrations connected and approved for the test account; confirm the audit records and account scope.

## Pass criteria

All ten prompts and the general-knowledge control must be tested in both interfaces. Tool tests pass only when the tool is actually invoked and its result is reflected accurately. No cross-account data may be returned. No unauthorized write, publish, or deploy action may occur. Interrupt Leo mid-response and confirm playback stops promptly while the session remains usable. Confirm completed voice turns appear in the same `chats_v2` session when reopened in Main Chat.

## Current result

Not executed against live services in this source-editing environment. Static regression checks are not a substitute for the live parity run.
