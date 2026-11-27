import { NextRequest } from 'next/server';
import type { AgentDefinition } from './types';

/**
 * Browser agents use Braverton's private, ephemeral GitHub Actions runtime.
 * The runtime is bounded to approved public hostnames and blocks credentials,
 * payments, form submissions, publishing, deletion, and other sensitive actions.
 */
export function isBrowserAgent(agent: AgentDefinition) {
  return agent.allowedTools.some((tool) => ['browser', 'computer_use', 'web_automation'].includes(tool));
}

export async function runHostedBrowserAgent(agent: AgentDefinition, task: string, _context: string, meta: { runId?: string; userId?: string; request?: Request }) {
  if (!meta.request || !meta.userId) throw new Error('Hosted browser execution requires the authenticated Braverton request.');
  if (!['browser', 'computer-use'].includes(agent.id)) throw new Error('This agent is not authorized for hosted browser execution.');
  const match = task.match(/https?:\/\/[^\s<>()]+/i);
  if (!match) return JSON.stringify({ status: 'needs_input', message: 'Provide a public starting URL in the browser task. No browser job was queued.' });
  let url: URL;
  try { url = new URL(match[0]); } catch { throw new Error('The browser starting URL is invalid.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('The browser starting URL must be a public HTTP(S) URL without embedded credentials.');
  const headers = new Headers(meta.request.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json');
  const request = new NextRequest(new URL('/api/agents/computer-use', meta.request.url), { method: 'POST', headers, body: JSON.stringify({ task, url: url.href }) });
  const { POST } = await import('@/app/api/agents/computer-use/route');
  const response = await POST(request);
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Hosted browser job could not be queued (HTTP ' + response.status + ').');
  return JSON.stringify({ status: data.status || 'queued', job_id: data.job_id || null, poll_url: data.poll_url || null, provider: data.provider || 'github_actions', message: data.message || 'Browser job queued. Check persisted job status before reporting completion.' });
}

export async function getHostedBrowserSession(_sessionId: string): Promise<{ status?: string; required_actions?: Array<{ request_id?: string; type?: string; request?: { type?: string } }> }> {
  throw new Error('Persistent browser sessions are not supported; use the owner-scoped runtime job status tool.');
}
export async function respondToHostedBrowserApproval(_sessionId: string, _approval: unknown) {
  throw new Error('Interactive browser approvals are not supported. Sensitive actions remain blocked.');
}
export async function continueHostedBrowserSession(_sessionId: string, _runId?: string): Promise<{ status: string; result?: unknown }> {
  throw new Error('Persistent browser sessions are not supported; queue a new bounded read-only job instead.');
}
export async function deleteHostedBrowserSession(_sessionId: string) {
  return { status: 'not_supported' };
}