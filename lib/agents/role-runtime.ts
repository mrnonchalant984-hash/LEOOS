import { PROFESSIONAL_ROLES, type ProfessionalRole } from './professional-roles';

export type RoleExecutionNode = { role_id: string; department: string; capabilities: string[]; permissions: string[]; approval_required: boolean; depends_on: string[] };
export type RoleExecutionPlan = { version: 1; objective: string; concurrency_limit: number; nodes: RoleExecutionNode[]; execution_mode: 'bounded-model-workers'; tool_policy: 'deny-by-default'; requires_human_approval: boolean };
const roleMap = new Map(PROFESSIONAL_ROLES.map(role => [role.id, role]));

/** Build a bounded plan for any subset of the 160 catalog roles. This plans work; it does not itself execute or grant tools. */
export function buildRoleExecutionPlan(objective: string, roleIds: string[], dependencies: Record<string, string[]> = {}, concurrencyLimit = 4): RoleExecutionPlan {
  const cleanObjective = objective.trim();
  if (cleanObjective.length < 3 || cleanObjective.length > 5000) throw new Error('invalid_objective');
  if (!Array.isArray(roleIds) || roleIds.length < 1 || roleIds.length > PROFESSIONAL_ROLES.length) throw new Error('invalid_role_count');
  if (new Set(roleIds).size !== roleIds.length) throw new Error('duplicate_role');
  const selected = new Set(roleIds);
  if (Object.keys(dependencies).some(id => !selected.has(id))) throw new Error('dependency_role_not_selected');
  const nodes = roleIds.map(id => {
    const role = roleMap.get(id); if (!role) throw new Error('unknown_role');
    const deps = dependencies[id] || [];
    if (!Array.isArray(deps) || deps.length > 20 || new Set(deps).size !== deps.length || deps.some(dep => !selected.has(dep) || dep === id)) throw new Error('invalid_dependency');
    return { role_id: role.id, department: role.department, capabilities: [...role.capabilities], permissions: role.permissions.filter(p => p === 'read'), approval_required: role.approvalRequired, depends_on: [...new Set(deps)] };
  });
  const indegree = new Map(nodes.map(node => [node.role_id, node.depends_on.length]));
  const ready = nodes.filter(node => indegree.get(node.role_id) === 0).map(node => node.role_id);
  let visited = 0;
  while (ready.length) { const current = ready.shift()!; visited++; for (const node of nodes) if (node.depends_on.includes(current)) { const count = (indegree.get(node.role_id) || 0) - 1; indegree.set(node.role_id, count); if (count === 0) ready.push(node.role_id); } }
  if (visited !== nodes.length) throw new Error('dependency_cycle');
  const bounded = Number.isFinite(concurrencyLimit) ? Math.max(1, Math.min(8, Math.trunc(concurrencyLimit))) : 4;
  return { version: 1, objective: cleanObjective, concurrency_limit: bounded, nodes, execution_mode: 'bounded-model-workers', tool_policy: 'deny-by-default', requires_human_approval: nodes.some(node => node.approval_required) };
}
export function getExecutionRole(id: string): ProfessionalRole | undefined { return roleMap.get(id); }
