import 'server-only';

import { adminSupabase, isPlatformOwner } from '@/lib/auth';
import { canManageOrganization, canReadOrganizationRole, canWriteOrganization, isOrganizationRole, type OrganizationRole } from '@/lib/organization-access-core';

export { canManageOrganization, canReadOrganizationRole, canWriteOrganization, isOrganizationRole } from '@/lib/organization-access-core';
export type { OrganizationRole } from '@/lib/organization-access-core';

export async function getOrganizationRole(userId: string, organizationId: string): Promise<OrganizationRole | null> {
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) return null;
  const db = adminSupabase();
  const { data: organization } = await db.from('organizations').select('owner_user_id').eq('id', organizationId).maybeSingle();
  if (!organization) return null;
  if (organization.owner_user_id === userId) return 'OWNER';
  const { data: membership } = await db.from('organization_members').select('role').eq('organization_id', organizationId).eq('user_id', userId).maybeSingle();
  return isOrganizationRole(membership?.role) ? membership.role : null;
}

export async function canReadOrganization(userId: string, profile: { role?: string | null; email?: string | null } | null, organizationId: string) {
  return Boolean(isPlatformOwner(profile) || canReadOrganizationRole(await getOrganizationRole(userId, organizationId)));
}
