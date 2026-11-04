import type { AgentDefinition } from './types';

/**
 * Hosted computer-use sessions are disabled during the Gemini-only
 * migration. Keep these exported entry points so callers fail explicitly
 * instead of silently running an alternative AI provider.
 */
export function isBrowserAgent(agent: AgentDefinition) {
  return agent.allowedTools.some((tool) => ['browser', 'computer_use', 'web_automation'].includes(tool));
}

function disabled(): never {
  throw new Error('Hosted computer-use agents are temporarily disabled during the Gemini-only migration. No external model session was created.');
}

export async function runHostedBrowserAgent(_agent: AgentDefinition, _task: string, _context: string, _meta: { runId?: string; userId?: string }) {
  return disabled();
}

export async function getHostedBrowserSession(_sessionId: string): Promise<{
  status?: string;
  required_actions?: Array<{ request_id?: string; type?: string; request?: { type?: string } }>;
}> {
  return disabled();
}

export async function respondToHostedBrowserApproval(_sessionId: string, _approval: unknown) {
  return disabled();
}

export async function continueHostedBrowserSession(_sessionId: string, _runId?: string): Promise<{ status: string; result?: unknown }> {
  return disabled();
}

export async function deleteHostedBrowserSession(_sessionId: string) {
  return disabled();
}
