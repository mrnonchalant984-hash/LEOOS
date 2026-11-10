import type { AgentDefinition } from './types';

export const MCP_AGENT_CAPABILITIES = new Set([
  'analytics_read', 'calendar_read', 'crm_read', 'database_read', 'document_read',
  'email_read', 'github_read', 'hosting_read', 'invoice_read', 'knowledge_read',
  'notes_read', 'payment_read', 'repository_read',
]);

export function agentHasMcpReadCapability(agent: Pick<AgentDefinition, 'allowedTools'>) {
  return agent.allowedTools.some(capability => MCP_AGENT_CAPABILITIES.has(capability));
}

export function mcpToolGrantedToAgent(agentIds: unknown, agentId: string) {
  return Array.isArray(agentIds) && agentIds.includes(agentId);
}
