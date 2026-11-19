import { adminSupabase } from '@/lib/auth';

export type BramExecutionEventInput = {
  userId: string;
  sessionId: string;
  requestId: string;
  executionId?: string | null;
  workerId?: string | null;
  phase: string;
  eventType: 'queued' | 'started' | 'progress' | 'completed' | 'failed' | 'cancelled' | 'resumed';
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  message?: string;
  metadata?: Record<string, unknown>;
};

/** Persist an actual worker lifecycle event. Call from the execution/worker boundary, not from UI intent inference. */
export async function recordBramExecutionEvent(input: BramExecutionEventInput): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(input.userId) ||
      !/^[0-9a-f-]{36}$/i.test(input.sessionId) ||
      !/^[0-9a-f-]{36}$/i.test(input.requestId)) {
    throw new Error('Invalid Bram execution event identity.');
  }
  const { error } = await adminSupabase().from('bram_execution_events').insert({
    user_id: input.userId,
    session_id: input.sessionId,
    request_id: input.requestId,
    execution_id: input.executionId || null,
    worker_id: input.workerId?.slice(0, 120) || null,
    phase: input.phase.slice(0, 100),
    event_type: input.eventType,
    status: input.status,
    message: (input.message || '').slice(0, 2000),
    metadata: input.metadata || {},
  });
  if (error) throw new Error('Bram execution event could not be persisted.');
}

export type BramWorkerEventInput = {
  userId: string;
  projectId: string;
  jobId: string;
  workerId: string;
  workerType: 'cloudflare_preview' | 'build' | 'agent';
  eventType: 'claimed' | 'started' | 'progress' | 'completed' | 'failed' | 'lease_lost';
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  message?: string;
  metadata?: Record<string, unknown>;
};

/** Persist a real background-worker lifecycle event with the same service-owned event boundary. */
export async function recordBramWorkerEvent(input: BramWorkerEventInput): Promise<void> {
  if (![input.userId, input.projectId, input.jobId].every(value => /^[0-9a-f-]{36}$/i.test(value))) {
    throw new Error('Invalid Bram worker event identity.');
  }
  const { error } = await adminSupabase().from('bram_worker_events').insert({
    user_id: input.userId,
    project_id: input.projectId,
    job_id: input.jobId,
    worker_id: input.workerId.slice(0, 120),
    worker_type: input.workerType,
    event_type: input.eventType,
    status: input.status,
    message: (input.message || '').slice(0, 1000),
    metadata: input.metadata || {},
  });
  if (error) throw new Error('Bram worker event could not be persisted.');
}
