import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { getProfile, isPlatformOwner, adminSupabase } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { queueGitHubRuntimeJob } from '@/lib/runtime/github-actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const MAX_TASK = 4000;

function allowedHosts(value: unknown, startHost: string): string[] {
  if (!Array.isArray(value) || value.length > 19) return [startHost];
  const hosts = [...new Set(value.map(v => String(v).trim().toLowerCase()).filter(Boolean))];
  if (hosts.some(host => host.length > 253 || !/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/.test(host))) {
    throw new Error('Allowed browser hosts must be exact public DNS hostnames.');
  }
  return [...new Set([startHost, ...hosts])];
}

export async function POST(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  if (!isPlatformOwner(ctx.profile)) return NextResponse.json({ error: 'Bram computer use is owner-only.' }, { status: 403 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'bram-computer-use', 5, 3600);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const task = typeof body?.task === 'string' ? body.task.trim() : '';
  const rawUrl = typeof body?.url === 'string' ? body.url.trim() : '';
  if (!task || task.length > MAX_TASK) return NextResponse.json({ error: 'A task of 1–4,000 characters is required.' }, { status: 400 });

  let url: URL;
  try { url = new URL(rawUrl); } catch { return NextResponse.json({ error: 'A valid starting URL is required.' }, { status: 400 }); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.hostname === 'localhost' || url.hostname.endsWith('.local') || url.hostname.endsWith('.internal') ||
      /^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname) || url.hostname.includes(':')) {
    return NextResponse.json({ error: 'The starting URL must use a public DNS hostname.' }, { status: 400 });
  }

  let domains: string[];
  try { domains = allowedHosts(body?.allowedDomains, url.hostname.toLowerCase()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid allowed host list.' }, { status: 400 }); }

  try {
    const zip = new JSZip();
    zip.file('runtime-metadata.json', JSON.stringify({ task, url: url.href, allowedDomains: domains }));
    const archive = Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 5 } }));
    const job = await queueGitHubRuntimeJob({
      userId: ctx.user.id,
      kind: 'browser',
      operation: 'computer_use',
      archive,
      metadata: { source: 'bram_computer_use', url_host: url.hostname, task_summary: task.slice(0, 160) },
    });
    try {
      await adminSupabase().from('agent_execution_events').insert({
        user_id: ctx.user.id,
        agent_id: 'bram',
        event_type: 'computer_use_queued',
        status: 'queued',
        metadata: { runtime_job_id: job.job_id, url_host: url.hostname, provider: 'github_actions' },
      });
    } catch {
      // Queueing the runtime job is authoritative; diagnostics must not fail the request.
    }
    return NextResponse.json({
      ...job,
      status: 'queued',
      poll_url: '/api/runtime/jobs/' + job.job_id,
      message: 'Bram browser task was queued on a temporary GitHub-hosted runner. Poll the job URL for its result.',
    }, { status: 202, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Browser task could not be queued.' }, { status: 503 });
  }
}

export async function PUT(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  if (!isPlatformOwner(ctx.profile)) return NextResponse.json({ error: 'Bram computer use is owner-only.' }, { status: 403 });
  return NextResponse.json({
    error: 'Interactive browser approval is not available in the GitHub Actions runtime yet. Sensitive actions are blocked rather than executed.',
  }, { status: 409 });
}
