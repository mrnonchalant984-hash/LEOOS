# LeoX Store test report

## Checks run

- `node --experimental-strip-types --test tests/marketplace-products.test.mjs` — passed, 5/5.
- `npm run typecheck` — passed, including `next typegen` and `tsc --noEmit`.
- Targeted ESLint on Store routes, helper, sitemap, robots, and Store tests — passed.
- Full `npm test` — failed: 413 passed and 2 failed. One existing test file (`tests/agent-execution-architecture.test.mjs`) contains NUL bytes and cannot parse; `tests/isolated-runner-contract.test.mjs` expects a missing sandbox `DELETE` handler in the unrelated existing route.
- Full `npm run lint` — failed on the same two NUL-filled existing files (`tests/agent-execution-architecture.test.mjs` and `extensions/leocode/test/workspace-agent.test.cjs`); it also reported five pre-existing warnings.

No integration, RLS, browser/mobile, migration dry-run, staging, live provider, or production tests have passed in this worktree. A successful typecheck is not a production build result.
