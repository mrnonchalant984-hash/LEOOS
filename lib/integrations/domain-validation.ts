export function isValidVercelProjectId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

export function isValidCustomDomain(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 253 || value !== value.trim() || value.includes('://') || value.includes('/') || value.includes('@')) return false;
  const domain = value.toLowerCase().replace(/\.$/, '');
  return domain.includes('.') && domain.split('.').every(label => label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label));
}
