import { NextRequest, NextResponse } from 'next/server';
import { getProfile, adminSupabase } from '@/lib/auth';
import { summarizeUsage } from '@/lib/api-usage-core';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const { data, error } = await adminSupabase().from('api_usage').select('key_id,created_at')
    .eq('user_id', ctx.user.id).gte('created_at', since).order('created_at', { ascending: false }).limit(10000);
  if (error) return NextResponse.json({ error: 'Could not load usage' }, { status: 500 });
  return NextResponse.json(summarizeUsage(data || []));
}
