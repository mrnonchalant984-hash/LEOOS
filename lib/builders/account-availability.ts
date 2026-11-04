import { adminSupabase } from '@/lib/auth';
import { getBuilderAvailability, type BuilderAvailability } from '@/lib/builders/providers';
import type { ProjectType } from '@/lib/pricing';

/** Resolve builder readiness without reading or returning any credential values.
 * Web builds can use either platform-managed fallback tokens or this user's
 * verified, encrypted GitHub/Vercel integrations, matching build-deploy's token lookup.
 */
export async function getAccountBuilderAvailability(
  projectType: ProjectType,
  userId: string,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<BuilderAvailability> {
  const base = getBuilderAvailability(projectType, environment);
  if (!['website', 'web_app', 'saas'].includes(projectType)) return base;

  const missing = base.requiredEnvironment.filter((name) => !environment[name]?.trim());
  const providerForVariable: Record<string, string> = {
    GITHUB_TOKEN: 'github',
    VERCEL_TOKEN: 'vercel',
  };
  const needed = [...new Set(missing.map((name) => providerForVariable[name]).filter(Boolean))];
  if (!needed.length) return base;

  let verified = new Set<string>();
  try {
    const { data, error } = await adminSupabase().from('user_integrations')
      .select('provider')
      .eq('user_id', userId)
      .eq('status', 'verified')
      .in('provider', needed);
    if (error) return base;
    verified = new Set((data || []).map((row: { provider: string }) => row.provider));
  } catch {
    return base;
  }

  const remaining = missing.filter((name) => {
    const provider = providerForVariable[name];
    return !provider || !verified.has(provider);
  });
  return {
    ...base,
    status: remaining.length ? 'not_configured' : 'ready',
    ...(remaining.length
      ? { message: `Configure ${remaining.join(', ')} on the server or connect and verify the matching GitHub/Vercel account integration.` }
      : { message: undefined }),
  };
}
