import type { ProjectType } from '../pricing.ts';
import { getAndroidBuildCapabilities } from '../android-build.ts';

export type ApplicationCapability = {
  id: string;
  category: string;
  projectType: ProjectType | null;
  frameworks: string[];
  generator: 'registered_starter' | 'external_model_source' | 'none';
  buildAdapter: string | null;
  buildMode: 'provider_async' | 'async_worker' | 'request_sync' | 'none';
  status: 'available' | 'partially_available' | 'unavailable';
  configured: boolean;
  requirements: string[];
  limitations: string[];
};

function configured(env: NodeJS.ProcessEnv, names: string[]) {
  return names.every((name) => Boolean(env[name]?.trim()));
}

/** Reports implemented adapters and explicit boundaries; it never treats a project type as proof of a build adapter. */
export function getApplicationCapabilities(env: NodeJS.ProcessEnv = process.env): ApplicationCapability[] {
  const webConfigured = configured(env, ['GITHUB_TOKEN', 'VERCEL_TOKEN']);
  const expoConfigured = configured(env, ['EXPO_TOKEN']);
  const godotConfigured = configured(env, ['GODOT_BUILD_SERVICE_URL', 'GODOT_BUILD_SERVICE_TOKEN']);
  const runnerConfigured = configured(env, ['REPOSITORY_RUNNER_URL', 'RUNNER_HMAC_SECRET']);
  const androidToolchain = getAndroidBuildCapabilities(env);
  const androidStorageConfigured = configured(env, ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  const androidWorkerConfigured = env.ANDROID_BUILD_WORKER_ENABLED === 'true' && Boolean(env.ANDROID_BUILD_WORKER_SECRET?.trim());
  return [
    {
      id: 'web-nextjs-vercel', category: 'web_application', projectType: 'website', frameworks: ['Next.js'],
      generator: 'external_model_source', buildAdapter: 'GitHub + Vercel', buildMode: 'request_sync',
      status: 'partially_available', configured: webConfigured,
      requirements: ['MCP write scope', 'owner supplied/generated source files', 'GITHUB_TOKEN', 'VERCEL_TOKEN'],
      limitations: ['No dedicated website template registry yet.', 'Build and deployment run inside the HTTP request.', 'Live deployment health must be confirmed by provider state.'],
    },
    {
      id: 'saas-nextjs-vercel', category: 'saas', projectType: 'saas', frameworks: ['Next.js'],
      generator: 'external_model_source', buildAdapter: 'GitHub + Vercel', buildMode: 'request_sync',
      status: 'partially_available', configured: webConfigured,
      requirements: ['MCP write scope', 'owner supplied/generated source files', 'GITHUB_TOKEN', 'VERCEL_TOKEN'],
      limitations: ['No dedicated SaaS scaffold or database provisioning adapter.', 'Authentication, billing, migrations, and tenant isolation must be implemented and verified per project.', 'Build and deployment run inside the HTTP request.'],
    },
    {
      id: 'mobile-expo-eas', category: 'mobile_application', projectType: 'mobile_app', frameworks: ['Expo', 'React Native'],
      generator: 'registered_starter', buildAdapter: 'Expo EAS', buildMode: 'provider_async',
      status: 'partially_available', configured: expoConfigured,
      requirements: ['MCP write scope', 'EXPO_TOKEN with EAS project-creation permission', 'eligible mobile-app plan'],
      limitations: ['No native Kotlin or Java generator.', 'Expo account access and signing credentials remain provider-managed.', 'Verified artifacts are owner-scoped in private storage for 30 days.'],
    },
    {
      id: 'game-godot', category: 'game', projectType: 'game', frameworks: ['Godot 4'],
      generator: 'registered_starter', buildAdapter: 'Godot build service', buildMode: 'provider_async',
      status: 'partially_available', configured: godotConfigured,
      requirements: ['MCP write scope', 'Godot build service URL and token', 'eligible export preset', 'eligible plan'],
      limitations: ['Registered starters cover selected single-player prototypes.', 'Multiplayer and arbitrary engine exports are not implemented.', 'Build service readiness and artifact download must be checked per job.'],
    },
    {
      id: 'backend-api-nextjs', category: 'backend_api', projectType: 'web_app', frameworks: ['Next.js Route Handlers'],
      generator: 'external_model_source', buildAdapter: 'GitHub + Vercel', buildMode: 'request_sync',
      status: 'partially_available', configured: webConfigured,
      requirements: ['MCP write scope', 'owner supplied/generated source files', 'GITHUB_TOKEN', 'VERCEL_TOKEN'],
      limitations: ['No separate REST or GraphQL generator registry.', 'Database provisioning is not automated.', 'Build and deployment run inside the HTTP request.'],
    },
    {
      id: 'ecommerce', category: 'ecommerce', projectType: 'saas', frameworks: ['Next.js'],
      generator: 'external_model_source', buildAdapter: 'GitHub + Vercel', buildMode: 'request_sync',
      status: 'partially_available', configured: webConfigured,
      requirements: ['MCP write scope', 'owner supplied/generated source files', 'GITHUB_TOKEN', 'VERCEL_TOKEN'],
      limitations: ['No ecommerce-specific generator, payment adapter, inventory service, or order-management adapter is registered.'],
    },
    {
      id: 'repository-operations', category: 'project_validation', projectType: null, frameworks: ['Runner-supported project manifests'],
      generator: 'none', buildAdapter: 'Isolated repository runner', buildMode: 'request_sync',
      status: runnerConfigured ? 'partially_available' : 'unavailable', configured: runnerConfigured,
      requirements: ['MCP write scope', 'REPOSITORY_RUNNER_URL', 'RUNNER_HMAC_SECRET'],
      limitations: ['Runner operations are submitted synchronously and can time out.', 'Supported commands depend on the separately deployed runner image.'],
    },
    {
      id: 'android-native', category: 'mobile_application', projectType: 'mobile_app', frameworks: ['Java', 'Android Gradle Plugin'],
      generator: 'registered_starter', buildAdapter: 'Leased Gradle debug APK worker + private Supabase storage', buildMode: 'async_worker',
      status: androidToolchain.buildable && androidStorageConfigured && androidWorkerConfigured ? 'partially_available' : 'unavailable',
      configured: androidToolchain.buildable && androidStorageConfigured && androidWorkerConfigured,
      requirements: [...androidToolchain.missing, ...(!androidStorageConfigured ? ['Supabase private artifact storage and applied Android artifact migration'] : []), ...(!androidWorkerConfigured ? ['ANDROID_BUILD_WORKER_ENABLED=true and a 32+ character ANDROID_BUILD_WORKER_SECRET'] : []), 'A trusted scheduler must invoke POST /api/workers/android-build', 'MCP write scope', 'eligible mobile-app plan'],
      limitations: ['The registered Java calculator starter is wired to an owner-scoped asynchronous build/status/download workflow.', 'The database lease recovers jobs after worker restart; it reruns the Gradle build from saved project files rather than resuming Gradle internals.', 'Only the calculator starter is registered for native Android; arbitrary Android project builds are not yet exposed.'],
    },
    {
      id: 'python-api', category: 'backend_api', projectType: null, frameworks: ['Python'],
      generator: 'none', buildAdapter: null, buildMode: 'none', status: 'unavailable', configured: false,
      requirements: ['Python project generator and isolated Python build adapter'],
      limitations: ['Python generation and build workflows are not integrated into the MCP project pipeline.'],
    },
    {
      id: 'desktop', category: 'desktop_application', projectType: null, frameworks: ['Electron', 'Tauri'],
      generator: 'none', buildAdapter: null, buildMode: 'none', status: 'unavailable', configured: false,
      requirements: ['A supported desktop generator, isolated packaging adapter, and artifact storage'],
      limitations: ['Electron and Tauri project generation and packaging are not implemented.'],
    },
  ];
}
