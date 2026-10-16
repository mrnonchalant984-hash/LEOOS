export type PageSpeedStrategy = 'mobile' | 'desktop';

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}

export class PageSpeedInsightsError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 502) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function buildPageSpeedRequestUrl(targetUrl: string, strategy: PageSpeedStrategy, apiKey?: string) {
  const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  endpoint.searchParams.set('url', targetUrl);
  endpoint.searchParams.set('strategy', strategy);
  for (const category of ['performance', 'accessibility', 'best-practices', 'seo']) {
    endpoint.searchParams.append('category', category);
  }
  if (apiKey) endpoint.searchParams.set('key', apiKey);
  return endpoint;
}

export function normalizePageSpeedResponse(payload: unknown, strategy: PageSpeedStrategy) {
  const root = asObject(payload);
  const lighthouse = asObject(root?.lighthouseResult);
  const categories = asObject(lighthouse?.categories);
  const audits = asObject(lighthouse?.audits);
  if (!lighthouse || !categories || !audits) {
    throw new PageSpeedInsightsError('Google PageSpeed Insights returned an incomplete Lighthouse report.');
  }

  const score = (id: string) => {
    const category = asObject(categories[id]);
    const value = category?.score;
    return typeof value === 'number' ? Math.round(value * 100) : null;
  };
  const metric = (id: string, label: string) => {
    const item = asObject(audits[id]);
    return item ? {
      id,
      label,
      value: typeof item.displayValue === 'string' ? item.displayValue : 'Not available',
      score: typeof item.score === 'number' ? item.score : null,
    } : null;
  };
  const metrics = [
    metric('first-contentful-paint', 'First contentful paint'),
    metric('largest-contentful-paint', 'Largest contentful paint'),
    metric('speed-index', 'Speed index'),
    metric('total-blocking-time', 'Total blocking time'),
    metric('cumulative-layout-shift', 'Cumulative layout shift'),
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  const recommendations = Object.entries(audits)
    .flatMap(([id, value]) => {
      const audit = asObject(value);
      const details = asObject(audit?.details);
      if (!audit || !details || details.type !== 'opportunity' ||
          typeof audit.score !== 'number' || audit.score >= 0.9 ||
          typeof audit.title !== 'string') return [];
      return [{
        id,
        title: audit.title,
        description: typeof audit.description === 'string' ? audit.description.replace(/<[^>]+>/g, '').slice(0, 320) : '',
        savings: typeof audit.displayValue === 'string' ? audit.displayValue : '',
      }];
    })
    .slice(0, 5);

  return {
    strategy,
    fetchedAt: new Date().toISOString(),
    lighthouseVersion: typeof lighthouse.lighthouseVersion === 'string' ? lighthouse.lighthouseVersion : null,
    scores: {
      performance: score('performance'),
      accessibility: score('accessibility'),
      bestPractices: score('best-practices'),
      seo: score('seo'),
    },
    metrics,
    recommendations,
  };
}

export async function runPageSpeedAudit(targetUrl: string, strategy: PageSpeedStrategy, apiKey?: string) {
  const endpoint = buildPageSpeedRequestUrl(targetUrl, strategy, apiKey);
  let response: Response;
  try {
    response = await fetch(endpoint, { cache: 'no-store', signal: AbortSignal.timeout(90_000) });
  } catch (cause) {
    throw new PageSpeedInsightsError(cause instanceof Error && cause.name === 'TimeoutError'
      ? 'Google PageSpeed Insights did not finish in time. Try again shortly.'
      : 'Google PageSpeed Insights could not be reached.');
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const status = response.status === 429 || response.status === 403 ? 503 : 502;
    throw new PageSpeedInsightsError(
      status === 503
        ? 'Google PageSpeed Insights is rate-limited or its API key is not configured. Configure PAGESPEED_INSIGHTS_API_KEY and retry.'
        : 'Google PageSpeed Insights could not complete this Lighthouse audit.',
      status,
    );
  }
  return normalizePageSpeedResponse(payload, strategy);
}
