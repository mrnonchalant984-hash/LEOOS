import * as vscode from 'vscode';
import { LeonardXApi } from '../api/client';
import { getWorkspaceAgentContext } from '../workspace/context';

type AgentInfo = { id: string; name: string; description?: string };
type Delegation = { agent_id: string; subtask: string };

function parseDelegations(text: string): Delegation[] {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match?.[0] || '{}') as { specialists?: unknown };
    if (!Array.isArray(parsed.specialists)) return [];
    return parsed.specialists.flatMap((item): Delegation[] => {
      if (!item || typeof item !== 'object') return [];
      const value = item as Record<string, unknown>;
      return typeof value.agent_id === 'string' && typeof value.subtask === 'string'
        ? [{ agent_id: value.agent_id, subtask: value.subtask.slice(0, 4_000) }] : [];
    }).slice(0, 4);
  } catch { return []; }
}

function fallbackDelegations(task: string): Delegation[] {
  const text = task.toLowerCase();
  const ids = /security|auth|permission|secret/.test(text) ? ['security', 'code-review']
    : /database|sql|supabase|migration/.test(text) ? ['database', 'backend', 'qa']
      : /ui|frontend|react|css|page/.test(text) ? ['frontend', 'code-review', 'qa']
        : ['developer', 'code-review', 'qa'];
  return ids.map(agent_id => ({ agent_id, subtask: `${task}\nFocus only on your specialist area. Return evidence, recommendations and limitations. Do not claim local edits or tests.` }));
}

export async function coordinateSpecialists(api: LeonardXApi, output: vscode.OutputChannel) {
  const task = await vscode.window.showInputBox({ prompt: 'Describe the engineering task for Leo Manager', ignoreFocusOut: true, validateInput: value => value.trim() && value.trim().length <= 2_500 ? null : 'Enter an engineering task of at most 2,500 characters.' });
  if (!task) return;
  const sharing = await vscode.window.showWarningMessage(
    'Share bounded workspace context with LeonardX specialist agents?',
    { modal: true, detail: 'Only safe project paths and selected project metadata are included. Source files are not automatically shared.' },
    'Share workspace summary', 'No workspace context',
  );
  if (!sharing) return;
  const workspaceContext = sharing === 'Share workspace summary' ? await getWorkspaceAgentContext() : '';
  const catalog = await api.request<{ agents?: Array<Record<string, unknown>> }>('/api/agents');
  const agents: AgentInfo[] = (catalog.agents || []).flatMap(agent =>
    typeof agent.id === 'string' && typeof agent.name === 'string'
      ? [{ id: agent.id, name: agent.name, description: typeof agent.description === 'string' ? agent.description : undefined }] : [],
  );
  const available = new Map(agents.map(agent => [agent.id, agent]));
  if (!available.has('leo-manager')) throw new Error('Leo Manager is not available to this account.');

  const planResponse = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Leo Manager is planning specialist work', cancellable: false },
    () => api.request<Record<string, unknown>>('/api/agents/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: 'leo-manager',
        task: `Create a bounded specialist delegation plan. Return JSON only: {"specialists":[{"agent_id":"...","subtask":"..."}],"plan":"..."}. Select at most four IDs from this available registry: ${agents.map(agent => agent.id).join(', ')}. Do not claim local inspection or file changes.\nEngineering task: ${task.trim()}`,
        context: workspaceContext.slice(0, 12_000),
      }),
    }),
  );
  const planText = typeof planResponse.result === 'string' ? planResponse.result
    : typeof planResponse.message === 'string' ? planResponse.message : JSON.stringify(planResponse);
  let delegations = parseDelegations(planText);
  if (!delegations.length) delegations = fallbackDelegations(task);
  delegations = delegations.filter(item => available.has(item.agent_id) && item.agent_id !== 'leo-manager');
  if (!delegations.length) throw new Error('Leo Manager did not select any available specialist agents.');

  const approval = await vscode.window.showWarningMessage(
    `Leo Manager proposes ${delegations.length} specialist run(s).`,
    { modal: true, detail: delegations.map(item => `${available.get(item.agent_id)?.name}: ${item.subtask.slice(0, 220)}`).join('\n\n') },
    'Run specialists',
  );
  if (approval !== 'Run specialists') return;

  const results: Array<{ name: string; status: string; result: string }> = [];
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'LeonardX specialists are working', cancellable: false },
    async progress => {
      for (const delegation of delegations) {
        const agent = available.get(delegation.agent_id)!;
        progress.report({ message: agent.name });
        const response = await api.request<Record<string, unknown>>('/api/agents/run', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent_id: delegation.agent_id, task: delegation.subtask, context: workspaceContext.slice(0, 18_000) }),
        });
        results.push({
          name: agent.name,
          status: typeof response.status === 'string' ? response.status : 'unknown',
          result: typeof response.result === 'string' ? response.result
            : typeof response.message === 'string' ? response.message : JSON.stringify(response),
        });
      }
    },
  );

  const evidenceBundle = results.map(result => `SPECIALIST: ${result.name}\nSTATUS: ${result.status}\nRESULT: ${result.result.slice(0, 4_000)}`).join('\n\n');
  let synthesis = 'Leo Manager synthesis was unavailable; the raw specialist responses are shown below.';
  let synthesisStatus = 'not_run';
  try {
    const synthesisResponse = await api.request<Record<string, unknown>>('/api/agents/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: 'leo-manager',
        task: `Consolidate actual specialist responses for this engineering task: ${task.trim().slice(0, 2_400)}. Identify agreement, conflicts, unknowns, verified claims, and next steps. Never claim local edits or tests without evidence.`,
        context: evidenceBundle.slice(0, 18_000),
      }),
    });
    synthesis = typeof synthesisResponse.result === 'string' ? synthesisResponse.result
      : typeof synthesisResponse.message === 'string' ? synthesisResponse.message : JSON.stringify(synthesisResponse);
    synthesisStatus = typeof synthesisResponse.status === 'string' ? synthesisResponse.status : 'unknown';
  } catch (error) {
    synthesisStatus = 'failed';
    synthesis = `Leo Manager synthesis failed: ${error instanceof Error ? error.message : 'unknown error'}`;
  }

  output.clear();
  output.appendLine('Leo Manager · Specialist coordination');
  output.appendLine(`Task: ${task.trim()}`);
  output.appendLine(`Plan: ${planText.slice(0, 5_000)}`);
  output.appendLine(`\n## Consolidated report — ${synthesisStatus}`);
  output.appendLine(synthesis.slice(0, 12_000));
  for (const result of results) {
    output.appendLine(`\n## ${result.name} — ${result.status}`);
    output.appendLine(result.result.slice(0, 8_000));
  }
  output.show(true);
  void vscode.window.showInformationMessage(`Collected ${results.length} specialist response(s). Manager synthesis status: ${synthesisStatus}. See the LeoCode output channel.`);
}
