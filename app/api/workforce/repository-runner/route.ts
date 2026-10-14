import { createHmac, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const operations = new Set(['inspect', 'apply_patch', 'install', 'test', 'typecheck', 'lint', 'build', 'git_status', 'git_diff', 'git_log', 'git_branch', 'git_commit']);

export async function POST(req: NextRequest) {
  const ctx = await requireOwner(req);
  if (!ctx) return NextResponse.json({ error: 'Platform-owner authentication required.' }, { status: 403 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'repository-runner', 10, 3600);
  if (limited) return limited;
  const endpoint = process.env.REPOSITORY_RUNNER_URL?.trim();
  const secret = process.env.RUNNER_HMAC_SECRET || '';
  if (!endpoint || secret.length < 32) return NextResponse.json({ error: 'The isolated runner service is not configured.' }, { status: 503 });
  let url: URL;
  try { url = new URL(endpoint); } catch { return NextResponse.json({ error: 'Invalid runner endpoint configuration.' }, { status: 503 }); }
  if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.hostname === 'localhost')) return NextResponse.json({ error: 'The runner endpoint must use HTTPS in production.' }, { status: 503 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body) || !operations.has(String(body.operation))) return NextResponse.json({ error: 'Unsupported repository operation.' }, { status: 400 });
  const hasArchive = typeof body.workspace_zip_base64 === 'string' && body.workspace_zip_base64.length > 0 && body.workspace_zip_base64.length <= 5_500_000;
  const hasWorkspace = typeof body.workspace_id === 'string' && /^[a-f0-9-]{36}$/.test(body.workspace_id);
  const hasRepository = typeof body.repository === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(body.repository);
  if (!hasArchive && !hasWorkspace && !hasRepository) return NextResponse.json({ error: 'Provide a bounded workspace ZIP, a valid existing workspace ID, or an allowlisted repository slug.' }, { status: 400 });
  if (hasArchive && (body.workspace_zip_base64 as string).length > 5_500_000) return NextResponse.json({ error: 'Workspace ZIP exceeds the request limit.' }, { status: 400 });
  const jobId = randomUUID();
  const payload = JSON.stringify({ job_id: jobId, operation: body.operation, ...(hasArchive ? { workspace_zip_base64: body.workspace_zip_base64 } : {}), ...(hasWorkspace ? { workspace_id: body.workspace_id } : {}), ...(hasRepository ? { repository: body.repository } : {}), ...(typeof body.patch === 'string' ? { patch: body.patch } : {}), ...(typeof body.branch === 'string' ? { branch: body.branch } : {}), ...(typeof body.commit_message === 'string' ? { commit_message: body.commit_message } : {}) });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  try {
    const response = await fetch(new URL('/v1/jobs', url), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Runner-Timestamp': timestamp, 'X-Runner-Signature': signature }, body: payload, signal: AbortSignal.timeout(640_000), cache: 'no-store' });
    const result = await response.json().catch(() => ({}));
    return NextResponse.json(result, { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'The isolated runner is unavailable or timed out. No success is assumed.' }, { status: 502 });
  }
}
