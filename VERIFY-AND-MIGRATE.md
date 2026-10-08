# LEO OS verification and migration

## One-time dependency sync

Run from the project root:

```powershell
npm install
```

This syncs `package.json`/`package-lock.json` and installs the Supabase CLI + ESLint dependencies added by this repair.

## Full verification

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

## Safe Supabase migration flow

Always inspect first:

```powershell
npx supabase migration list
npx supabase db push --dry-run
```

Only when the dry run is correct:

```powershell
npx supabase db push
```

Then verify:

```powershell
npx supabase migration list
npx supabase db push --dry-run
```

Do not use `supabase migration repair` unless the migration history itself is known to be incorrect.
Do not reset the linked production database.
