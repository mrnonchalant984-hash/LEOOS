import { NextRequest, NextResponse } from 'next/server';
import { getProfile, isPlatformOwner } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const runtime = 'nodejs';

/**
 * Read-only migration inspection. Does not apply migrations.
 * Presence of a migration file is not proof it was applied remotely.
 */
export async function GET(request: NextRequest) {
  const auth = await getProfile(request);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (!isPlatformOwner(auth.profile)) {
    return NextResponse.json({ error: 'Owner access required for migration inspection.' }, { status: 403 });
  }
  const limited = await enforceUserRateLimit(auth.user.id, 'engineering-migrations-status', 20, 60);
  if (limited) return limited;

  const migrationsDir = join(process.cwd(), 'supabase', 'migrations');
  const files = existsSync(migrationsDir)
    ? readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
    : [];

  return NextResponse.json({
    framework: 'supabase',
    localMigrationFiles: files,
    count: files.length,
    remoteStatus: 'not_verified',
    message: 'Local migration files listed only. Remote apply status requires `npx supabase migration list` with authorized credentials. Do not assume a file was applied because it exists.',
    destructiveWarning: 'Production resets and history deletion are not supported by this endpoint.',
    recommendedCommands: {
      dryRun: 'npm run db:dry-run',
      apply: 'npm run db:push',
      list: 'npx supabase migration list',
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
