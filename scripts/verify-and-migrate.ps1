$ErrorActionPreference = "Stop"

npm run verify
npx supabase db push --dry-run
npx supabase db push
npx supabase migration list
