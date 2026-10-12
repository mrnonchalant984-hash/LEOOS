# LeonardX security tutorial

Review bearer key hashing and scope checks in [`lib/api-auth.ts`](./lib/api-auth.ts), RLS in `supabase/`, webhook HMAC in `lib/webhooks-core.ts`, and SSRF URL checks in `lib/webhooks-core.ts`. Add negative tests for cross-tenant project, billing, key and admin access before enabling shared workspaces. Keep secrets server-only and use the report-only CSP until staging browser reports are reviewed. References: [OWASP API Security](https://owasp.org/www-project-api-security/), [OWASP WSTG](https://owasp.org/www-project-web-security-testing-guide/).
