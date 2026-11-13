# LeonardX public design-system integration

## Scope and explicit exceptions

The Google Forms-inspired theme is applied to public LeonardX marketing, informational, contact, account/authentication, and Leo AI marketing routes. The approved light palette is the default; dark mode is persistent and uses a coordinated dark palette.

The following surfaces intentionally retain their existing visual identity and styling:

- LeoX Store (`/store/**`), including its marketplace orange/cream palette.
- Developer tools and documentation (`/developers/**`, `/docs/**`, `/cli`, `/plugins`, `/ide`, `/engineering`, `/leocode-early-access`, `/setup/keys`).
- Authenticated workspace, admin, engineering, agent, project, API, workflow, deployment, analytics, and operational surfaces.

`components/StoreChrome.tsx` classifies routes into `public` and `preserve` scopes. `app/design-system.css` styles only the public scope; it does not globally change `html`, `body`, store styles, or the LEO workspace shell. The route-shell regression test checks every page importing `LEOAppShell` against the preserved route prefixes.

## Theme behaviour

- Light default: `#F8F9FA` canvas, white surfaces, subtle grey borders, `#673AB7` accent.
- Optional dark mode: coordinated dark canvas/surfaces, lavender accent.
- Preference: `leonardx-theme` local-storage key, applied to the document theme attribute before hydration.
- Theme-specific `color-scheme` is scoped to public content so the preserved store/workspace browser controls are not changed by the public theme switch.
- Public navigation includes the theme control; sign-in and MFA screens have their own control.
- Leo AI marketing has been standardized with the public header, token-based cards, action buttons, workflow preview, process section, FAQ, and responsive layout.

## Implementation files

- `app/design-system.css` — public-only design tokens, shared public components, dark-mode styles, responsive and reduced-motion rules, Leo AI and auth/MFA styling.
- `components/StoreChrome.tsx` — route scope classifier, preserving Store and existing workspace/developer route styling.
- `components/Header.tsx` / `components/Footer.tsx` — public header/footer visibility and theme control coverage.
- `components/theme-provider.tsx` / `app/layout.tsx` — persistent theme preference without global native-control restyling.
- `components/AuthForm.tsx` and `app/auth/mfa/page.tsx` — auth and MFA theme controls/surfaces.
- `app/leo-ai/page.tsx` — complete Leo AI marketing-page standardization.
- `tests/visual-qa-routes.csv` — 112-route browser QA inventory.
- `scripts/visual-qa-playwright.py` — read-only route runner; captures desktop (1440×1000), tablet (834×1112), and mobile (390×844) screenshots in light and dark modes, plus route/status/console/overflow results.

## Browser QA usage

Start the existing application locally, then run:

```bash
python3 -m pip install playwright
python3 -m playwright install chromium
npm run test:visual -- --base-url http://127.0.0.1:3000 --output artifacts/visual-qa
```

The runner creates 672 viewport screenshots (112 routes × 2 themes × 3 viewports), `route-results.csv`, and `summary.json`. It does not authenticate, submit forms, or write application data. Routes requiring authentication are reported as `auth-gated`; an authorized test session is needed to inspect their private content.

## Verification status for this handoff

- Focused design-system and SEO regression tests: **12 passed, 0 failed**.
- Full repository regression suite: **459 tests; 448 passed, 9 failed, 2 skipped**. All 9 failures are dependency-resolution failures in the incomplete supplied install: `zod`, `jszip`, `@google/genai`, `ajv`, and `undici` are missing/incomplete. The failing files are `agent-contracts`, `expo-artifact`, `image-generation-capabilities`, `mcp-protocol`, `mcp-remote-hardening`, `plugins`, `skill-bundle`, `vercel-deployment-url`, and `workspace-export`.
- Modified TSX syntax transpilation: **passed** for `StoreChrome`, Header, Footer, AuthForm, LEOAppShell, theme provider, Leo AI page, MFA page, and root layout.
- CSS parser validation: **passed** for `app/design-system.css`.
- Python browser-runner syntax validation: **passed** (`python -m py_compile scripts/visual-qa-playwright.py`).
- Route-shell regression: all source pages importing `LEOAppShell` are explicitly classified as preserve; test passed.
- Public page-source hex scan: no page-level hex colour literals remain on public routes; literals remain only on explicitly preserved Store/developer/workspace routes.
- Full `npm run typecheck`: **blocked** because `next` is absent (`next: not found`).
- Full `npm run build`: **blocked** at the same missing `next` dependency.
- `npm run lint`: **blocked** because `eslint` is absent (`eslint: not found`).
- `npm ci --ignore-scripts --no-audit --no-fund`: timed out before dependency installation completed.
- Browser screenshots: **not captured**. Python Playwright could launch Chromium, but outbound navigation to the production site was blocked by the environment (`net::ERR_BLOCKED_BY_ADMINISTRATOR`). The browser suite is included but must be run where the app and browser access are available. It targets all 112 routes and is configured for 672 screenshots (112 routes × 2 themes × 3 viewports). Protected routes are marked auth-gated unless run with an authorized test session.

No database, Supabase, authentication API, MCP, environment variable, business logic, remote Git, or production deployment changes were made.
