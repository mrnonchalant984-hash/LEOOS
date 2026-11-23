import { getDefaultTextModel, isProviderConfigured, resolveModel, getModelProviderStatus } from './model-catalog.ts';
import type { AgentDefinition } from '@/lib/agents/types';

/** Built-in agents use free-tier Gemini models only. */
export function getAgentPrimaryModel(agentModel?: string): string {
  if (agentModel?.trim()) {
    try {
      const configured = agentModel.trim();
      const candidate = configured.includes('/') ? configured : `google/${configured}`;
      const resolved = resolveModel(candidate);
      const freeModel = getModelProviderStatus().some(entry =>
        entry.provider === resolved.provider && entry.model === resolved.model && entry.tier === 'free',
      );
      if (resolved.provider === 'google' && freeModel && isProviderConfigured('google')) return `google/${resolved.model}`;
    } catch { /* Invalid or paid-only agent overrides fall through to free defaults. */ }
  }
  return getDefaultTextModel('chat');
}

export function selectAgentModel(agent: Pick<AgentDefinition, 'id' | 'model' | 'allowedTools'>, task: string) {
  const research = agent.allowedTools.includes('web_search');
  const reasoning = agent.allowedTools.some(tool =>
    ['database_write', 'deployment', 'github_write', 'security'].includes(tool),
  ) || /architect|analy[sz]e|debug|design|plan|reason|security|trade.?off/i.test(`${agent.id} ${task}`);
  // Only explicit per-agent overrides are considered; a global LEO_AGENT_MODEL
  // cannot silently force every specialist onto one model.
  const model = agent.model?.trim()
    ? getAgentPrimaryModel(agent.model)
    : getDefaultTextModel(research ? 'research' : reasoning ? 'reasoning' : 'chat');
  const resolved = resolveModel(model);
  const catalogEntry = getModelProviderStatus().find(entry =>
    entry.provider === resolved.provider && entry.model === resolved.model,
  );
  return {
    model: `${resolved.provider}/${resolved.model}`,
    provider: resolved.provider,
    reason: research ? 'research' as const : reasoning ? 'reasoning' as const : 'general' as const,
    capabilities: catalogEntry?.capabilities ?? ['text'],
  };
}
