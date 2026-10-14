import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const rolesPath = fileURLToPath(new URL('../lib/agents/professional-roles.ts', import.meta.url));
const sourcePath = fileURLToPath(new URL('../lib/agents/role-runtime.ts', import.meta.url));
const tempPath = join(tmpdir(), `leonardx-role-runtime-${process.pid}.ts`);
const source = readFileSync(sourcePath, 'utf8').replace("from './professional-roles'", `from '${pathToFileURL(rolesPath).href}'`);
writeFileSync(tempPath, source);
const { buildRoleExecutionPlan } = await import(pathToFileURL(tempPath).href);
const { PROFESSIONAL_ROLES } = await import(pathToFileURL(rolesPath).href);
try {
  test('execution planner builds bounded plans for the full 160-role catalog', () => {
    const ids = PROFESSIONAL_ROLES.map(role => role.id);
    const plan = buildRoleExecutionPlan('Plan a secure platform upgrade', ids, {}, 99);
    assert.equal(plan.nodes.length, 160);
    assert.equal(plan.concurrency_limit, 8);
    assert.equal(plan.tool_policy, 'deny-by-default');
    assert.equal(plan.execution_mode, 'bounded-model-workers');
  });
  test('execution planner rejects unknown roles, duplicate roles, and dependency cycles', () => {
    assert.throws(() => buildRoleExecutionPlan('Review', ['not-a-role']), /unknown_role/);
    assert.throws(() => buildRoleExecutionPlan('Review', ['chief-technology-officer','chief-technology-officer']), /duplicate_role/);
    assert.throws(() => buildRoleExecutionPlan('Review', ['chief-technology-officer','principal-software-architect'], { 'chief-technology-officer': ['principal-software-architect'], 'principal-software-architect': ['chief-technology-officer'] }), /dependency_cycle/);
    assert.throws(() => buildRoleExecutionPlan('Review', ['chief-technology-officer'], { 'not-selected': [] }), /dependency_role_not_selected/);
  });
} finally { unlinkSync(tempPath); }
