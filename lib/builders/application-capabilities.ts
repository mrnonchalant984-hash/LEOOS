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
  const runnerConfigured = configured(env, ['REPOSITORY_RUNNER_URL', 'RUNNER_HMAC_SECRET']);
  const androidToolchain = getAndroidBuildCapabilities(env);
  const androidStorageConfigured = configured(env, ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  // Hosted GitHub Actions runs the toolchain outside Vercel; this explicit flag is an
  // operator assertion that the workflow is on the default branch and its secrets are configured.
  const androidHostedWorkerConfigured = env.ANDROID_HOSTED_WORKER_ENABLED?.trim() === 'true';
  const androidServerlessWorkerConfigured = env.ANDROID_BUILD_WORKER_ENABLED?.trim() === 'true'
    && Boolean(env.ANDROID_BUILD_WORKER_SECRET?.trim() && env.ANDROID_BUILD_WORKER_SECRET.trim().length >= 32)
    && androidToolchain.buildable;
  const androidWorkerConfigured = androidHostedWorkerConfigured || androidServerlessWorkerConfigured;
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
      id: 'game-browser-native', category: 'game', projectType: 'game', frameworks: ['HTML5 Canvas', 'Three.js/WebGL'],
      generator: 'registered_starter', buildAdapter: 'Sandboxed browser preview + static ZIP export', buildMode: 'none',
      status: 'partially_available', configured: true,
      requirements: ['MCP write scope or authenticated Studio session', 'eligible game-project plan', 'saved index.html entry point'],
      limitations: ['The starter generator covers several 2D genres and a Three.js 3D racing/exploration starter; arbitrary custom mechanics require AI-generated project source.', 'A real browser QA run and static hosting publication must be verified separately.', 'Three.js starters load the runtime from jsDelivr unless bundled locally.'],
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
      status: androidStorageConfigured && androidWorkerConfigured ? 'partially_available' : 'unavailable',
      configured: androidStorageConfigured && androidWorkerConfigured,
      requirements: [
        ...(!androidHostedWorkerConfigured && !androidServerlessWorkerConfigured ? [
          'Either enable the GitHub Actions Android queue workflow with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY secrets and set ANDROID_HOSTED_WORKER_ENABLED=true, or provide Java/Gradle/Android SDK plus ANDROID_BUILD_WORKER_ENABLED=true and a 32+ character ANDROID_BUILD_WORKER_SECRET on a compatible self-hosted runtime.',
        ] : []),
        ...(!androidStorageConfigured ? ['Supabase private artifact storage and applied Android artifact migrations'] : []),
        'MCP write scope', 'eligible mobile-app plan',
      ],
      limitations: ['The hosted-worker flag is an operator declaration, not a live GitHub Actions health check; verify the workflow run history and job row before claiming worker health.', 'The database lease recovers jobs after worker restart; it reruns the Gradle build from saved project files unless a previously uploaded, verified APK can be recovered.', 'Only the calculator starter is registered for native Android; arbitrary Android project builds are not yet exposed.'],
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
