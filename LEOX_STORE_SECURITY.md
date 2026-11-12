# LeoX Store security

- Authentication reuses `getUserFromRequest` and the existing verified Supabase access token; no role or seller ID is accepted from the browser.
- Writes occur server-side only. `SUPABASE_SERVICE_ROLE_KEY` is not imported by client code.
- The database grants public roles select access with an RLS condition restricted to active listings and no direct write permissions.
- New submissions are held as `pending_review`, are rate-limited, have bounded bodies, validated values, and server-generated slugs.
- Public API failures are sanitized; only server logs receive database error messages.
- Search text is length-bounded and wildcard characters are removed before the `ilike` filter.

Unverified gates: live RLS behavior, rate-limit migration availability, staging authorization tests, security scanning, storage policy, and full abuse/moderation controls. The current product slice does not accept images, so no upload path is exposed.
