/** Bounded dependency graph helpers for the workflow engine. No code is executed here. */
export type WorkflowDependencyStep = {
  id: string;
  type: 'agent';
  name?: string;
  config?: { task?: string };
  dependsOn?: string[];
};

export function workflowDependencyError(steps: readonly WorkflowDependencyStep[]): string | null {
  if (steps.length > 5) return 'A workflow can contain at most five steps.';
  const ids = new Set<string>();
  for (const step of steps) {
    if (!step || typeof step.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(step.id)) return 'Every step needs a valid ID.';
    if (ids.has(step.id)) return `Duplicate step ID: ${step.id}`;
    ids.add(step.id);
  }
  for (const step of steps) {
    const dependencies = step.dependsOn ?? [];
    if (!Array.isArray(dependencies) || dependencies.length > 5) return `Invalid dependencies for step ${step.id}.`;
    if (new Set(dependencies).size !== dependencies.length) return `Duplicate dependency for step ${step.id}.`;
    if (dependencies.includes(step.id)) return `Step ${step.id} cannot depend on itself.`;
    for (const dependency of dependencies) {
      if (!ids.has(dependency)) return `Step ${step.id} depends on unknown step ${dependency}.`;
    }
  }
  try {
    topologicallySortWorkflowSteps(steps);
    return null;
  } catch {
    return 'Workflow dependencies contain a cycle.';
  }
}

/** Stable Kahn sort: unrelated steps preserve their original order. */
export function topologicallySortWorkflowSteps<T extends WorkflowDependencyStep>(steps: readonly T[]): T[] {
  const index = new Map(steps.map((step, i) => [step.id, i]));
  const byId = new Map(steps.map(step => [step.id, step]));
  const indegree = new Map(steps.map(step => [step.id, (step.dependsOn ?? []).length]));
  const dependents = new Map<string, string[]>();
  for (const step of steps) {
    for (const dependency of step.dependsOn ?? []) {
      const list = dependents.get(dependency) ?? [];
      list.push(step.id);
      dependents.set(dependency, list);
    }
  }
  const ready = steps.filter(step => indegree.get(step.id) === 0).map(step => step.id);
  const ordered: T[] = [];
  while (ready.length) {
    ready.sort((a, b) => (index.get(a) ?? 0) - (index.get(b) ?? 0));
    const id = ready.shift()!;
    const step = byId.get(id);
    if (!step) throw new Error('invalid_workflow_graph');
    ordered.push(step);
    for (const dependent of dependents.get(id) ?? []) {
      const next = (indegree.get(dependent) ?? 0) - 1;
      indegree.set(dependent, next);
      if (next === 0) ready.push(dependent);
    }
  }
  if (ordered.length !== steps.length) throw new Error('workflow_dependency_cycle');
  return ordered;
}
