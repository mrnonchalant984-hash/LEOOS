import { NextRequest, NextResponse } from 'next/server';
import { requireOwner, adminSupabase } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const ctx = await requireOwner(req);
  if (!ctx || !ctx.profile.twofa_verified) {
    return NextResponse.json({ error: 'Owner 2FA access required' }, { status: 403 });
  }

  const db = adminSupabase();
  const { data, error } = await db
    .from('upgrade_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ jobs: data || [] });
}
