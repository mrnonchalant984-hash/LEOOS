LeonardX Data Deletion Pages patch

Includes:
- app/data-deletion/page.tsx — public deletion request instructions.
- app/delete-account/page.tsx — alias redirecting to /data-deletion.
- app/data-deletion-instructions/page.tsx — alias redirecting to /data-deletion.

Apply:
1. Back up your repository.
2. Extract this ZIP at the root of your existing Next.js project, preserving folders.
3. Verify the support email in app/data-deletion/page.tsx is correct.
4. Run npx tsc --noEmit, npm run lint, npm test, and npm run build.
5. Deploy, then check https://leoos-omega.vercel.app/data-deletion.
6. Enter that URL in Meta's user-data-deletion field only after confirming the deployed page works.

Important:
This is a public instructions page and email link. It does not automatically delete database records or implement a backend deletion workflow. Do not claim automated deletion is available until a secure deletion process has been implemented and tested. The support email was read from the Meta settings screenshot; verify it before publishing.
