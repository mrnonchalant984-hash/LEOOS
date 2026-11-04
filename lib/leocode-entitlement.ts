import { adminSupabase } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { LEOCODE_DAILY_REQUEST_LIMIT, LEOCODE_DAILY_WINDOW_SECONDS } from './leocode-entitlement-config';

export { LEOCODE_DAILY_REQUEST_LIMIT, LEOCODE_DAILY_WINDOW_SECONDS } from './leocode-entitlement-config';

export async function getActiveLeoCodeEntitlement(userId: string) {
  const { data, error } = await adminSupabase().from('leocode_entitlements')
    .select('status,started_at,expires_at')
    .eq('user_id', userId)
    .eq('entitlement_type', 'founders_early_access')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error?.code === '42P01' || error?.code === 'PGRST205') {
    console.warn('LeoCode entitlement schema is unavailable; Founders access remains disabled until its migration is applied.', {
      userId,
      code: error.code,
    });
    return null;
  }
  if (error) throw error;
  if (!data || data.status !== 'active' || new Date(data.expires_at) <= new Date()) return null;
  return data;
}

export async function enforceLeoCodeDailyQuota(userId: string) {
  const entitlement = await getActiveLeoCodeEntitlement(userId);
  if (!entitlement) return { entitlement: null, response: null };
  const response = await enforceUserRateLimit(
    userId,
    'leocode-daily-usage',
    LEOCODE_DAILY_REQUEST_LIMIT,
    LEOCODE_DAILY_WINDOW_SECONDS,
  );
  return { entitlement, response };
}
