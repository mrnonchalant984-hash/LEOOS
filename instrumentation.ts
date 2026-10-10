import * as Sentry from '@sentry/nextjs';
import type { Instrumentation } from 'next';
import { correlationId } from '@/lib/monitoring-utils';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  if (!process.env.SENTRY_DSN) return;
  try {
    const supplied = request.headers['x-request-id'];
    const requestId = correlationId(Array.isArray(supplied) ? supplied[0] : supplied);
    Sentry.withScope(scope => {
      scope.setTag('request_id', requestId);
      scope.setTag('route', context.routePath.slice(0, 120));
      scope.setTag('route_type', context.routeType.slice(0, 30));
      Sentry.captureRequestError(error, request, context);
    });
  } catch {
    // Monitoring errors must not interfere with the request lifecycle.
  }
};
