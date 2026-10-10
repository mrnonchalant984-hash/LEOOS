import * as Sentry from '@sentry/nextjs';
import { parseSampleRate, sanitizeSentryBreadcrumb, sanitizeSentryEvent, sanitizeSentrySpan } from '@/lib/monitoring-utils';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'production',
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      frameContextLines: 0,
    },
    autoSessionTracking: false,
    tracesSampleRate: parseSampleRate(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE),
    maxBreadcrumbs: 20,
    beforeSend: sanitizeSentryEvent,
    beforeSendSpan: sanitizeSentrySpan,
    beforeBreadcrumb: sanitizeSentryBreadcrumb,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
