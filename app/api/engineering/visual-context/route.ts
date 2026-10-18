import { NextRequest, NextResponse } from 'next/server';
import { getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { sanitizeVisualContext, distinguishArtifactKind } from '@/lib/agent-visual-context';

export const runtime = 'nodejs';

/**
 * Accepts structured visual context for agents.
 * Screenshot payloads are rejected here to avoid accidental secret exfiltration;
 * clients should pass sanitized DOM/a11y/layout data or use a separate approved capture path.
 */
export async function POST(request: NextRequest) {
  const auth = await getProfile(request);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const limited = await enforceUserRateLimit(auth.user.id, 'engineering-visual-context', 40, 60);
  if (limited) return limited;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Send a valid JSON body.' }, { status: 400 });
  }

  if (typeof body.screenshotDataUrl === 'string' || typeof body.screenshotBase64 === 'string') {
    return NextResponse.json({
      error: 'Raw screenshot payloads are not accepted on this endpoint. Provide sanitized structured context, or use an approved capture path that strips secrets.',
    }, { status: 400 });
  }

  const route = typeof body.route === 'string' ? body.route : '/';
  const context = sanitizeVisualContext({
    route,
    viewport: body.viewport && typeof body.viewport === 'object'
      ? {
        width: Number((body.viewport as { width?: unknown }).width) || 1280,
        height: Number((body.viewport as { height?: unknown }).height) || 720,
      }
      : { width: 1280, height: 720 },
    screenshotAvailable: body.screenshotAvailable === true,
    screenshotKind: (['none', 'concept', 'implemented_ui', 'live_preview', 'production'].includes(String(body.screenshotKind))
      ? body.screenshotKind
      : 'none') as 'none' | 'concept' | 'implemented_ui' | 'live_preview' | 'production',
    componentHints: body.componentHints as string[] | undefined,
    consoleErrors: body.consoleErrors as string[] | undefined,
    networkFailures: body.networkFailures as string[] | undefined,
    accessibilityFindings: body.accessibilityFindings as string[] | undefined,
    visualRegression: body.visualRegression as { compared: boolean; differences: string[] } | undefined,
    relatedFiles: body.relatedFiles as string[] | undefined,
    recentChanges: body.recentChanges as string[] | undefined,
    notes: body.notes as string[] | undefined,
  });

  return NextResponse.json({
    context,
    artifactLabel: distinguishArtifactKind(context.screenshotKind),
    note: 'Structured visual context only. Secret-bearing captures must never be sent to the model.',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
