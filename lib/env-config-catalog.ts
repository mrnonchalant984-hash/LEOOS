/**
 * Environment configuration catalog derived from LeonardX integrations.
 * Status metadata never includes secret values.
 */

export type EnvTarget = 'development' | 'preview' | 'production';

export type EnvVariableDefinition = {
  name: string;
  purpose: string;
  required: boolean;
  service: string;
  public: boolean;
  targets: EnvTarget[];
  restartRequired: boolean;
};

export type EnvVariableStatus = EnvVariableDefinition & {
  configured: boolean;
  validationStatus: 'unknown' | 'valid' | 'invalid' | 'missing';
  connectionTestStatus: 'not_run' | 'passed' | 'failed' | 'unavailable';
  message: string;
};

/** Catalog built from existing LeonardX providers — not a generic universal list. */
export const LEONARDX_ENV_CATALOG: EnvVariableDefinition[] = [
  {
    name: 'NEXT_PUBLIC_SUPABASE_URL',
    purpose: 'Supabase project URL for auth and data access.',
    required: true,
    service: 'supabase',
    public: true,
    targets: ['development', 'preview', 'production'],
    restartRequired: true,
  },
  {
    name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    purpose: 'Public Supabase anon key used by the browser client.',
    required: true,
    service: 'supabase',
    public: true,
    targets: ['development', 'preview', 'production'],
    restartRequired: true,
  },
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    purpose: 'Server-only Supabase service role for trusted backend operations.',
    required: true,
    service: 'supabase',
    public: false,
    targets: ['development', 'preview', 'production'],
    restartRequired: true,
  },
  {
    name: 'ANDROID_HOSTED_WORKER_ENABLED',
    purpose: 'Operator declaration that the GitHub Actions Android queue workflow and its Supabase secrets are configured; not a live health check.',
    required: false,
    service: 'android-build',
    public: false,
    targets: ['preview', 'production'],
    restartRequired: true,
  },
  {
    name: 'OPENAI_API_KEY',
    purpose: 'Hosted OpenAI inference for Leo and generation features.',
    required: false,
    service: 'openai',
    public: false,
    targets: ['development', 'preview', 'production'],
    restartRequired: false,
  },
  {
    name: 'ANTHROPIC_API_KEY',
    purpose: 'Optional Anthropic provider for multi-model routing.',
    required: false,
    service: 'anthropic',
    public: false,
    targets: ['development', 'preview', 'production'],
    restartRequired: false,
  },
  {
    name: 'GEMINI_API_KEY',
    purpose: 'Optional Google Gemini provider for multi-model routing.',
    required: false,
    service: 'google',
    public: false,
    targets: ['development', 'preview', 'production'],
    restartRequired: false,
  },
  {
    name: 'VERCEL_TOKEN',
    purpose: 'Vercel API token for deployment and environment configuration.',
    required: false,
    service: 'vercel',
    public: false,
    targets: ['development', 'preview', 'production'],
    restartRequired: false,
  },
  {
    name: 'VERCEL_TEAM_ID',
    purpose: 'Optional Vercel team scope for project operations.',
    required: false,
    service: 'vercel',
    public: false,
    targets: ['development', 'preview', 'production'],
    restartRequired: false,
  },
  {
    name: 'GITHUB_TOKEN',
    purpose: 'GitHub token for repository creation and source operations.',
    required: false,
    service: 'github',
    public: false,
    targets: ['development', 'preview', 'production'],
    restartRequired: false,
  },
  {
    name: 'EXPO_TOKEN',
    purpose: 'Server-side EAS CLI token with permission to create projects and submit builds. Never expose it to browser code.',
    required: false,
    service: 'expo-eas',
    public: false,
    targets: ['preview', 'production'],
    restartRequired: true,
  },
  {
    name: 'EXPO_ACCOUNT_NAME',
    purpose: 'Optional Expo account selected for automatic project provisioning when the token can manage multiple accounts.',
    required: false,
    service: 'expo-eas',
    public: false,
    targets: ['preview', 'production'],
    restartRequired: true,
  },
  {
    name: 'LEONARDX_MOBILE_APP_PLANS',
    purpose: 'Owner-approved higher-tier project entitlements, such as pro,business. Standard is always excluded.',
    required: false,
    service: 'billing-entitlements',
    public: false,
    targets: ['preview', 'production'],
    restartRequired: true,
  },
  {
    name: 'LEONARDX_GAME_PLANS',
    purpose: 'Owner-approved higher-tier game project entitlements, such as pro,business. Standard is always excluded.',
    required: false,
    service: 'billing-entitlements',
    public: false,
    targets: ['preview', 'production'],
    restartRequired: true,
  },
  {
    name: 'GODOT_BUILD_SERVICE_URL',
    purpose: 'Actual HTTPS origin of the deployed private Godot build service.',
    required: false,
    service: 'godot-build-service',
    public: false,
    targets: ['preview', 'production'],
    restartRequired: true,
  },
  {
    name: 'GODOT_BUILD_SERVICE_TOKEN',
    purpose: 'Server-only bearer token shared with the LeonardX Godot build service.',
    required: false,
    service: 'godot-build-service',
    public: false,
    targets: ['preview', 'production'],
    restartRequired: true,
  },
  {
    name: 'PAYSTACK_SECRET_KEY',
    purpose: 'Server-only Paystack secret for payment verification.',
    required: false,
    service: 'paystack',
    public: false,
    targets: ['preview', 'production'],
    restartRequired: false,
  },
  {
    name: 'PAYSTACK_PUBLIC_KEY',
    purpose: 'Paystack public key for client checkout initialization.',
    required: false,
    service: 'paystack',
    public: true,
    targets: ['preview', 'production'],
    restartRequired: false,
  },
  {
    name: 'RESEND_API_KEY',
    purpose: 'Resend API key for transactional email notifications.',
    required: false,
    service: 'resend',
    public: false,
    targets: ['development', 'preview', 'production'],
    restartRequired: false,
  },
  {
    name: 'CONTACT_FROM_EMAIL',
    purpose: 'Verified sender address for contact and lead notifications.',
    required: false,
    service: 'resend',
    public: false,
    targets: ['development', 'preview', 'production'],
    restartRequired: false,
  },
  {
    name: 'NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY',
    purpose: 'Public Web3Forms access key for browser contact submissions.',
    required: false,
    service: 'web3forms',
    public: true,
    targets: ['development', 'preview', 'production'],
    restartRequired: true,
  },
  {
    name: 'SMTP_HOST',
    purpose: 'SMTP host for self-hosted mail delivery.',
    required: false,
    service: 'smtp',
    public: false,
    targets: ['development', 'preview', 'production'],
    restartRequired: false,
  },
  {
    name: 'SMTP_PORT',
    purpose: 'SMTP port (465 implicit TLS or 587 STARTTLS).',
    required: false,
    service: 'smtp',
    public: false,
    targets: ['development', 'preview', 'production'],
    restartRequired: false,
  },
  {
    name: 'SMTP_USER',
    purpose: 'SMTP username.',
    required: false,
    service: 'smtp',
    public: false,
    targets: ['development', 'preview', 'production'],
    restartRequired: false,
  },
  {
    name: 'SMTP_PASS',
    purpose: 'SMTP password.',
    required: false,
    service: 'smtp',
    public: false,
    targets: ['development', 'preview', 'production'],
    restartRequired: false,
  },
  {
    name: 'SMTP_FROM',
    purpose: 'SMTP from address.',
    required: false,
    service: 'smtp',
    public: false,
    targets: ['development', 'preview', 'production'],
    restartRequired: false,
  },
  {
    name: 'OWNER_EMAIL',
    purpose: 'Platform owner identity for admin authorization.',
    required: true,
    service: 'platform',
    public: false,
    targets: ['development', 'preview', 'production'],
    restartRequired: true,
  },
  {
    name: 'MCP_PUBLIC_URL',
    purpose: 'Public HTTPS origin for the LeonardX MCP OAuth resource.',
    required: false,
    service: 'mcp',
    public: false,
    targets: ['preview', 'production'],
    restartRequired: true,
  },
  {
    name: 'MCP_CREDENTIAL_ENCRYPTION_KEY',
    purpose: 'Encryption key for outbound MCP credential storage.',
    required: false,
    service: 'mcp',
    public: false,
    targets: ['preview', 'production'],
    restartRequired: true,
  },
  {
    name: 'SENTRY_DSN',
    purpose: 'Server-side Sentry DSN for error monitoring.',
    required: false,
    service: 'sentry',
    public: false,
    targets: ['preview', 'production'],
    restartRequired: true,
  },
  {
    name: 'CRON_SECRET',
    purpose: 'Shared secret protecting internal cron and worker routes.',
    required: false,
    service: 'platform',
    public: false,
    targets: ['preview', 'production'],
    restartRequired: true,
  },
];

const NAME_PATTERN = /^[A-Z][A-Z0-9_]{1,127}$/;

export function isValidEnvVariableName(name: string): boolean {
  return NAME_PATTERN.test(name);
}

export function redactSecretValue(_value: unknown): string {
  return '[redacted]';
}

export function getEnvCatalogForTarget(target: EnvTarget): EnvVariableDefinition[] {
  return LEONARDX_ENV_CATALOG.filter((item) => item.targets.includes(target));
}

export function resolveEnvPresence(env: NodeJS.ProcessEnv = process.env): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const item of LEONARDX_ENV_CATALOG) {
    map.set(item.name, Boolean(env[item.name]?.trim()));
  }
  return map;
}

export function buildEnvStatusReport(
  target: EnvTarget,
  env: NodeJS.ProcessEnv = process.env,
): EnvVariableStatus[] {
  return getEnvCatalogForTarget(target).map((item) => {
    const configured = Boolean(env[item.name]?.trim());
    return {
      ...item,
      configured,
      validationStatus: configured ? 'valid' : item.required ? 'missing' : 'unknown',
      connectionTestStatus: 'not_run',
      message: configured
        ? 'Configured (value hidden).'
        : item.required
          ? 'Required and missing.'
          : 'Optional and not configured.',
    };
  });
}

export function missingRequiredEnvNames(
  target: EnvTarget,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  return buildEnvStatusReport(target, env)
    .filter((item) => item.required && !item.configured)
    .map((item) => item.name);
}

export function findCatalogEntry(name: string): EnvVariableDefinition | undefined {
  return LEONARDX_ENV_CATALOG.find((item) => item.name === name);
}

export function validateEnvSubmission(input: {
  name: string;
  value: string;
  target: EnvTarget;
}): { ok: true; entry: EnvVariableDefinition } | { ok: false; error: string } {
  if (!isValidEnvVariableName(input.name)) {
    return { ok: false, error: 'Variable name is not valid.' };
  }
  const entry = findCatalogEntry(input.name);
  if (!entry) {
    return { ok: false, error: 'Variable is not in the LeonardX configuration catalog.' };
  }
  if (!entry.targets.includes(input.target)) {
    return { ok: false, error: `Variable is not intended for the ${input.target} environment.` };
  }
  if (typeof input.value !== 'string' || !input.value.trim()) {
    return { ok: false, error: 'A non-empty value is required.' };
  }
  if (input.value.length > 16_384) {
    return { ok: false, error: 'Value exceeds the maximum allowed length.' };
  }
  return { ok: true, entry };
}
