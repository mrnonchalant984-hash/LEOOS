import {
  buildApplicableStages,
  type WorkflowApplicabilityInput,
  type WorkflowMode,
  type WorkflowStageId,
} from '../engineering-workflow.ts';

export type OrchestrationRequest = WorkflowApplicabilityInput & {
  projectType: 'website' | 'web_app' | 'saas' | 'mobile_app' | 'game' | 'api';
  budgetTier?: 'free' | 'low' | 'moderate' | 'professional' | 'custom';
};

const stageCapabilities: Partial<Record<WorkflowStageId, string[]>> = {
  REQUIREMENTS_DISCOVERY: ['read_project_files', 'get_capability_alternatives'],
  REPOSITORY_INSPECTION: ['read_project_files', 'get_project_status'],
  PROJECT_STRATEGY: ['get_account_plan', 'get_capability_alternatives'],
  ENVIRONMENT_CONFIGURATION: ['get_configuration_status'],
  INTEGRATION_VALIDATION: ['get_configuration_status'],
  DATABASE_VALIDATION: ['get_project_status'],
  MIGRATION_EXECUTION: ['build_and_deploy_project'],
  AUTOMATED_TESTING: ['get_project_status'],
  PRODUCTION_BUILD: ['get_project_status', 'get_cloud_build_status'],
  DEPLOYMENT: ['build_and_deploy_project', 'start_cloud_build'],
  POST_DEPLOYMENT_VERIFICATION: ['get_project_hosting_status', 'get_cloud_build_status'],
};

const providerByProjectType = {
  mobile_app: 'expo-eas',
  game: 'godot-build-service',
} as const;

export function buildEngineeringOrchestrationPlan(input: OrchestrationRequest) {
  const mode: WorkflowMode = input.mode;
  const stages = buildApplicableStages({ ...input, mode });
  const capabilities = stages.map((stage) => ({
    stage,
    tools: stageCapabilities[stage] || [],
    requiresApproval: stage === 'USER_APPROVAL_WHEN_REQUIRED' || stage === 'MIGRATION_EXECUTION' || stage === 'DEPLOYMENT',
  }));
  const provider = providerByProjectType[input.projectType as keyof typeof providerByProjectType] || null;
  return {
    projectType: input.projectType,
    mode,
    budgetTier: input.budgetTier || 'free',
    orderedStages: stages,
    capabilities,
    provider,
    approvalBoundaries: capabilities.filter((item) => item.requiresApproval).map((item) => item.stage),
    retryPolicy: {
      safeStages: 'Failed or blocked non-destructive stages may be retried after the error is addressed.',
      destructiveStages: 'Migration and deployment retries require a fresh explicit approval and are never assumed safe after execution.',
    },
    limitations: [
      'The connected MCP client supplies code generation and must report real tool results; this plan never invents completion.',
      'Secrets are configured through the secure configuration flow and are never returned by the plan.',
    ],
  };
}
