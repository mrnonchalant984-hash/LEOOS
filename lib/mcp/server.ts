import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { buildEngineeringOrchestrationPlan } from './orchestration.ts';
import { WORKFLOW_STAGE_IDS, type WorkflowStageId, type WorkflowStatus } from '../engineering-workflow.ts';
import { PROJECT_RUNNER_OPERATIONS, type ProjectRunnerOperation } from '../project-runner.ts';
import { getApplicationCapabilities } from '../builders/application-capabilities.ts';

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
  build?: {
    id: string;
    provider: string;
    status: string;
    step: string;
    deployment_id: string | null;
    deployment_url: string | null;
    created_at: string;
    started_at: string;
    completed_at: string | null;
  } | null;
};

export type McpProjectReader = {
  listProjects(userId: string, limit: number): Promise<{ data: McpProject[] | null; error: unknown }>;
  getProject(userId: string, projectId: string): Promise<{ data: McpProject | null; error: unknown }>;
  getProjectFiles?(userId: string, projectId: string, paths?: string[]): Promise<{ data: Record<string, string> | null; error: unknown }>;
  getAccountPlan(userId: string): Promise<{ data: unknown; error: unknown }>;
  createProject(userId: string, name: string, projectType: 'website' | 'web_app' | 'saas' | 'mobile_app' | 'game'): Promise<{ data: unknown; error: unknown }>;
  renameProject(userId: string, projectId: string, name: string): Promise<{ data: unknown; error: unknown }>;
  getHostingStatus(userId: string, projectId: string): Promise<{ data: unknown; error: unknown }>;
  saveProjectFiles(userId: string, projectId: string, files: Record<string, string>): Promise<{ data: unknown; error: unknown }>;
  buildAndDeploy(userId: string, projectId: string, brief: string, files: Array<{ path: string; content: string }>, idempotencyKey?: string): Promise<{ data: unknown; error: unknown }>;
  getConfigurationStatus?(userId: string, target?: 'development' | 'preview' | 'production'): Promise<{ data: unknown; error: unknown }>;
  getEngineeringWorkflowStatus?(userId: string, workflowId?: string): Promise<{ data: unknown; error: unknown }>;
  getCapabilityAlternatives?(userId: string, budget?: string): Promise<{ data: unknown; error: unknown }>;
  planEngineeringWorkflow?(userId: string, input: Parameters<typeof buildEngineeringOrchestrationPlan>[0]): Promise<{ data: unknown; error: unknown }>;
  createEngineeringWorkflow?(userId: string, input: {
    title: string;
    mode: 'discovery' | 'autonomous';
    applicability: Parameters<typeof buildEngineeringOrchestrationPlan>[0];
    project_id?: string;
    budget_tier?: string;
  }): Promise<{ data: unknown; error: unknown }>;
  advanceEngineeringWorkflow?(userId: string, input: {
    workflow_id: string;
    stage_id: WorkflowStageId;
    status: WorkflowStatus;
    progress_message?: string;
    artifacts?: Record<string, unknown>;
    error?: { code: string; message: string };
    confirm?: true;
  }): Promise<{ data: unknown; error: unknown }>;
  cancelEngineeringWorkflow?(userId: string, workflowId: string): Promise<{ data: unknown; error: unknown }>;
  runProjectOperation?(userId: string, projectId: string, operation: ProjectRunnerOperation): Promise<{ data: unknown; error: unknown }>;
  retryCloudBuild?(userId: string, provider: 'expo-eas' | 'godot-build-service', jobId: string): Promise<{ data: unknown; error: unknown }>;
  submitCloudBuild?(userId: string, input: {
    project_id: string;
    provider: 'expo-eas' | 'godot-build-service';
    platform?: 'android' | 'ios';
    profile?: 'preview' | 'production';
    preset?: string;
    idempotency_key: string;
  }): Promise<{ data: unknown; error: unknown }>;
  getCloudBuildStatus?(userId: string, provider: 'expo-eas' | 'godot-build-service', jobId: string): Promise<{ data: unknown; error: unknown }>;
  getAndroidBuildCapabilities?(): Promise<{ data: unknown; error: unknown }>;
  buildAndroidCalculator?(userId: string, idempotencyKey: string): Promise<{ data: unknown; error: unknown }>;
  getAndroidBuildStatus?(userId: string, jobId: string): Promise<{ data: unknown; error: unknown }>;
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
  server.registerTool('read_project_files', {
    title: 'Read files from my project workspace',
    description: 'Read source files from a project owned by the authenticated account so the connected model can continue editing it. Environment, key, dependency, and generated files are excluded. Use the optional paths filter to request only files relevant to the change.',
    inputSchema: { project_id: z.string().uuid(), paths: z.array(z.string().min(1).max(240)).max(100).optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ project_id, paths }) => {
    if (!projects.getProjectFiles) return toolError('Project file reading is unavailable in this MCP deployment.');
    const { data, error } = await projects.getProjectFiles(userId, project_id, paths);
    if (error) return toolError('Project files could not be loaded. Check that the project belongs to this account.');
    if (!data) return toolError('Project not found.');
    return { content: [{ type: 'text', text: JSON.stringify({ project_id, files: data }) }] };
  });
  server.registerTool('get_cloud_build_status', {
    title: 'Get mobile or game build status',
    description: 'Read a cloud build owned by the authenticated account. Returns provider status and an owner-authorized artifact URL when one is available; does not expose credentials.',
    inputSchema: { provider: z.enum(['expo-eas', 'godot-build-service']), job_id: z.string().uuid() },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ provider, job_id }) => {
    if (!projects.getCloudBuildStatus) return toolError('Cloud build status is unavailable in this MCP deployment.');
    const { data, error } = await projects.getCloudBuildStatus(userId, provider, job_id);
    if (error) return toolError(typeof error === 'string' ? error : 'Cloud build status could not be loaded.');
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
  server.registerTool('get_configuration_status', {
    title: 'Get secure configuration status',
    description: 'Read whether LeonardX catalog environment variables are configured for a target environment. Returns names and metadata only — never secret values. Prefer the secure configuration UI for credential submission.',
    inputSchema: { target: z.enum(['development', 'preview', 'production']).optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ target }) => {
    if (!projects.getConfigurationStatus) return toolError('Configuration status is unavailable in this MCP deployment.');
    const { data, error } = await projects.getConfigurationStatus(userId, target);
    if (error) return toolError('Configuration status could not be loaded.');
    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
  });
  server.registerTool('get_engineering_workflow_status', {
    title: 'Get engineering workflow status',
    description: 'Read the durable autonomous engineering workflow status for the authenticated user, including stage progress backed by persisted events. Does not invent progress percentages.',
    inputSchema: { workflow_id: z.string().uuid().optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ workflow_id }) => {
    if (!projects.getEngineeringWorkflowStatus) return toolError('Engineering workflow status is unavailable in this MCP deployment.');
    const { data, error } = await projects.getEngineeringWorkflowStatus(userId, workflow_id);
    if (error) return toolError('Engineering workflow status could not be loaded.');
    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
  });
  server.registerTool('get_capability_alternatives', {
    title: 'Explore budget-aware capability alternatives',
    description: 'List free and paid alternatives for LeonardX capabilities such as contact forms, AI inference, payments, and hosting. Does not purchase services or expose credentials.',
    inputSchema: { budget: z.enum(['free', 'low', 'moderate', 'professional', 'custom']).optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ budget }) => {
    if (!projects.getCapabilityAlternatives) return toolError('Capability alternatives are unavailable in this MCP deployment.');
    const { data, error } = await projects.getCapabilityAlternatives(userId, budget);
    if (error) return toolError('Capability alternatives could not be loaded.');
    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
  });
  server.registerTool('discover_application_capabilities', {
    title: 'Discover supported application generators and build adapters',
    description: 'Read the application categories, registered starter generators, build adapters, configuration requirements, and known limitations available in this LeonardX deployment. Partial or unavailable support is reported explicitly; discovery does not create a project or claim a build is verified.',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async () => ({ content: [{ type: 'text', text: JSON.stringify({ capabilities: getApplicationCapabilities() }) }] }));
  server.registerTool('get_android_build_capabilities', {
    title: 'Check local Android APK build readiness',
    description: 'Read whether this LeonardX deployment has Java, Gradle, and the Android SDK needed for a real debug APK. This never claims a build succeeded and never exposes secrets.',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async () => {
    if (!projects.getAndroidBuildCapabilities) return toolError('Android build capability reporting is unavailable in this deployment.');
    const result = await projects.getAndroidBuildCapabilities();
    if (result.error) return toolError('Android build capability check failed.');
    return { content: [{ type: 'text', text: JSON.stringify(result.data) }] };
  });
  server.registerTool('get_android_build_status', {
    title: 'Get Android APK build status',
      description: 'Read the persisted status, progress, and retry attempt of an Android calculator build owned by the authenticated account. Returns a download endpoint only for a completed artifact.',
    inputSchema: { job_id: z.string().uuid() },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ job_id }) => {
    if (!projects.getAndroidBuildStatus) return toolError('Android build status is unavailable in this deployment.');
    const result = await projects.getAndroidBuildStatus(userId, job_id);
    if (result.error) return toolError(typeof result.error === 'string' ? result.error : 'Android build status could not be loaded.');
    return { content: [{ type: 'text', text: JSON.stringify(result.data) }] };
  });
  server.registerTool('plan_engineering_workflow', {
    title: 'Plan an ordered engineering workflow',
    description: 'Read-only orchestration planning for web, SaaS, mobile, game, API, database, testing, and deployment work. Returns applicable stages, the existing LeonardX tools that can perform each stage, provider selection, approval boundaries, and retry rules. It does not modify files, call providers, or claim that work is complete.',
    inputSchema: {
      project_type: z.enum(['website', 'web_app', 'saas', 'mobile_app', 'game', 'api']),
      mode: z.enum(['discovery', 'autonomous']).default('autonomous'),
      has_repository: z.boolean().default(false),
      needs_database: z.boolean().default(false),
      needs_migrations: z.boolean().default(false),
      needs_deployment: z.boolean().default(false),
      needs_environment_config: z.boolean().default(false),
      needs_integrations: z.boolean().default(false),
      requires_user_approval: z.boolean().default(true),
      budget_tier: z.enum(['free', 'low', 'moderate', 'professional', 'custom']).optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async (input) => {
    const orchestrationInput = {
      projectType: input.project_type,
      mode: input.mode,
      hasRepository: input.has_repository,
      needsDatabase: input.needs_database,
      needsMigrations: input.needs_migrations,
      needsDeployment: input.needs_deployment,
      needsEnvironmentConfig: input.needs_environment_config,
      needsIntegrations: input.needs_integrations,
      requiresUserApproval: input.requires_user_approval,
      budgetTier: input.budget_tier,
    } as const;
    if (projects.planEngineeringWorkflow) {
      const result = await projects.planEngineeringWorkflow(userId, orchestrationInput);
      if (result.error) return toolError('Engineering workflow plan could not be created.');
      return { content: [{ type: 'text', text: JSON.stringify(result.data) }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify(buildEngineeringOrchestrationPlan(orchestrationInput)) }] };
  });
  if (writeAccess) {
    server.registerTool('build_android_calculator', {
      title: 'Create and build the Android calculator APK',
        description: 'Create a functional Java calculator project and enqueue a durable Android debug build. A separately scheduled, authenticated worker runs Gradle, validates and stores the APK privately, then status reports its owner-authorized download URL and SHA-256. Requires the Android worker, toolchain, private Supabase storage, and migration configured on the LeonardX server. Reuse idempotency_key for retries. Requires explicit user approval and confirm=true.',
      inputSchema: {
        idempotency_key: z.string().uuid(),
        confirm: z.literal(true).describe('Set true only after the user explicitly approves creating a project and starting an Android build.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    }, async ({ idempotency_key }) => {
      if (!projects.buildAndroidCalculator) return toolError('Android calculator builds are unavailable in this deployment.');
      const result = await projects.buildAndroidCalculator(userId, idempotency_key);
      if (result.error) return toolError(typeof result.error === 'string' ? result.error : 'Android calculator build failed.');
      return { content: [{ type: 'text', text: JSON.stringify(result.data) }] };
    });
    server.registerTool('run_project_operation', {
      title: 'Install dependencies or run project validation',
      description: 'Run one bounded operation in the authenticated project workspace using the isolated no-network runner: install, test, typecheck, lint, or build. Returns the real runner result and job ID; it never reports success when the runner is unavailable. Requires write scope and confirm=true.',
      inputSchema: {
        project_id: z.string().uuid(),
        operation: z.enum(PROJECT_RUNNER_OPERATIONS),
        confirm: z.literal(true),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    }, async ({ project_id, operation }) => {
      if (!projects.runProjectOperation) return toolError('Project operations are unavailable in this MCP deployment.');
      const result = await projects.runProjectOperation(userId, project_id, operation);
      if (result.error) return toolError(typeof result.error === 'string' ? result.error : 'The project operation failed.');
      return { content: [{ type: 'text', text: JSON.stringify(result.data) }] };
    });

    server.registerTool('create_engineering_workflow', {
      title: 'Create a durable engineering workflow',
      description: 'Persist an ordered LeonardX engineering workflow for the authenticated account. This creates state only; it does not edit files, apply migrations, spend provider credits, or deploy. Requires explicit user approval and confirm=true.',
      inputSchema: {
        title: z.string().trim().min(2).max(160),
        project_id: z.string().uuid().optional(),
        mode: z.enum(['discovery', 'autonomous']),
        applicability: z.object({
          projectType: z.enum(['website', 'web_app', 'saas', 'mobile_app', 'game', 'api']),
          mode: z.enum(['discovery', 'autonomous']),
          hasRepository: z.boolean(),
          needsDatabase: z.boolean(),
          needsMigrations: z.boolean(),
          needsDeployment: z.boolean(),
          needsEnvironmentConfig: z.boolean(),
          needsIntegrations: z.boolean(),
          requiresUserApproval: z.boolean(),
          budgetTier: z.enum(['free', 'low', 'moderate', 'professional', 'custom']).optional(),
        }),
        budget_tier: z.string().trim().max(32).optional(),
        confirm: z.literal(true),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    }, async ({ title, project_id, mode, applicability, budget_tier }) => {
      if (!projects.createEngineeringWorkflow) return toolError('Engineering workflow creation is unavailable in this MCP deployment.');
      const result = await projects.createEngineeringWorkflow(userId, { title, project_id, mode, applicability, budget_tier });
      if (result.error) return toolError(typeof result.error === 'string' ? result.error : 'Engineering workflow could not be created.');
      return { content: [{ type: 'text', text: JSON.stringify(result.data) }] };
    });

    server.registerTool('advance_engineering_workflow', {
      title: 'Advance one engineering workflow stage',
      description: 'Persist the real result of exactly one current workflow stage. The server rejects skipped or out-of-order stages. Migration and deployment completion require confirm=true and a real external result; reuse the same workflow and stage when safely retrying.',
      inputSchema: {
        workflow_id: z.string().uuid(),
        stage_id: z.string().refine((value): value is WorkflowStageId => WORKFLOW_STAGE_IDS.includes(value as WorkflowStageId)),
        status: z.enum(['RUNNING', 'WAITING_FOR_USER', 'COMPLETED', 'FAILED', 'BLOCKED']),
        progress_message: z.string().trim().max(1000).optional(),
        artifacts: z.record(z.string(), z.unknown()).optional(),
        error: z.object({ code: z.string().trim().min(1).max(80), message: z.string().trim().min(1).max(1000) }).optional(),
        confirm: z.literal(true).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    }, async ({ workflow_id, stage_id, status, progress_message, artifacts, error, confirm }) => {
      if (!projects.advanceEngineeringWorkflow) return toolError('Engineering workflow advancement is unavailable in this MCP deployment.');
      const result = await projects.advanceEngineeringWorkflow(userId, {
        workflow_id, stage_id, status, progress_message, artifacts, error, confirm,
      });
      if (result.error) return toolError(typeof result.error === 'string' ? result.error : 'Engineering workflow stage could not be advanced.');
      return { content: [{ type: 'text', text: JSON.stringify(result.data) }] };
    });

    server.registerTool('cancel_engineering_workflow', {
      title: 'Cancel an engineering workflow',
      description: 'Cancel a persisted workflow owned by the authenticated account. Completed stages are retained for audit; no external provider operation is reversed. Requires explicit user approval and confirm=true.',
      inputSchema: { workflow_id: z.string().uuid(), confirm: z.literal(true) },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    }, async ({ workflow_id }) => {
      if (!projects.cancelEngineeringWorkflow) return toolError('Engineering workflow cancellation is unavailable in this MCP deployment.');
      const result = await projects.cancelEngineeringWorkflow(userId, workflow_id);
      if (result.error) return toolError(typeof result.error === 'string' ? result.error : 'Engineering workflow could not be cancelled.');
      return { content: [{ type: 'text', text: JSON.stringify(result.data) }] };
    });

    server.registerTool('start_cloud_build', {
      title: 'Start a mobile or Godot cloud build',
      description: 'Submit an existing, owned mobile_app or game project to its configured provider. This consumes one existing monthly build allowance and may incur separate Expo/provider fees. Requires explicit user approval and confirm=true. Reuse the same idempotency_key when retrying an uncertain request.',
      inputSchema: {
        project_id: z.string().uuid(),
        provider: z.enum(['expo-eas', 'godot-build-service']),
        platform: z.enum(['android', 'ios']).optional(),
        profile: z.enum(['preview', 'production']).optional(),
        preset: z.string().trim().min(1).max(80).optional(),
        idempotency_key: z.string().uuid(),
        confirm: z.literal(true).describe('Set true only after the user explicitly approves using a monthly build and the external provider.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    }, async ({ project_id, provider, platform, profile, preset, idempotency_key }) => {
      if (!projects.submitCloudBuild) return toolError('Cloud build submission is unavailable in this MCP deployment.');
      const { data, error } = await projects.submitCloudBuild(userId, { project_id, provider, platform, profile, preset, idempotency_key });
      if (error) return toolError(typeof error === 'string' ? error : 'Cloud build could not be submitted.');
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    });

    server.registerTool('retry_cloud_build', {
      title: 'Retry a failed cloud build safely',
      description: 'Retry a failed Expo or Godot cloud build only when LeonardX can verify the previous job has no unresolved provider job. Creates a new idempotent build request and preserves the original job for audit. Requires explicit approval and confirm=true.',
      inputSchema: {
        provider: z.enum(['expo-eas', 'godot-build-service']),
        job_id: z.string().uuid(),
        confirm: z.literal(true),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    }, async ({ provider, job_id }) => {
      if (!projects.retryCloudBuild) return toolError('Cloud build retry is unavailable in this MCP deployment.');
      const result = await projects.retryCloudBuild(userId, provider, job_id);
      if (result.error) return toolError(typeof result.error === 'string' ? result.error : 'Cloud build retry failed.');
      return { content: [{ type: 'text', text: JSON.stringify(result.data) }] };
    });

    server.registerTool('create_project', {
      title: 'Create a plan-authorized project',
      description: 'Create a website, web app, or SaaS project under the authenticated user account. Enforces the current LeonardX plan project-type and project-count limits. Requires the user to approve the write and confirm=true. Does not call Leo AI or use Leo AI credits.',
      inputSchema: {
        name: z.string().trim().min(2).max(120),
        project_type: z.enum(['website', 'web_app', 'saas', 'mobile_app', 'game']),
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
    description: 'Deploy code files generated by the connected AI model to LeonardX’s configured GitHub/Vercel infrastructure. Does not invoke Leo AI or consume Leo AI credits. Enforces LeonardX project-type access and monthly build limits. Deployment starts the existing free hosting trial; the site may be suspended after it expires unless renewed through the account flow. No payment or renewal is performed by this tool. Deployment is a production change: call only after explicit user approval and set confirm=true. Reuse the same idempotency_key when retrying an uncertain request; use a new key only after checking the earlier job status. Without a key, identical project requests are deduplicated by request content. Return the liveUrl only after the tool confirms success; it must be the verified, publicly reachable main project domain. Never substitute a Vercel deployment-specific preview URL. If no public main domain is verified, report the tool error instead of inventing or returning a fallback link.',
      inputSchema: {
        project_id: z.string().uuid(),
        brief: z.string().trim().min(1).max(6000),
        files: z.array(z.object({ path: z.string().min(1).max(240), content: z.string().max(256_000) })).min(1).max(250),
        idempotency_key: z.string().uuid().optional().describe('Reuse this UUID to safely identify retries of the same deployment request.'),
        confirm: z.literal(true).describe('Set true only after the user explicitly approves production deployment.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    }, async ({ project_id, brief, files, idempotency_key }) => {
      const { data, error } = idempotency_key
        ? await projects.buildAndDeploy(userId, project_id, brief, files, idempotency_key)
        : await projects.buildAndDeploy(userId, project_id, brief, files);
      if (error) return toolError(typeof error === 'string' ? error : JSON.stringify(error));
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
