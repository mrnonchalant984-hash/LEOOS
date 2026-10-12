import 'server-only';

import { adminSupabase, isPlatformOwner } from '@/lib/auth';

export type OrganizationRole = 'OWNER' | 'ADMIN' | 'DEVELOPER' | 'VIEWER';

export async function getOrganizationRole(userId: string, organizationId: string): Promise<OrganizationRole | null> {
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) return null;
  const db = adminSupabase();
  const { data: organization } = await db.from('organizations').select('owner_user_id').eq('id', organizationId).maybeSingle();
  if (!organization) return null;
  if (organization.owner_user_id === userId) return 'OWNER';
  const { data: membership } = await db.from('organization_members').select('role').eq('organization_id', organizationId).eq('user_id', userId).maybeSingle();
  const role = membership?.role;
  return role === 'ADMIN' || role === 'DEVELOPER' || role === 'VIEWER' ? role : null;
}

export function canWriteOrganization(role: OrganizationRole | null) {
  return role === 'OWNER' || role === 'ADMIN' || role === 'DEVELOPER';
}

export function canManageOrganization(role: OrganizationRole | null) {
  return role === 'OWNER' || role === 'ADMIN';
}

export async function canReadOrganization(userId: string, profile: { role?: string | null; email?: string | null } | null, organizationId: string) {
  return Boolean(isPlatformOwner(profile) || await getOrganizationRole(userId, organizationId));
}
