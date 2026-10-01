import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';
import { createHostingExpiredDeployment, promoteVercelDeployment } from '@/lib/vercel-hosting';
import crypto from 'node:crypto';

export const runtime = 'nodejs';

function renewalToken(hostingId: string) { const secret=process.env.CRON_SECRET || process.env.PAYSTACK_SECRET_KEY || ''; return crypto.createHmac('sha256',secret).update(hostingId).digest('hex'); }

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get('authorization') === `Bearer ${secret}`;
}

async function sendReminder(to: string, days: number) {
  if (!process.env.RESEND_API_KEY || !process.env.CONTACT_FROM_EMAIL) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.CONTACT_FROM_EMAIL,
      to: [to],
      subject: `Hosting renews in ${days} day${days === 1 ? '' : 's'}`,
      html: `<p>Your hosted website is due for renewal in ${days} day${days === 1 ? '' : 's'}.</p><p>Renew before the expiration date to keep the website online.</p>`,
    }),
  });
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = adminSupabase();
  const now = new Date();
  const soon = new Date(now);
  soon.setDate(soon.getDate() + 7);
  const { data: items, error } = await db.from('hosting_subscriptions')
    .select('id,status,ends_at,client_email,website_project_id,website_projects(business_name,custom_domain,live_url,vercel_project_id,live_deployment_id,suspended_deployment_id,hosting_enforcement_status)')
    .in('status', ['trial', 'active'])
    .lte('ends_at', soon.toISOString());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let reminders = 0;
  let suspended = 0;
  let restored = 0;
  for (const h of items || []) {
    const end = new Date(h.ends_at);
    const site = Array.isArray(h.website_projects) ? h.website_projects[0] : h.website_projects;
    if (end <= now) {
      if (site?.vercel_project_id && process.env.LEO_HOSTING_ENFORCEMENT !== 'false') {
        try {
          const maintenance = await createHostingExpiredDeployment(
            String(site.vercel_project_id),
            String(site.business_name || 'Website'),
            `${process.env.NEXT_PUBLIC_SITE_URL || ''}/payment/hosting-renewal?hosting_id=${encodeURIComponent(h.id)}&token=${renewalToken(h.id)}`,
          );
          const maintenanceId = String(maintenance.id || maintenance.uid || '');
          if (maintenanceId) {
            await promoteVercelDeployment(String(site.vercel_project_id), maintenanceId);
            await db.from('website_projects').update({
              status: 'suspended',
              hosting_enforcement_status: 'suspended',
              suspended_deployment_id: maintenanceId,
              updated_at: now.toISOString(),
            }).eq('id', h.website_project_id);
            await db.from('deployment_events').insert({
              website_project_id: h.website_project_id,
              event_type: 'hosting_expired',
              status: 'success',
              message: 'Hosting expired; Vercel production traffic was switched to the renewal page automatically.',
              metadata: { maintenanceDeploymentId: maintenanceId, previousDeploymentId: site.live_deployment_id },
            });
            suspended++;
          }
        } catch (e) {
          await db.from('deployment_events').insert({ website_project_id: h.website_project_id, event_type: 'hosting_expired', status: 'error', message: e instanceof Error ? e.message : 'Hosting enforcement failed' });
        }
      }
      await db.from('hosting_subscriptions').update({ status: 'expired', updated_at: now.toISOString() }).eq('id', h.id);
      continue;
    }
    if (!h.client_email) continue;
    const days = Math.ceil((end.getTime() - now.getTime()) / 86400000);
    if (days <= 7) {
      reminders++;
      await sendReminder(h.client_email, days).catch(() => {});
    }
  }
  return NextResponse.json({ checked: items?.length || 0, reminders, suspended, restored, at: now.toISOString() });
}
