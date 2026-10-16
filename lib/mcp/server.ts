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
  getAccountPlan(userId: string): Promise<{ data: unknown; error: unknown }>;
  createProject(userId: string, name: string, projectType: 'website' | 'web_app' | 'saas'): Promise<{ data: unknown; error: unknown }>;
  renameProject(userId: string, projectId: string, name: string): Promise<{ data: unknown; error: unknown }>;
  getHostingStatus(userId: string, projectId: string): Promise<{ data: unknown; error: unknown }>;
  saveProjectFiles(userId: string, projectId: string, files: Record<string, string>): Promise<{ data: unknown; error: unknown }>;
  buildAndDeploy(userId: string, projectId: string, brief: string, files: Array<{ path: string; content: string }>): Promise<{ data: unknown; error: unknown }>;
};

export function createUserMcpServer(userId: string, scopes: string[], projects: McpProjectReader) {
  const server = new McpServer({ name: 'LeonardX', version: '1.0.0' }, {
    maxToolInputElements: 2048,
  });
  const writeAccess = scopes.includes('mcp:write');
  server.registerTool('get_account_plan', {
    title: 'Get my plan and usage limits',
    description: 'Read the authenticated LeonardX account plan, project capacity, supported project types, and monthly build allowance. Does not expose AI-credit balances or call Leo AI.',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async () => {
    const { data, error } = await projects.getAccountPlan(userId);
    if (error) return toolError('Account plan and usage could not be loaded.');
    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
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
  server.registerTool('get_project_hosting_status', {
    title: 'Check hosting and trial status',
    description: 'Read the hosting state for a project owned by the authenticated user, including when its hosting trial started and ends. Hosting trials begin only after a deployment is verified live. This tool does not create a trial or make a payment.',
    inputSchema: { project_id: z.string().uuid() },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ project_id }) => {
    const { data, error } = await projects.getHostingStatus(userId, project_id);
    if (error) return toolError('Project hosting status could not be loaded.');
    if (!data) return toolError('Project not found.');
    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
  });

  if (writeAccess) {
    server.registerTool('create_project', {
      title: 'Create a plan-authorized project',
      description: 'Create a website, web app, or SaaS project under the authenticated user account. Enforces the current LeonardX plan project-type and project-count limits. Requires the user to approve the write and confirm=true. Does not call Leo AI or use Leo AI credits.',
      inputSchema: {
        name: z.string().trim().min(2).max(120),
        project_type: z.enum(['website', 'web_app', 'saas']),
        confirm: z.literal(true).describe('Set true only after the user explicitly approves creating this project.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    }, async ({ name, project_type }) => {
      const { data, error } = await projects.createProject(userId, name, project_type);
      if (error) return toolError(typeof error === 'string' ? error : 'Project creation failed or is not allowed by the current plan.');
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    });

    server.registerTool('rename_project', {
      title: 'Rename a project',
      description: 'Rename a project owned by the authenticated account. Requires user approval and confirm=true. Does not change project type or plan limits.',
      inputSchema: {
        project_id: z.string().uuid(),
        name: z.string().trim().min(2).max(120),
        confirm: z.literal(true).describe('Set true only after the user explicitly approves the rename.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    }, async ({ project_id, name }) => {
      const { data, error } = await projects.renameProject(userId, project_id, name);
      if (error) return toolError('Project could not be renamed. Check that it belongs to your account.');
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    });

    server.registerTool('save_project_files', {
      title: 'Save AI-generated project files',
      description: 'Save source files supplied by the connected AI into an owned LeonardX project workspace. The connected client AI should generate the code and pass it here; this tool does not call Leo AI or consume Leo AI credits. Requires user approval and confirm=true. File paths and size are validated.',
      inputSchema: {
        project_id: z.string().uuid(),
        files: z.record(z.string(), z.string()),
        confirm: z.literal(true).describe('Set true only after the user explicitly approves saving these files.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    }, async ({ project_id, files }) => {
      const { data, error } = await projects.saveProjectFiles(userId, project_id, files);
      if (error) return toolError(typeof error === 'string' ? error : 'Files could not be saved. Check ownership, file paths, and size limits.');
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    });

    server.registerTool('build_and_deploy_project', {
      title: 'Build and deploy supplied project code',
      description: 'Deploy code files generated by the connected AI model to LeonardX’s configured GitHub/Vercel infrastructure. Does not invoke Leo AI or consume Leo AI credits. Enforces LeonardX project-type access and monthly build limits. Deployment starts the existing free hosting trial; the site may be suspended after it expires unless renewed through the account flow. No payment or renewal is performed by this tool. Deployment is a production change: call only after explicit user approval and set confirm=true. Return the liveUrl from the result only after this tool confirms success; it is the verified, publicly reachable main project domain. Never substitute a Vercel deployment-specific preview URL. If no public main domain is verified, report the tool error instead of inventing or returning a fallback link.',
      inputSchema: {
        project_id: z.string().uuid(),
        brief: z.string().trim().min(1).max(6000),
        files: z.array(z.object({ path: z.string().min(1).max(240), content: z.string().max(256_000) })).min(1).max(250),
        confirm: z.literal(true).describe('Set true only after the user explicitly approves production deployment.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    }, async ({ project_id, brief, files }) => {
      const { data, error } = await projects.buildAndDeploy(userId, project_id, brief, files);
      if (error) return toolError(typeof error === 'string' ? error : 'Build/deployment failed or is not permitted by the current plan.');
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    });
  }
  return server;
}

export async function handleUserMcpRequest(request: Request, userId: string, scopes: string[], projects: McpProjectReader) {
  const server = createUserMcpServer(userId, scopes, projects);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: 2_100_000,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}
