# LEO OS API v2

API v2 is the next-generation developer surface layered onto the existing LEO OS application. It does not replace existing v1 routes.

## Base
`/api/v2`

## Authentication
Send `Authorization: Bearer leo_...`. Keys are stored as SHA-256 hashes and are never returned after creation.

## Scopes
- `read` — read API resources
- `write` — create/update/delete resources
- `*` — explicit full-access scope

## Resources
- `GET /me`
- `GET /projects`
- `POST /projects`
- `GET /projects/:id`
- `PATCH /projects/:id`
- `GET /usage`
- `GET /webhooks`
- `POST /webhooks`
- `PATCH /webhooks/:id`
- `DELETE /webhooks/:id`

Every response carries `request_id` and the HTTP `X-Request-ID` header.

## Compatibility
v1 remains available. v2 adds stronger resource semantics, write scopes, pagination metadata, query filtering, SDK support, and a dedicated API request-log migration.

## Important provider/security note
Webhook creation is implemented, but live signed delivery requires a secure retrievable signing-secret strategy. The current schema stores a hash for verification, so the test-delivery endpoint intentionally refuses to pretend delivery is ready. Do not mark webhook delivery as production-complete until encrypted secret storage and a background delivery worker are deployed.
