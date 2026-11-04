import { NextRequest, NextResponse } from 'next/server';
import { requireOwner, adminSupabase } from '@/lib/auth';

export const runtime = 'nodejs';

function dateBound(value: string | null, endOfDay = false) {
  if (!value) return null;
  const isDate = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = isDate ? new Date(`${value}T00:00:00.000Z`) : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  if (endOfDay && isDate) date.setUTCHours(23, 59, 59, 999);
  return date.toISOString();
}

export async function GET(req: NextRequest) {
  const context = await requireOwner(req);
  if (!context || !context.profile.twofa_verified) {
    return NextResponse.json({ error: 'Verified owner access with authenticator setup is required.' }, { status: 403 });
  }
  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');
  const page = Math.max(1, Math.min(10_000, Math.trunc(Number(req.nextUrl.searchParams.get('page')) || 1)));
  const limit = Math.min(100, Math.max(1, Math.trunc(Number(req.nextUrl.searchParams.get('limit')) || 100)));
  const fromBound = dateBound(from);
  const toBound = dateBound(to, true);
  if ((from && !fromBound) || (to && !toBound)) {
    return NextResponse.json({ error: 'Date filters must be valid ISO dates.' }, { status: 400 });
  }

  const db = adminSupabase();
  let query = db.from('donations')
    .select('id,user_id,supporter_name,email,amount,currency,transaction_reference,payment_status,paid_at,created_at', { count: 'exact' })
    .order('created_at', { ascending: false }).range((page - 1) * limit, page * limit - 1);
  if (fromBound) query = query.gte('created_at', fromBound);
  if (toBound) query = query.lte('created_at', toBound);
  const [{ data, error, count }, { data: summary, error: summaryError }] = await Promise.all([
    query,
    db.rpc('get_donation_admin_summary', {
      p_from: fromBound,
      p_to: toBound,
    }),
  ]);
  if (error || summaryError) {
    console.error('Donation administration query failed', { error: error?.message || summaryError?.message });
    return NextResponse.json({ error: 'Donation records could not be loaded.' }, { status: 503 });
  }
  const donations = data || [];
  const totals = Array.isArray(summary) ? summary[0] : summary;
  return NextResponse.json({
    donations,
    page,
    totalRecords: Number(count || 0),
    hasMore: page * limit < Number(count || 0),
    totalVerifiedNgn: Number(totals?.total_verified || 0),
    verifiedSupporters: Number(totals?.verified_supporters || 0),
    verifiedCount: Number(totals?.verified_count || 0),
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
