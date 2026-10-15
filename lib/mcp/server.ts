import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';

function toolError(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

export type McpProject = {
  id: string;
  project_name: string;
  type: string;
  status: string;
  progress: number;
  created_at: string;
};

export type McpProjectReader = {
  listProjects(userId: string, limit: number): Promise<{ data: McpProject[] | null; error: unknown }>;
  getProject(userId: string, projectId: string): Promise<{ data: McpProject | null; error: unknown }>;
};

export function createUserMcpServer(userId: string, projects: McpProjectReader) {
  const server = new McpServer({ name: 'LeonardX', version: '1.0.0' }, {
    maxToolInputElements: 32,
  });
  server.registerTool('list_projects', {
    title: 'List my projects',
    description: 'List the authenticated account owner’s LeonardX project names, types, statuses, and progress. This tool is read-only.',
    inputSchema: { limit: z.number().int().min(1).max(50).optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ limit }) => {
    const { data, error } = await projects.listProjects(userId, limit || 20);
    if (error) return toolError('Projects could not be loaded.');
    return { content: [{ type: 'text', text: JSON.stringify(data || []) }] };
  });
  server.registerTool('get_project_status', {
    title: 'Get project status',
    description: 'Read the status and progress of a single project owned by the authenticated account. This tool is read-only.',
    inputSchema: { project_id: z.string().uuid() },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ project_id }) => {
    const { data, error } = await projects.getProject(userId, project_id);
    if (error) return toolError('Project status could not be loaded.');
    if (!data) return toolError('Project not found.');
    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
  });
  return server;
}

export async function handleUserMcpRequest(request: Request, userId: string, projects: McpProjectReader) {
  const server = createUserMcpServer(userId, projects);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: 64 * 1024,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}
