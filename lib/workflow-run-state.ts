export type WorkflowStepStatus = 'succeeded' | 'failed' | 'waiting_approval' | 'approved' | 'rejected';

export type WorkflowStepResult = {
  step_id: string;
  status: WorkflowStepStatus;
  output?: string;
};

const STEP_STATUSES = new Set<WorkflowStepStatus>([
  'succeeded',
  'failed',
  'waiting_approval',
  'approved',
  'rejected',
]);

export function parseWorkflowStepResults(
  value: unknown,
  validStepIds: ReadonlySet<string>,
): WorkflowStepResult[] | null {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value) || value.length > 5) return null;

  const parsed: WorkflowStepResult[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
    const item = candidate as Record<string, unknown>;
    if (typeof item.step_id !== 'string' || !validStepIds.has(item.step_id) ||
        typeof item.status !== 'string' || !STEP_STATUSES.has(item.status as WorkflowStepStatus) ||
        (item.output !== undefined && (typeof item.output !== 'string' || item.output.length > 12_000))) {
      return null;
    }
    const result: WorkflowStepResult = {
      step_id: item.step_id,
      status: item.status as WorkflowStepStatus,
      ...(typeof item.output === 'string' ? { output: item.output } : {}),
    };
    const existing = parsed.findIndex(entry => entry.step_id === result.step_id);
    if (existing >= 0) parsed[existing] = result;
    else parsed.push(result);
  }
  return parsed;
}

export function completedWorkflowStepIds(results: readonly WorkflowStepResult[]) {
  return new Set(results.filter(result => result.status === 'succeeded').map(result => result.step_id));
}

export function setWorkflowStepResult(
  results: readonly WorkflowStepResult[],
  next: WorkflowStepResult,
): WorkflowStepResult[] {
  const existing = results.findIndex(result => result.step_id === next.step_id);
  if (existing < 0) return [...results, next];
  return results.map((result, index) => index === existing ? next : result);
}
