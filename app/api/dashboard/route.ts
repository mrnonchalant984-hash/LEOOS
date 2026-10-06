import { NextRequest, NextResponse } from 'next/server';
import { getProfile, adminSupabase } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Login required' }, { status: 401 });
  const db = adminSupabase();
  const userId = ctx.user.id;
  const [subscriptionResult, creditResult, chatsResult, chatsCountResult, memoriesResult, projectsResult, projectsCountResult, websitesResult, websitesCountResult, notificationsResult, notificationsCountResult, usageResult] = await Promise.all([
    db.from('subscriptions').select('plan,billing_period,status,ends_at,created_at').eq('user_id', userId).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('credits').select('credits_remaining,credits_used,feature').eq('user_id', userId),
    db.from('chats_v2').select('id,title,updated_at').eq('user_id', userId).order('updated_at', { ascending: false }).limit(5),
    db.from('chats_v2').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    db.from('leo_memories').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('active', true),
    db.from('projects').select('id,project_name,type,status,progress,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(5),
    db.from('projects').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    db.from('website_projects').select('id,business_name,website_type,status,live_url,updated_at,requirements').eq('owner_user_id', userId).order('updated_at', { ascending: false }).limit(5),
    db.from('website_projects').select('id', { count: 'exact', head: true }).eq('owner_user_id', userId),
    db.from('notifications').select('id,title,body,created_at,read').eq('user_id', userId).order('created_at', { ascending: false }).limit(5),
    db.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('read', false),
    db.from('ai_usage').select('feature,model,total_tokens,credits_used,created_at,metadata').eq('user_id', userId).order('created_at', { ascending: false }).limit(90),
  ]);
  const firstError = [subscriptionResult, creditResult, chatsResult, chatsCountResult, memoriesResult, projectsResult, projectsCountResult, websitesResult, websitesCountResult, notificationsResult, notificationsCountResult, usageResult].find(r => r.error);
  if (firstError?.error) return NextResponse.json({ error: 'Dashboard data could not be loaded.' }, { status: 500 });

  const displayName = [ctx.profile?.full_name, ctx.user.user_metadata?.full_name, ctx.user.user_metadata?.name, ctx.user.email?.split('@')[0], 'there']
    .map(v => typeof v === 'string' ? v.trim() : '').find(v => Boolean(v) && !/^user$/i.test(v)) || 'there';
  const isOwner = ctx.profile.role === 'owner' && ctx.profile.email?.toLowerCase() === (process.env.OWNER_EMAIL || 'leonardudoh5@gmail.com').toLowerCase();
  const credits = (creditResult.data || []).reduce((sum, row) => sum + Number(row.credits_remaining || 0), 0);
  const usage = usageResult.data || [];
  const usageByDay = new Map<string, number>();
  for (const row of usage) {
    const day = new Date(row.created_at).toISOString().slice(0, 10);
    usageByDay.set(day, (usageByDay.get(day) || 0) + Number(row.total_tokens || 0));
  }
  const usageTrend = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    return { date: key, tokens: usageByDay.get(key) || 0 };
  });

  const activity = [
    ...(usage.slice(0, 12).map(row => ({ id: `ai-${row.created_at}-${row.feature}`, kind: 'ai', title: row.feature === 'chat' ? 'Used Leo' : `Used ${row.feature.replaceAll('_', ' ')}`, created_at: row.created_at }))),
    ...((projectsResult.data || []).map(p => ({ id: `project-${p.id}`, kind: 'project', title: `${p.status === 'deployed' ? 'Deployed' : 'Updated'} project: ${p.project_name}`, created_at: p.created_at }))),
    ...((websitesResult.data || []).map(w => ({ id: `website-${w.id}`, kind: 'website', title: `${w.status === 'deployed' ? 'Deployed' : 'Updated'} website: ${w.business_name || w.website_type}`, created_at: w.updated_at }))),
    ...((notificationsResult.data || []).map(n => ({ id: `notification-${n.id}`, kind: 'account', title: n.title, created_at: n.created_at }))),
  ].sort((a,b) => +new Date(b.created_at) - +new Date(a.created_at)).slice(0, 8);

  return NextResponse.json({
    user: { name: displayName, email: ctx.user.email },
    owner: isOwner,
    plan: isOwner ? 'OWNER' : subscriptionResult.data?.plan?.toUpperCase() || 'FREE',
    status: isOwner ? 'owner' : subscriptionResult.data?.status || 'free',
    billingPeriod: subscriptionResult.data?.billing_period || null,
    endsAt: subscriptionResult.data?.ends_at || null,
    credits: isOwner ? 'Unlimited' : credits,
    counts: { conversations: chatsCountResult.count || 0, memories: memoriesResult.count || 0, projects: projectsCountResult.count || 0, websites: websitesCountResult.count || 0, unreadNotifications: notificationsCountResult.count || 0 },
    conversations: chatsResult.data || [], projects: projectsResult.data || [], websites: websitesResult.data || [],
    notifications: notificationsResult.data || [], activity, usageTrend,
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
