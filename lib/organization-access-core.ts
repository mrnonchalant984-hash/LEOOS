export type OrganizationRole = 'OWNER' | 'ADMIN' | 'DEVELOPER' | 'VIEWER';

export function isOrganizationRole(value: unknown): value is OrganizationRole {
  return value === 'OWNER' || value === 'ADMIN' || value === 'DEVELOPER' || value === 'VIEWER';
}

export function canWriteOrganization(role: OrganizationRole | null) {
  return role === 'OWNER' || role === 'ADMIN' || role === 'DEVELOPER';
}

export function canManageOrganization(role: OrganizationRole | null) {
  return role === 'OWNER' || role === 'ADMIN';
}

export function canReadOrganizationRole(role: OrganizationRole | null) {
  return isOrganizationRole(role);
}
