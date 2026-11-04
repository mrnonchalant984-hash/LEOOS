import { NextRequest, NextResponse } from 'next/server';
import { requireOwner, adminSupabase } from '@/lib/auth';
import { createInvitationCode, validateInvitationBatch } from '@/lib/leocode-access';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

async function authorizedOwner(req: NextRequest) {
  const context = await requireOwner(req);
  if (!context) return { response: NextResponse.json({ error: 'Verified owner access is required.' }, { status: 403 }) };
  if (!context.profile.twofa_verified) {
    return { response: NextResponse.json({ error: 'Complete owner authenticator setup before managing invitations.' }, { status: 403 }) };
  }
  return { context };
}

function originIsAllowed(req: NextRequest) {
  const origin = req.headers.get('origin');
  return !origin || origin === req.nextUrl.origin;
}

export async function GET(req: NextRequest) {
  const access = await authorizedOwner(req);
  if (access.response) return access.response;
  const view = req.nextUrl.searchParams.get('view') === 'participants' ? 'participants' : 'codes';
  const page = Math.max(1, Math.min(10_000, Math.trunc(Number(req.nextUrl.searchParams.get('page')) || 1)));
  const pageSize = 100;
  const rangeFrom = (page - 1) * pageSize;
  const db = adminSupabase();

  if (view === 'participants') {
    const search = (req.nextUrl.searchParams.get('q') || '').replace(/[%_*]/g, '').trim().slice(0, 100);
    let query = db.from('leocode_waitlist')
      .select('id,user_id,full_name,email,status,invitation_code_id,created_at', { count: 'exact' })
      .order('created_at', { ascending: false }).range(rangeFrom, rangeFrom + pageSize - 1);
    if (search) query = query.ilike('email', `%${search}%`);
    const { data, error, count } = await query;
    if (error) {
      console.error('LeoCode participant list failed', { error: error.message });
      return NextResponse.json({ error: 'Participant records could not be loaded.' }, { status: 503 });
    }
    const total = Number(count || 0);
    return NextResponse.json({ rows: data || [], page, total, hasMore: rangeFrom + (data?.length || 0) < total }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const { data, error, count } = await db.from('leocode_invitation_codes')
    .select('id,status,max_redemptions,redemption_count,expires_at,created_at', { count: 'exact' })
    .order('created_at', { ascending: false }).range(rangeFrom, rangeFrom + pageSize - 1);
  if (error) {
    console.error('LeoCode invitation list failed', { error: error.message });
    return NextResponse.json({ error: 'Invitation records could not be loaded.' }, { status: 503 });
  }
  const total = Number(count || 0);
  return NextResponse.json({ rows: data || [], page, total, hasMore: rangeFrom + (data?.length || 0) < total }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  if (!originIsAllowed(req)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const access = await authorizedOwner(req);
  if (access.response) return access.response;
  const limited = await enforceUserRateLimit(access.context!.user.id, 'leocode-invitation-generate', 10, 3600);
  if (limited) return limited;
  const body: unknown = await req.json().catch(() => null);
  const batch = validateInvitationBatch(body);
  if (!batch) return NextResponse.json({ error: 'Provide a future expiry date, 1–100 codes, and a redemption limit from 1–1000.' }, { status: 400 });

  const codes = Array.from({ length: batch.count }, createInvitationCode);
  const { data, error } = await adminSupabase().from('leocode_invitation_codes').insert(codes.map(({ codeHash }) => ({
    code_hash: codeHash,
    max_redemptions: batch.maxRedemptions,
    expires_at: batch.expiresAt,
    created_by: access.context!.user.id,
  }))).select('id');
  if (error || !data || data.length !== codes.length) {
    console.error('LeoCode invitation generation failed', { error: error?.message });
    return NextResponse.json({ error: 'Invitation codes could not be generated.' }, { status: 503 });
  }
  return NextResponse.json({ codes: codes.map(({ code }) => code) }, {
    status: 201,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function PATCH(req: NextRequest) {
  if (!originIsAllowed(req)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const access = await authorizedOwner(req);
  if (access.response) return access.response;
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid invitation update.' }, { status: 400 });
  const values = body as Record<string, unknown>;
  if (typeof values.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(values.id)
    || !['active', 'inactive'].includes(String(values.status))) {
    return NextResponse.json({ error: 'Choose a valid invitation and status.' }, { status: 400 });
  }
  if (values.status === 'active') {
    const { data: invitation, error: lookupError } = await adminSupabase().from('leocode_invitation_codes')
      .select('redemption_count,max_redemptions,expires_at').eq('id', values.id).maybeSingle();
    if (lookupError) {
      console.error('LeoCode invitation reactivation check failed', { error: lookupError.message });
      return NextResponse.json({ error: 'Invitation status could not be verified.' }, { status: 503 });
    }
    if (!invitation) return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 });
    if (new Date(invitation.expires_at) <= new Date() || invitation.redemption_count >= invitation.max_redemptions) {
      return NextResponse.json({ error: 'Expired or fully redeemed invitations cannot be reactivated.' }, { status: 409 });
    }
  }
  const { data, error } = await adminSupabase().from('leocode_invitation_codes')
    .update({ status: values.status }).eq('id', values.id)
    .select('id,status').maybeSingle();
  if (error) {
    console.error('LeoCode invitation update failed', { error: error.message });
    return NextResponse.json({ error: 'Invitation status could not be updated.' }, { status: 503 });
  }
  if (!data) return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 });
  return NextResponse.json({ code: data }, { headers: { 'Cache-Control': 'no-store' } });
}
