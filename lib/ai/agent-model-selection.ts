import { getDefaultTextModel, isProviderConfigured, resolveModel } from './model-catalog.ts';

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
