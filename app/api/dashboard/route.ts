import { NextRequest, NextResponse } from 'next/server';
import { getProfile, adminSupabase } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Login required' }, { status: 401 });

  const db = adminSupabase();
  const userId = ctx.user.id;
  const [subscriptionResult, creditResult, chatsResult, chatsCountResult, memoriesResult, projectsResult, projectsCountResult, websitesResult, websitesCountResult, notificationsResult, notificationsCountResult] = await Promise.all([
    db.from('subscriptions').select('plan,billing_period,status,ends_at,created_at').eq('user_id', userId).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('credits').select('credits_remaining').eq('user_id', userId),
    db.from('chats_v2').select('id,title,updated_at').eq('user_id', userId).order('updated_at', { ascending: false }).limit(5),
    db.from('chats_v2').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    db.from('leo_memories').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('active', true),
    db.from('projects').select('id,project_name,type,status,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(5),
    db.from('projects').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    db.from('website_projects').select('id,business_name,website_type,status,live_url,updated_at').eq('owner_user_id', userId).order('updated_at', { ascending: false }).limit(5),
    db.from('website_projects').select('id', { count: 'exact', head: true }).eq('owner_user_id', userId),
    db.from('notifications').select('id,title,body,created_at').eq('user_id', userId).eq('read', false).order('created_at', { ascending: false }).limit(5),
    db.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('read', false),
  ]);

  const firstError = [subscriptionResult, creditResult, chatsResult, chatsCountResult, memoriesResult, projectsResult, projectsCountResult, websitesResult, websitesCountResult, notificationsResult, notificationsCountResult].find(result => result.error);
  if (firstError?.error) return NextResponse.json({ error: 'Dashboard data could not be loaded.' }, { status: 500 });

  const isOwner = ctx.profile.role === 'owner' && ctx.profile.email?.toLowerCase() === (process.env.OWNER_EMAIL || 'leonardudoh5@gmail.com').toLowerCase();
  const credits = (creditResult.data || []).reduce((sum, row) => sum + Number(row.credits_remaining || 0), 0);

  return NextResponse.json({
    user: { name: ctx.profile.full_name || ctx.user.user_metadata?.full_name || ctx.user.email?.split('@')[0] || 'there', email: ctx.user.email },
    plan: isOwner ? 'OWNER' : subscriptionResult.data?.plan?.toUpperCase() || 'FREE',
    status: isOwner ? 'owner' : subscriptionResult.data?.status || 'free',
    billingPeriod: subscriptionResult.data?.billing_period || null,
    credits: isOwner ? 'Unlimited' : credits,
    counts: {
      conversations: chatsCountResult.count || 0,
      memories: memoriesResult.count || 0,
      projects: projectsCountResult.count || 0,
      websites: websitesCountResult.count || 0,
      unreadNotifications: notificationsCountResult.count || 0,
    },
    conversations: chatsResult.data || [],
    projects: projectsResult.data || [],
    websites: websitesResult.data || [],
    notifications: notificationsResult.data || [],
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
