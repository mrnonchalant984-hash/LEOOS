# LeonardX AIProviderStatus minimal lint repair

## Apply
Copy `components/AIProviderStatus.tsx` into the same path in the LeonardX repository. No other project files are changed by this patch.

## Root cause and repair
The effect called `load()`, and `load()` synchronously called `setLoading(true)` and `setError('')` before its first `await`. That triggered `react-hooks/set-state-in-effect`. Initial loading now starts with `loading` initialized to `true`; the effect performs the request and only updates React state after the asynchronous response settles. Manual Refresh retains its loading/error behavior and the same `/api/models` endpoint.

Both initial and manual requests use `AbortController`. The effect cleanup aborts outstanding requests on unmount; success, error, and final loading updates are skipped for aborted requests. No ESLint suppression, dependency, API, authentication, provider, or pricing changes are included.

## Validation attempt and limitations
Validation was attempted against the extracted `LEOOS-main` source archive available in this environment, which is older than the current GitHub `main` inspected for this task. `npm ci` could not complete because the environment could not resolve `registry.npmjs.org` (`EAI_AGAIN`), leaving an incomplete `node_modules`. Therefore these are not successful full-project validation results:

- `npx tsc --noEmit`: exit 2; incomplete dependencies caused missing type definition errors (`node`, `react`, `react-dom`, and others).
- `npm run lint`: exit 127; `eslint` executable unavailable because dependency installation did not complete.
- `npm test`: exit 1; 251 tests discovered, 244 passed, 5 failed, 2 skipped. The incomplete/stale archive had an `ERR_MODULE_NOT_FOUND` in `tests/expo-artifact.test.mjs` and a source/test expectation mismatch in `tests/leo-chat-gemini-integration.test.mjs`.
- `npm run build`: exit 127; `next` executable unavailable because dependency installation did not complete.

These failures do not establish that the component patch passes the requested checks. Re-run all four commands after a successful `npm ci` in the current repository checkout.

## `MODULE_TYPELESS_PACKAGE_JSON`
The warning is emitted by Node's experimental TypeScript stripping when a `.ts` file with ES module syntax is loaded while `package.json` has no `type` field. This patch does not add `"type": "module"`: that is a package-wide module-mode change and could affect existing `.js` scripts/configuration. Assess each warning-producing entry point and its imports separately before considering a module-mode migration.
