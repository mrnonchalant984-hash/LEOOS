export type MonitoringProvider = 'openai' | 'supabase' | 'paystack' | 'vercel' | 'github';
export type MonitoringOperation = 'leo.ai.request' | 'agent.run' | 'project.build_deploy' | 'payment.verify' | 'payment.webhook';
export type MonitoringOutcome = 'success' | 'rejected' | 'failure';

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as UnknownRecord : null;
}

export function correlationId(candidate: string | null | undefined): string {
  return candidate && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate.toLowerCase()
    : globalThis.crypto.randomUUID();
}

export function parseSampleRate(value: string | undefined, fallback = 0.05): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

const EXPECTED_PAYMENT_REJECTIONS = new Set([
  'Payment reference is invalid',
  'Paystack has not confirmed a successful payment.',
  'Payment could not be verified.',
  'Verified payment reference does not match.',
  'Payment reference is not registered.',
  'Verified amount does not match the registered purchase.',
  'Verified currency does not match the registered purchase.',
  'Verified payment owner does not match the registered purchase.',
  'Verified plan does not match the registered purchase.',
  'Verified billing period does not match the registered purchase.',
]);

export function isExpectedPaymentRejection(error: unknown): boolean {
  return error instanceof Error && EXPECTED_PAYMENT_REJECTIONS.has(error.message);
}

function safePath(value: string): string {
  let pathname = value;
  try {
    pathname = new URL(value, 'https://monitoring.invalid').pathname;
  } catch {
    pathname = value.split(/[?#]/, 1)[0];
  }
  return pathname
    .replace(/(\/(?:ide|projects|workspaces|templates|deployments|webhooks|organizations|dashboard\/websites)\/)[^/]+/gi, '$1:id')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, ':id')
    .slice(0, 240);
}

export function sanitizeVercelPageEvent<T extends { url: string }>(event: T): T | null {
  try {
    const url = new URL(event.url);
    url.pathname = safePath(url.pathname);
    url.search = '';
    url.hash = '';
    const route = 'route' in event && typeof event.route === 'string' ? safePath(event.route) : undefined;
    return { ...event, url: url.toString(), ...(route ? { route } : {}) };
  } catch {
    return null;
  }
}

function filterAttributes(value: unknown): UnknownRecord | undefined {
  const attributes = asRecord(value);
  if (!attributes) return undefined;
  const allowed = new Set([
    'http.request.method',
    'http.response.status_code',
    'http.request.body.size',
    'http.response.body.size',
    'http.route',
    'server.address',
    'server.port',
    'url.scheme',
    'network.protocol.version',
    'sentry.op',
    'sentry.origin',
    'sentry.source',
    'sentry.sample_rate',
    'db.system.name',
    'db.operation.name',
  ]);
  const safe: UnknownRecord = {};
  for (const [key, item] of Object.entries(attributes)) {
    if (!allowed.has(key)) continue;
    if (typeof item === 'string') safe[key] = key === 'http.route' ? safePath(item) : item.slice(0, 80);
    else if (typeof item === 'number' || typeof item === 'boolean') safe[key] = item;
  }
  return safe;
}

export function sanitizeSentryBreadcrumb(breadcrumb: { category?: string; data?: unknown }) {
  if (breadcrumb.category !== 'navigation') return null;
  const source = asRecord(breadcrumb.data);
  const data: UnknownRecord = {};
  if (source) {
    for (const key of ['from', 'to', 'url']) {
      if (typeof source[key] === 'string') data[key] = safePath(source[key] as string);
    }
  }
  return { category: 'navigation' as const, ...(Object.keys(data).length ? { data } : {}) };
}

export function sanitizeSentrySpan<T>(input: T): T {
  const span = asRecord(input);
  if (!span) return input;
  const data = filterAttributes(span.data);
  if (data) span.data = data;
  else delete span.data;
  if (typeof span.description === 'string') {
    const description = span.description;
    span.description = /^(GET|POST|PUT|PATCH|DELETE|HEAD) \/(?:api|app)\/[A-Za-z0-9_./:[\]-]{0,140}$/i.test(description)
      ? description.replace(/(\/(?:ide|projects|workspaces|templates|deployments|webhooks|organizations)\/)[^/\s]+/gi, '$1:id').slice(0, 180)
      : 'operation details redacted';
  }
  return input;
}

/** Mutates a Sentry event in place to retain stack/release/route context without user payloads. */
export function sanitizeSentryEvent<T>(input: T): T {
  const event = asRecord(input);
  if (!event) return input;

  delete event.user;
  delete event.message;
  delete event.logentry;
  delete event.extra;
  delete event.server_name;

  if (typeof event.transaction === 'string') event.transaction = safePath(event.transaction);
  if (typeof event.culprit === 'string') event.culprit = safePath(event.culprit);

  const request = asRecord(event.request);
  if (request) {
    if (typeof request.url === 'string') request.url = safePath(request.url);
    delete request.headers;
    delete request.cookies;
    delete request.data;
    delete request.query_string;
    delete request.env;
    delete request.other;
    delete request.fragment;
  }

  const tags = asRecord(event.tags);
  if (tags) {
    const allowed = new Set(['operation', 'provider', 'request_id', 'status_code', 'outcome', 'route']);
    const safeTags: UnknownRecord = {};
    for (const [key, value] of Object.entries(tags)) {
      if (!allowed.has(key)) continue;
      if (key === 'request_id' && typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) safeTags[key] = value;
      else if (key === 'route' && typeof value === 'string') safeTags[key] = safePath(value);
      else if (['operation', 'provider', 'outcome'].includes(key) && typeof value === 'string' && /^[A-Za-z0-9._:-]{1,80}$/.test(value)) safeTags[key] = value;
      else if (key === 'status_code' && typeof value === 'number' && Number.isInteger(value)) safeTags[key] = value;
    }
    event.tags = safeTags;
  }

  const contexts = asRecord(event.contexts);
  if (contexts) {
    const safeTrace = filterAttributes(contexts.trace);
    const safeRuntime = filterAttributes(contexts.runtime);
    event.contexts = {
      ...(safeTrace ? { trace: safeTrace } : {}),
      ...(safeRuntime ? { runtime: safeRuntime } : {}),
    };
  }

  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs.flatMap(item => {
      const crumb = asRecord(item);
      const safe = crumb ? sanitizeSentryBreadcrumb({ category: String(crumb.category || ''), data: crumb.data }) : null;
      return safe ? [safe] : [];
    });
  }

  const exception = asRecord(event.exception);
  if (exception && Array.isArray(exception.values)) {
    for (const item of exception.values) {
      const value = asRecord(item);
      if (!value) continue;
      const errorType = typeof value.type === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,39}$/.test(value.type) ? value.type : 'Error';
      value.value = `${errorType} (details redacted)`;
      const stacktrace = asRecord(value.stacktrace);
      if (stacktrace && Array.isArray(stacktrace.frames)) {
        for (const frameItem of stacktrace.frames) {
          const frame = asRecord(frameItem);
          if (!frame) continue;
          delete frame.vars;
          delete frame.pre_context;
          delete frame.post_context;
          delete frame.context_line;
        }
      }
    }
  }

  if (Array.isArray(event.spans)) {
    event.spans = event.spans.map(span => sanitizeSentrySpan(span));
  }

  return input;
}
