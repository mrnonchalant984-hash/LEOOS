import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { createRunwayVideo, getRunwayVideo } from '@/lib/agents/runway-video';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function safePublicImage(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || !host.includes('.') || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) return null;
    return url.toString();
  } catch { return null; }
}
export async function POST(req: NextRequest) {
  const auth = await requireOwner(req);
  if (!auth) return NextResponse.json({ error: 'Platform-owner authentication required.' }, { status: 403 });
  const limited = await enforceUserRateLimit(auth.user.id, 'workforce-avatar-video', 3, 3600);
  if (limited) return limited;
  if (!process.env.RUNWAYML_API_SECRET) return NextResponse.json({ error: 'Video avatar provider is not configured.' }, { status: 503 });
  const body = await req.json().catch(() => null);
  const imageUrl = safePublicImage(body?.image_url);
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  if (!imageUrl || prompt.length < 3 || prompt.length > 1000) return NextResponse.json({ error: 'Provide a public HTTPS avatar image URL and a prompt of 3–1,000 characters.' }, { status: 400 });
  try {
    const result = await createRunwayVideo({ prompt: `Animate this professional AI avatar subtly for a meeting profile. Preserve the person's identity and clothing; natural blinking and small head movements only. ${prompt}`, imageUrl, duration: 5, ratio: '1280:768' });
    return NextResponse.json({ ...result, message: 'Video generation has been requested; this is a generated clip, not a live interactive video avatar.' }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Avatar video generation could not be started.' }, { status: 502 });
  }
}
export async function GET(req: NextRequest) {
  const auth = await requireOwner(req);
  if (!auth) return NextResponse.json({ error: 'Platform-owner authentication required.' }, { status: 403 });
  const limited = await enforceUserRateLimit(auth.user.id, 'workforce-avatar-status', 60, 3600);
  if (limited) return limited;
  const taskId = req.nextUrl.searchParams.get('task_id') || '';
  if (!/^[a-zA-Z0-9_-]{6,120}$/.test(taskId)) return NextResponse.json({ error: 'A valid provider task ID is required.' }, { status: 400 });
  try { return NextResponse.json(await getRunwayVideo(taskId, undefined, auth.user.id), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ error: 'Avatar video status could not be retrieved.' }, { status: 502 }); }
}
