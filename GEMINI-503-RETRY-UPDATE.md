# LeonardX Gemini 503 fallback update

## Changes
- Added a bounded fallback-only retry for transient 502/503/504 and recognized network failures. It allows at most one outer retry after the initial Gemini attempt, with exponential backoff and jitter.
- The primary OpenAI call is never repeated by this retry loop. Authentication/access (401/403), missing model/endpoint (404), quota/rate limit (429), and malformed request (400) failures are not retried by the outer loop.
- Chat route passes its request AbortSignal to the fallback retry wait, so an already-cancelled request does not start a fallback or remain sleeping.
- Added sanitized fallback diagnostics with a provider error code only when it matches a conservative allowlist; raw SDK messages, prompts, and credentials are not logged.
- The final user-facing message explains that 502/503/504 may be temporary and suggests retrying.
- Added deterministic tests for transient recovery, exhausted retry budget, non-retryable status codes, primary-provider success, and cancellation.

## Important limitations
- The retry wraps the existing provider SDK call; SDK-level retries may also exist. This implementation deliberately allows only one additional outer attempt to limit retry amplification. Confirm SDK retry defaults for the installed version before increasing it.
- AbortSignal cancels the retry delay and prevents a new fallback attempt. The current provider adapter API does not pass AbortSignal into every provider SDK request, so an already-running SDK request may continue until its own timeout.
- The MaxListenersExceededWarning and slow `/api/credits` / chat-history GET requests are not fixed by this change. Their cause needs a runtime trace (`node --trace-warnings`) and per-stage timing around proxy/Supabase auth and database calls. Raising the listener limit would only hide the warning.
- No live Google request is run by these tests. A 503 may still be a genuine temporary Google service/capacity issue.
