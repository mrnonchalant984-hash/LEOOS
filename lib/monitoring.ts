import 'server-only';

import * as Sentry from '@sentry/nextjs';
import { NextResponse, type NextRequest } from 'next/server';
import { correlationId, type MonitoringOperation, type MonitoringProvider, type MonitoringOutcome } from '@/lib/monitoring-utils';

type OperationContext = {
  requestId: string;
  reportFailure: (error: unknown, provider?: MonitoringProvider) => void;
  markRejected: () => void;
};

const ROUTES: Record<MonitoringOperation, string> = {
  'leo.ai.request': '/api/chat',
  'agent.run': '/api/agents/run',
  'project.build_deploy': '/api/build-deploy',
  'payment.verify': '/api/payment/verify',
  'payment.webhook': '/api/payment/webhook',
};

const PROVIDERS: Record<MonitoringOperation, MonitoringProvider> = {
  'leo.ai.request': 'openai',
  'agent.run': 'openai',
  'project.build_deploy': 'vercel',
  'payment.verify': 'paystack',
  'payment.webhook': 'paystack',
};

function errorType(error: unknown): string {
  const name = error instanceof Error ? error.name : 'UnknownError';
  return /^[A-Za-z][A-Za-z0-9_.-]{0,39}$/.test(name) ? name : 'Error';
}

function writeOperationLog(operation: MonitoringOperation, requestId: string, statusCode: number, durationMs: number, outcome: MonitoringOutcome) {
  const record = JSON.stringify({
    time: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    event: 'leo.operation',
    operation,
    provider: PROVIDERS[operation],
    route: ROUTES[operation],
    request_id: requestId,
    status_code: statusCode,
    duration_ms: Math.max(0, Math.round(durationMs)),
    outcome,
  });
  if (outcome === 'failure') console.error(record);
  else console.info(record);
}

export async function withOperationalMonitoring(
  request: NextRequest,
  operation: MonitoringOperation,
  action: (context: OperationContext) => Promise<Response>,
): Promise<Response> {
  const requestId = correlationId(request.headers.get('x-request-id'));
  const startedAt = Date.now();
  let errorCaptured = false;
  let expectedRejection = false;

  const reportFailure: OperationContext['reportFailure'] = (error, provider) => {
    if (errorCaptured) return;
    errorCaptured = true;
    if (!process.env.SENTRY_DSN) return;

    try {
      Sentry.withScope(scope => {
        scope.setTag('operation', operation);
        scope.setTag('route', ROUTES[operation]);
        scope.setTag('request_id', requestId);
        if (provider) scope.setTag('provider', provider);
        scope.setTag('error_type', errorType(error));
        scope.setFingerprint(['leo-operation', operation, provider || 'unknown', errorType(error)]);
        Sentry.captureException(error);
      });
    } catch {
      // Error reporting must never prevent the original operation from responding.
    }
  };
  const markRejected = () => { expectedRejection = true; };

  try {
    const response = await action({ requestId, reportFailure, markRejected });
    response.headers.set('X-Request-ID', requestId);
    const outcome: MonitoringOutcome = expectedRejection ? 'rejected' : response.status >= 500 ? 'failure' : response.status >= 400 ? 'rejected' : 'success';
    writeOperationLog(operation, requestId, response.status, Date.now() - startedAt, outcome);
    return response;
  } catch (error) {
    reportFailure(error);
    const response = NextResponse.json(
      { error: 'This operation could not be completed.', request_id: requestId },
      { status: 500, headers: { 'X-Request-ID': requestId, 'Cache-Control': 'no-store' } },
    );
    writeOperationLog(operation, requestId, 500, Date.now() - startedAt, 'failure');
    return response;
  }
}
