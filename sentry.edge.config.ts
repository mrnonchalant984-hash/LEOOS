import * as Sentry from '@sentry/nextjs';
import { parseSampleRate, sanitizeSentryBreadcrumb, sanitizeSentryEvent, sanitizeSentrySpan } from '@/lib/monitoring-utils';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.VERCEL_ENV || process.env.NODE_ENV || 'production',
    release: process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_SENTRY_RELEASE,
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
    tracesSampleRate: parseSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE),
    maxBreadcrumbs: 20,
    beforeSend: sanitizeSentryEvent,
    beforeSendSpan: sanitizeSentrySpan,
    beforeBreadcrumb: sanitizeSentryBreadcrumb,
  });
}
