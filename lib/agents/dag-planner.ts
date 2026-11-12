export type DagNode = {
  id: string;
  dependsOn: string[];
};

export type DagNodeOutcome<T> =
  | { id: string; status: 'completed'; value: T }
  | { id: string; status: 'failed'; error: unknown }
  | { id: string; status: 'blocked'; blockedBy: string[] };

export type DagPlan<T extends DagNode> = {
  nodes: T[];
  levels: T[][];
  maxConcurrency: number;
};

export function createDagPlan<T extends DagNode>(nodes: readonly T[], maxConcurrency = 2): DagPlan<T> {
  if (nodes.length === 0 || nodes.length > 20) {
    throw new Error('A DAG must contain between 1 and 20 nodes.');
  }
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 4) {
    throw new Error('DAG concurrency must be between 1 and 4.');
  }

  const byId = new Map<string, T>();
  for (const node of nodes) {
    if (!node || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(node.id) || byId.has(node.id) || !Array.isArray(node.dependsOn)) {
      throw new Error('DAG node identity or dependencies are invalid.');
    }
    byId.set(node.id, node);
  }
  for (const node of nodes) {
    if (new Set(node.dependsOn).size !== node.dependsOn.length
      || node.dependsOn.some((dependency: string) => dependency === node.id || !byId.has(dependency))) {
      throw new Error(`DAG dependencies are invalid for node ${node.id}.`);
    }
  }

  const remaining = new Set(byId.keys());
  const visited = new Set<string>();
  const levels: T[][] = [];
  while (remaining.size) {
    const level = [...remaining]
      .map(id => byId.get(id)!)
      .filter(node => node.dependsOn.every(id => visited.has(id)));
    if (!level.length) throw new Error('DAG contains a dependency cycle.');
    levels.push(level);
    for (const node of level) {
      visited.add(node.id);
      remaining.delete(node.id);
    }
  }
  return { nodes: [...nodes], levels, maxConcurrency };
}

export async function executeDag<TNode extends DagNode, TValue>(
  plan: DagPlan<TNode>,
  execute: (node: TNode) => Promise<TValue>,
  isDependencySatisfied: (value: TValue) => boolean = () => true,
  initialValues: Readonly<Record<string, TValue>> = {},
): Promise<DagNodeOutcome<TValue>[]> {
  const outcomes = new Map<string, DagNodeOutcome<TValue>>();
  for (const node of plan.nodes) {
    if (Object.prototype.hasOwnProperty.call(initialValues, node.id)) {
      outcomes.set(node.id, { id: node.id, status: 'completed', value: initialValues[node.id] });
    }
  }
  let stopped = false;
  for (const level of plan.levels) {
    if (stopped) break;
    const runnable: TNode[] = [];
    for (const node of level) {
      if (outcomes.has(node.id)) continue;
      const failedDependencies = node.dependsOn.filter(id => {
        const outcome = outcomes.get(id);
        return outcome?.status !== 'completed' || !isDependencySatisfied(outcome.value);
      });
      if (failedDependencies.length) {
        outcomes.set(node.id, { id: node.id, status: 'blocked', blockedBy: failedDependencies });
      } else {
        runnable.push(node);
      }
    }

    for (let offset = 0; offset < runnable.length; offset += plan.maxConcurrency) {
      const batch = runnable.slice(offset, offset + plan.maxConcurrency);
      await Promise.all(batch.map(async node => {
        try {
          outcomes.set(node.id, { id: node.id, status: 'completed', value: await execute(node) });
        } catch (error) {
          outcomes.set(node.id, { id: node.id, status: 'failed', error });
        }
      }));
      const controlOutcomes = batch
        .map(node => outcomes.get(node.id))
        .filter((outcome): outcome is Extract<DagNodeOutcome<TValue>, { status: 'completed' }> =>
          outcome?.status === 'completed' && !isDependencySatisfied(outcome.value));
      if (controlOutcomes.length) {
        const controlIds = controlOutcomes.map(outcome => outcome.id);
        for (const pending of plan.nodes) {
          if (!outcomes.has(pending.id)) {
            outcomes.set(pending.id, { id: pending.id, status: 'blocked', blockedBy: controlIds });
          }
        }
        stopped = true;
        break;
      }
    }
  }
  return plan.nodes.map(node => outcomes.get(node.id)!);
}
