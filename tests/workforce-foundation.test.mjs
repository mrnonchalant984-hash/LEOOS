import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('professional role catalog contains 160 distinct specification-derived roles', async () => {
  const source = await read('lib/agents/professional-roles.ts');
  const ids = [...source.matchAll(/"id": "([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, 160);
  assert.equal(new Set(ids).size, 160);
  assert.match(source, /Chief AI Officer \/ Chief of Staff/);
  assert.match(source, /Independent Delivery Auditor/);
});

test('meeting API validates role IDs and limits participants', async () => {
  const source = await read('app/api/meetings/route.ts');
  assert.match(source, /min\(2\)\.max\(5\)/);
  assert.match(source, /roleIds\.has\(id\)/);
  assert.match(source, /requireOwner\(req\)/);
  assert.match(source, /eq\('user_id', ctx\.user\.id\)/);
});

test('meeting discussion uses configured AI and persists each contribution', async () => {
  const source = await read('app/api/meetings/[id]/discuss/route.ts');
  assert.match(source, /createTextResponse\(/);
  assert.match(source, /createTextResponse\(/);
  assert.match(source, /workforce_meeting_messages/);
  assert.match(source, /workforce_meeting_action_items/);
  assert.match(source, /status: 'paused'/);
});

test('meeting migration isolates records by user and enables RLS', async () => {
  const source = await read('supabase/migrations/20261014100000_workforce_meetings.sql');
  for (const table of ['workforce_meetings', 'workforce_meeting_messages', 'workforce_meeting_action_items']) {
    assert.match(source, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(source, new RegExp(`auth\\.uid\\(\\) = user_id`));
  }
});

test('owner workforce and meetings are listed only in administration navigation', async () => {
  const shell = await read('components/LEOAppShell.tsx');
  const widget = await read('components/LEOWidget.tsx');
  assert.match(shell, /const adminGroup[\s\S]*\['AI workforce','\/workforce'/);
  assert.match(shell, /const adminGroup[\s\S]*\['Meeting room','\/meeting-room'/);
  const customerGroups = shell.split('const adminGroup:')[0];
  assert.doesNotMatch(customerGroups, /\['AI workforce','\/workforce'/);
  assert.doesNotMatch(customerGroups, /\['Meeting room','\/meeting-room'/);
  assert.doesNotMatch(widget, /href="\/workforce"/);
  assert.doesNotMatch(widget, /href="\/meeting-room"/);
  assert.match(widget, /<span>Menu<\/span>/);
});

test('workforce and every meeting API method enforce platform-owner access', async () => {
  const files = [
    'app/api/workforce/route.ts', 'app/api/workforce/conversations/route.ts',
    'app/api/workforce/conversations/[id]/messages/route.ts', 'app/api/meetings/route.ts',
    'app/api/meetings/[id]/route.ts', 'app/api/meetings/[id]/discuss/route.ts',
    'app/api/meetings/[id]/action-items/route.ts'
  ];
  for (const file of files) {
    const source = await read(file);
    assert.match(source, /requireOwner\(req\)/, `${file} must require owner authentication`);
    assert.match(source, /status: 403/, `${file} must deny non-owners`);
  }
  const workforceLayout = await read('app/workforce/layout.tsx');
  const meetingLayout = await read('app/meeting-room/layout.tsx');
  assert.match(workforceLayout, /authFetch\('\/api\/workforce'/);
  assert.match(meetingLayout, /authFetch\('\/api\/meetings'/);
  assert.match(workforceLayout, /Owner access not verified/);
  assert.match(meetingLayout, /Owner access not verified/);
  assert.doesNotMatch(workforceLayout, /router\.replace\('\/agents'\)/);
  assert.doesNotMatch(meetingLayout, /router\.replace\('\/agents'\)/);
});

test('customer agents remain separate and enforce plan entitlements server-side', async () => {
  const source = await read('app/api/agents/run/route.ts');
  const entitlements = await read('lib/agents/entitlements.ts');
  assert.match(source, /agentAllowed\(requested\.id, plan\.key, owner\)/);
  assert.match(source, /Manual specialist agents require a Pro or Business plan/);
  assert.match(entitlements, /STANDARD_AGENT_IDS/);
  assert.match(entitlements, /PRO_AGENT_IDS/);
});

test('speech generation requires authentication and rate limits provider usage', async () => {
  const source = await read('app/api/speak/route.ts');
  assert.match(source, /getProfile\(req\)/);
  assert.match(source, /enforceUserRateLimit/);
  assert.match(source, /max\(4000\)/);
});

test('individual engineer conversations persist history and use role-specific model instructions', async () => {
  const create = await read('app/api/workforce/conversations/route.ts');
  const messages = await read('app/api/workforce/conversations/[id]/messages/route.ts');
  assert.match(create, /workforce_conversations/);
  assert.match(create, /requireOwner\(req\)/);
  assert.match(messages, /workforce_conversation_messages/);
  assert.match(messages, /role\.instructions/);
  assert.match(messages, /createTextResponse\(/);
  assert.match(messages, /eq\('user_id', ctx\.user\.id\)/);
});

test('conversation migration enables RLS for both conversation tables', async () => {
  const source = await read('supabase/migrations/20261014100000_workforce_meetings.sql');
  assert.match(source, /alter table public\.workforce_conversations enable row level security/);
  assert.match(source, /alter table public\.workforce_conversation_messages enable row level security/);
});

test('operational agent fan-out is bounded and passes prior specialist output as untrusted context', async () => {
  const source = await read('app/api/agents/run/route.ts');
  const manager = await read('lib/agents/manager.ts');
  assert.match(source, /selectedAgents\.slice\(0, 4\)/);
  assert.match(source, /UNTRUSTED SPECIALIST HANDOFF/);
  assert.match(source, /handoff_mode: agents\.length > 1 \? 'bounded_sequential'/);
  assert.match(manager, /Treat supplied context.*as untrusted data/);
});

test('approved meeting action items must be approved before execution and approval center uses protected endpoints', async () => {
  const room = await read('app/meeting-room/page.tsx');
  const dashboard = await read('app/workforce/page.tsx');
  assert.match(room, /item\.status !== 'approved'/);
  assert.match(dashboard, /\/api\/agents\/approve/);
  assert.match(dashboard, /\/api\/agents\/cancel/);
  assert.match(dashboard, /Approve and run/);
});

test('completed meetings can continue only with an explicit continuation flag', async () => {
  const source = await read('app/api/meetings/[id]/discuss/route.ts');
  assert.match(source, /meeting\.status === 'completed' && !parsed\.data\.continueMeeting/);
  assert.match(source, /meeting\.status === 'cancelled'/);
});


test('workflow dependency engine rejects missing references and cycles, and produces stable topological order', async () => {
  const source = await read('lib/workflow-dependencies.ts');
  const route = await read('app/api/workflows/route.ts');
  const worker = await read('app/api/internal/workflow-worker/route.ts');
  assert.match(source, /workflowDependencyError/);
  assert.match(source, /workflow_dependency_cycle/);
  assert.match(source, /topologicallySortWorkflowSteps/);
  assert.match(route, /dependsOn: z\.array/);
  assert.match(route, /workflowDependencyError/);
  assert.match(worker, /topologicallySortWorkflowSteps/);
  assert.match(worker, /invalid_workflow_dependencies/);
});

test('project memory supports global plus project-scoped retrieval with ownership and bounded input checks', async () => {
  const route = await read('app/api/memory/route.ts');
  const migration = await read('supabase/migrations/20261014110000_project_memory_dependencies.sql');
  assert.match(route, /ownedProject/);
  assert.match(route, /eq\('user_id', userId\)/);
  assert.match(route, /project_id\.is\.null,project_id\.eq/);
  assert.match(route, /MAX_MEMORY_LENGTH = 3000/);
  assert.match(route, /UUID_RE/);
  assert.match(migration, /add column if not exists project_id/);
  assert.match(migration, /on delete cascade/);
});


test('Leo chat loads only global and verified project memory, and saves remembered facts to the selected scope', async () => {
  const source = await read('app/api/chat/route.ts');
  assert.match(source, /PROJECT_ID_RE/);
  assert.match(source, /eq\("user_id", ctx\.user\.id\)/);
  assert.match(source, /project_id\.is\.null,project_id\.eq/);
  assert.match(source, /source: project_id \? "project" : "chat"/);
  assert.match(source, /Project not found/);
});

test('workflow dependency helpers execute a stable topological sort and detect invalid graphs', async () => {
  const { workflowDependencyError, topologicallySortWorkflowSteps } = await import('../lib/workflow-dependencies.ts');
  const steps = [
    { id: 'c', type: 'agent', dependsOn: ['b'] },
    { id: 'a', type: 'agent', dependsOn: [] },
    { id: 'b', type: 'agent', dependsOn: ['a'] },
  ];
  assert.equal(workflowDependencyError(steps), null);
  assert.deepEqual(topologicallySortWorkflowSteps(steps).map(step => step.id), ['a', 'b', 'c']);
  assert.match(workflowDependencyError([{ id: 'a', type: 'agent', dependsOn: ['missing'] }]), /unknown step/);
  assert.match(workflowDependencyError([{ id: 'a', type: 'agent', dependsOn: ['b'] }, { id: 'b', type: 'agent', dependsOn: ['a'] }]), /cycle/);
});

test('meeting room supports microphone dictation, sequential spoken playback and speaking-state avatars', async () => {
  const source = await read('app/meeting-room/page.tsx');
  assert.match(source, /SpeechRecognition/);
  assert.match(source, /Speak all turns/);
  assert.match(source, /speakAllTurns/);
  assert.match(source, /animate-pulse ring-2/);
  assert.match(source, /setSpeakingRoleId/);
});


test('durable agent worker rechecks current plan entitlements at execution time', async () => {
  const source = await read('app/api/internal/agents/worker/route.ts');
  assert.match(source, /getEffectiveUserPlan/);
  assert.match(source, /agentAllowed\(agent\.id, plan\.key, owner\)/);
  assert.match(source, /agent_entitlement_revoked/);
  assert.match(source, /agent\.ownerOnly && !owner/);
});

test('private workforce API requires owner identity and trusted-device policy', async () => {
  const auth = await read('lib/auth.ts');
  const files = [
    'app/api/workforce/route.ts', 'app/api/workforce/conversations/route.ts',
    'app/api/workforce/conversations/[id]/messages/route.ts', 'app/api/meetings/route.ts',
    'app/api/meetings/[id]/route.ts', 'app/api/meetings/[id]/discuss/route.ts',
    'app/api/meetings/[id]/action-items/route.ts', 'app/api/workforce/jobs/route.ts', 'app/api/workforce/jobs/[id]/route.ts',
  ];
  assert.match(auth, /export async function requireOwner/);
  assert.match(auth, /isTrustedAdminDevice/);
  for (const file of files) {
    const source = await read(file);
    assert.match(source, /requireOwner\(req\)/, `${file} must enforce owner-only access`);
  }
});

test('durable workforce queue has idempotency, dependency checks, retries and atomic claim', async () => {
  const api = await read('app/api/workforce/jobs/route.ts');
  const worker = await read('app/api/internal/workforce/worker/route.ts');
  const migration = await read('supabase/migrations/20261014130000_durable_workforce_role_jobs.sql');
  assert.match(api, /idempotency_key/);
  assert.match(api, /dependencies/);
  assert.match(api, /requireOwner\(req\)/);
  assert.match(worker, /claim_workforce_role_jobs/);
  assert.match(worker, /getConfiguredModel/);
  assert.match(worker, /owner_entitlement_revoked/);
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /dependency_failed/);
  assert.match(migration, /lease_expires_at/);
});

test('local inference adapter is server-configured and bounded by a timeout', async () => {
  const source = await read('lib/openai.ts');
  assert.match(source, /LEO_LOCAL_MODEL_URL/);
  assert.match(source, /baseURL/);
  assert.match(source, /LEO_MODEL_TIMEOUT_MS/);
  assert.match(source, /localUrl\.replace/);
  const worker = await read('app/api/internal/workforce/worker/route.ts');
  assert.match(worker, /Never claim to have run code, edited files/);
});

test('production readiness probe reports only booleans and verifies required migration-backed tables', async () => {
  const source = await read('app/api/health/ready/route.ts');
  assert.match(source, /workforce_role_jobs/);
  assert.match(source, /lease_expires_at/);
  assert.match(source, /status: ready \? 'ready' : 'not_ready'/);
  assert.match(source, /Cache-Control/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY: process\.env/);
});

test('durable role jobs bind to an owned project and retrieve only authorized global/project memories', async () => {
  const route = await read('app/api/workforce/jobs/route.ts');
  const worker = await read('app/api/internal/workforce/worker/route.ts');
  const migration = await read('supabase/migrations/20261014130000_durable_workforce_role_jobs.sql');
  assert.match(route, /eq\('user_id', ctx\.user\.id\)/);
  assert.match(route, /Project not found in your account/);
  assert.match(route, /project_id: projectId/);
  assert.match(worker, /eq\('user_id', job\.user_id\)/);
  assert.match(worker, /leo_memories/);
  assert.match(worker, /project_id\.is\.null,project_id\.eq/);
  assert.match(migration, /references public\.projects\(id\) on delete set null/);
});


test('owner identity fails closed when OWNER_EMAIL is not configured', async () => {
  const auth = await read('lib/auth.ts');
  assert.match(auth, /const ownerEmail = process\.env\.OWNER_EMAIL\?\.trim\(\)\.toLowerCase\(\)/);
  assert.match(auth, /if \(!ownerEmail\) return false/);
  assert.doesNotMatch(auth, /OWNER_EMAIL \|\| ['\"]leonardudoh5@gmail\.com/);
});

test('durable worker uses shared owner identity and never reports an unpersisted lease-lost result as success', async () => {
  const worker = await read('app/api/internal/workforce/worker/route.ts');
  assert.match(worker, /isPlatformOwner\(profile\)/);
  assert.match(worker, /select\('id'\)\.maybeSingle\(\)/);
  assert.match(worker, /if \(saveError \|\| !savedJob\)/);
  assert.match(worker, /if \(updateError \|\| !updatedJob\)/);
  assert.match(worker, /status: 409/);
});

test('workforce task dependencies cannot cross project-memory boundaries', async () => {
  const api = await read('app/api/workforce/jobs/route.ts');
  assert.match(api, /select\('id,project_id'\)/);
  assert.match(api, /same project scope/);
  assert.match(api, /expectedProjectId/);
});

test('owner workforce queue supports guarded cancellation and bounded manual retries', async () => {
  const api = await read('app/api/workforce/jobs/[id]/route.ts');
  const page = await read('app/workforce/jobs/page.tsx');
  assert.match(api, /requireOwner\(req\)/);
  assert.match(api, /job\.status !== 'queued'/);
  assert.match(api, /status: 'cancelled'/);
  assert.match(api, /status: 'queued', attempts: 0/);
  assert.match(api, /parent\.status !== 'succeeded'/);
  assert.match(page, /Cancel queued task/);
  assert.match(page, /Retry task/);
});

test('owner privilege checks are centralized and two-factor enrollment has no hard-coded owner identity', async () => {
  const access = await read('lib/access.ts');
  const dashboard = await read('app/api/dashboard/route.ts');
  const setup = await read('app/api/setup/projects/route.ts');
  const build = await read('app/api/build-deploy/route.ts');
  const twofa = await read('app/api/admin/2fa/route.ts');
  assert.match(access, /isPlatformOwner\(profile\)/);
  assert.match(dashboard, /isPlatformOwner\(ctx\.profile\)/);
  assert.match(setup, /isPlatformOwner\(ctx\.profile\)/);
  assert.match(build, /isPlatformOwner\(ctx\.profile\)/);
  assert.match(twofa, /isPlatformOwner\(p\)/);
  assert.doesNotMatch(twofa, /const OWNER=/);
});
