export type AgentPermission = 'read'|'write'|'sensitive'|'critical';
export type AgentCategory = 'core'|'development'|'website'|'creative'|'knowledge'|'productivity'|'business'|'computer';
export type AgentJsonSchema = Record<string, unknown>;
export type AgentDefinition = {id:string;name:string;description:string;category:AgentCategory;instructions:string;enabled:boolean;ownerOnly:boolean;allowedTools:string[];permissions:AgentPermission[];approvalRequired:boolean;model?:string;timeoutMs:number;maxRetries:number;inputSchema:AgentJsonSchema;outputSchema:AgentJsonSchema};
export type AgentRunStatus='queued'|'running'|'waiting_approval'|'completed'|'failed'|'cancelled';
