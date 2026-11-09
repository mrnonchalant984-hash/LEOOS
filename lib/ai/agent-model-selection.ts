import { getDefaultTextModel, isProviderConfigured, resolveModel } from './model-catalog.ts';
import type { AgentDefinition } from '@/lib/agents/types';
import { getModelProviderStatus } from './model-catalog.ts';

/**
 * Resolve the model used by built-in text agents.
 *
 * Gemini is the platform default. Only a valid, configured Gemini-specific
 * agent override is accepted; local and other provider endpoints are ignored.
 */
export function getAgentPrimaryModel(
  agentModel = process.env.LEO_AGENT_MODEL?.trim(),
): string {
  if (agentModel) {
    try {
      const candidate = agentModel.includes('/')
        ? agentModel
        : agentModel.startsWith('gemini-') ? `google/${agentModel}` : '';
      if (candidate) {
        const resolved = resolveModel(candidate);
        if (resolved.provider === 'google' && isProviderConfigured('google')) {
          return `google/${resolved.model}`;
        }
      }
    } catch {
      // Invalid or stale environment overrides must not block the default route.
    }
  }

  return getDefaultTextModel('chat');
}

export function selectAgentModel(agent: Pick<AgentDefinition, 'id' | 'model' | 'allowedTools'>, task: string) {
  const reasoning = agent.allowedTools.some(tool =>
    ['database_write', 'deployment', 'github_write', 'security'].includes(tool),
  ) || /architect|analy[sz]e|debug|design|plan|reason|security|trade.?off/i.test(`${agent.id} ${task}`);
  const configuredAgentModel = agent.model?.trim() || process.env.LEO_AGENT_MODEL?.trim();
  const model = configuredAgentModel
    ? getAgentPrimaryModel(configuredAgentModel)
    : getDefaultTextModel(reasoning ? 'reasoning' : 'chat');
  const resolved = resolveModel(model);
  const catalogEntry = getModelProviderStatus().find(entry =>
    entry.provider === resolved.provider && entry.model === resolved.model,
  );
  return {
    model: `${resolved.provider}/${resolved.model}`,
    provider: resolved.provider,
    reason: reasoning ? 'reasoning' as const : 'general' as const,
    capabilities: catalogEntry?.capabilities ?? ['text'],
  };
}
