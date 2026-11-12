# LeoX Store API

## `GET /api/store/products`

Returns at most 24 active listings. Optional query parameters are `q` (title), `category`, and `country` (two-letter country code). Public response caching is limited to 30 seconds with a 60-second stale window. Database/configuration failures return a generic 503 response.

## `POST /api/store/products`

Requires the existing authenticated Leo access cookie and a same-origin request. Request bodies are limited to 16 KB. The server applies the shared per-user listing limit (5 submissions per hour), validates all fields, derives `seller_id` from the verified session, generates the slug, and writes `pending_review` state. Successful responses return the new ID, slug, and moderation state. Invalid JSON and invalid fields return 400; missing auth returns 401; limiter failures fail closed.

Supported condition values are `new`, `used`, and `refurbished`. Categories are defined in `lib/store/products.ts`. Currency is an uppercase three-letter code and is never converted.

Product editing, deletion, images, seller profiles, messaging, moderation endpoints, and admin APIs are not implemented.
