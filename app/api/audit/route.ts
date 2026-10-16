import { NextRequest, NextResponse } from 'next/server';
import { getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { fetchPublicHtml, PublicSiteFetchError } from '@/lib/public-site-fetch';
import { PageSpeedInsightsError, runPageSpeedAudit } from '@/lib/page-speed-insights';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in to audit a website.' }, { status: 401 });

  const contentLength = Number(req.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > 4096) {
    return NextResponse.json({ error: 'The request is too large.' }, { status: 413 });
  }

  const limited = await enforceUserRateLimit(ctx.user.id, 'website-audit', 5, 60);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const rawUrl = typeof body?.url === 'string' ? body.url.trim() : '';
  if (!rawUrl) return NextResponse.json({ error: 'Enter a website URL.' }, { status: 400 });

  try {
    const result = await fetchPublicHtml(rawUrl);
    const [mobile, desktop] = await Promise.all([
      runPageSpeedAudit(result.url, 'mobile', process.env.PAGESPEED_INSIGHTS_API_KEY),
      runPageSpeedAudit(result.url, 'desktop', process.env.PAGESPEED_INSIGHTS_API_KEY),
    ]);
    const { html, headers } = result;
    const findings: string[] = [];
    const headerChecks: Array<[string, string]> = [
      ['Content-Security-Policy', 'CSP'],
      ['Strict-Transport-Security', 'HSTS'],
      ['X-Content-Type-Options', 'X-Content-Type-Options'],
      ['Referrer-Policy', 'Referrer-Policy'],
    ];
    for (const [name, label] of headerChecks) {
      if (!headers[name.toLowerCase()]) findings.push(`Missing ${label} response header.`);
    }

    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim().slice(0, 160);
    const scripts = (html.match(/<script\b/gi) || []).length;
    const images = (html.match(/<img\b/gi) || []).length;
    const insecure = (html.match(/http:\/\//gi) || []).length;
    const forms = (html.match(/<form\b/gi) || []).length;
    const risky = (html.match(/(?:eval\s*\(|document\.write\s*\(|innerHTML\s*=)/gi) || []).length;

    return NextResponse.json({
      ok: true,
      url: result.url,
      status: result.status,
      title,
      metrics: { scripts, images, forms, insecureReferences: insecure },
      security: { https: new URL(result.url).protocol === 'https:', riskyPatterns: risky, findings },
      lighthouse: { provider: 'Google PageSpeed Insights', mobile, desktop },
      note: 'Performance, accessibility, best-practices, and SEO scores are from Google Lighthouse. Security checks are heuristics, not a penetration test or malware scan.',
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof PageSpeedInsightsError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode, headers: { 'Cache-Control': 'no-store' } });
    }
    const status = error instanceof PublicSiteFetchError ? error.statusCode : 502;
    const message = error instanceof PublicSiteFetchError ? error.message : 'The website could not be audited.';
    return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
