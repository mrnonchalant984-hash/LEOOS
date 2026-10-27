import { getDefaultTextModel, isProviderConfigured, resolveModel } from './model-catalog.ts';

/**
 * Resolve the model used by built-in text agents.
 *
 * Gemini is the platform default. An explicitly configured local endpoint is
 * preserved, and a valid Gemini-specific agent override is accepted. Invalid
 * or non-Gemini LEO_AGENT_MODEL values fall back to the validated Gemini chat
 * default rather than bypassing provider routing or failing before fallback.
 */
export function getAgentPrimaryModel(
  agentModel = process.env.LEO_AGENT_MODEL?.trim(),
  localUrl = process.env.LEO_LOCAL_MODEL_URL?.trim(),
  localName = process.env.LEO_LOCAL_MODEL_NAME?.trim() || 'local-model',
): string {
  if (localUrl) return `local/${localName}`;

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
