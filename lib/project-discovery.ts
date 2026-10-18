import type { BudgetTier } from './capability-alternatives.ts';
import { recommendOption, capabilityCatalog, detectExistingCapabilities } from './capability-alternatives.ts';

export type ProductKind =
  | 'website'
  | 'saas'
  | 'marketplace'
  | 'dashboard'
  | 'mobile_app'
  | 'game'
  | 'api'
  | 'internal_tool'
  | 'other';

export type VisualDirection =
  | 'minimal'
  | 'premium'
  | 'corporate'
  | 'playful'
  | 'futuristic'
  | 'editorial'
  | 'other';

export type DiscoveryAnswers = {
  productSummary: string;
  productKind: ProductKind;
  audience: string;
  problem: string;
  essentialFeatures: string[];
  laterFeatures: string[];
  hasExistingRepo: boolean;
  isUpgrade: boolean;
  visualDirection: VisualDirection;
  referenceUrl?: string;
  devices: Array<'desktop' | 'tablet' | 'mobile'>;
  mobileFirst: boolean;
  wantUiConcepts: boolean;
  wantLivePreview: boolean;
  preferredFramework?: string;
  needsDatabase: boolean;
  needsAuth: boolean;
  needsPayments: boolean;
  needsEmail: boolean;
  hostingDestination?: string;
  securityNotes?: string;
  budgetTier: BudgetTier;
  budgetAmount?: number | null;
  budgetCurrency?: string | null;
  ownedResources: {
    domain: boolean;
    hosting: boolean;
    database: boolean;
    aiApi: boolean;
    emailProvider: boolean;
    paymentProvider: boolean;
    gitRepo: boolean;
    deploymentAccess: boolean;
  };
  mode: 'discovery' | 'autonomous';
};

export type ProjectStrategy = {
  productObjectives: string[];
  targetUsers: string;
  proposedFeatures: { now: string[]; later: string[] };
  architecture: string[];
  implementationPhases: string[];
  visualDirection: VisualDirection;
  preserveExisting: string[];
  requiredIntegrations: string[];
  estimatedOperatingCosts: string[];
  freeAndPaidAlternatives: Array<{ capability: string; recommendation: string; alternatives: string[] }>;
  securityRequirements: string[];
  testingStrategy: string[];
  deploymentStrategy: string[];
  outstandingRisks: string[];
  assumptions: string[];
};

const KIND_DEFAULTS: Record<ProductKind, { features: string[]; architecture: string[] }> = {
  website: {
    features: ['Marketing pages', 'Contact path', 'Responsive layout'],
    architecture: ['Next.js App Router', 'Static/SSR pages', 'Optional CMS later'],
  },
  saas: {
    features: ['Auth', 'Tenant isolation', 'Billing gate', 'Dashboard'],
    architecture: ['Next.js', 'Supabase Auth + Postgres', 'Webhook-verified billing'],
  },
  marketplace: {
    features: ['Listings', 'Search', 'Seller/buyer accounts', 'Payments'],
    architecture: ['Next.js', 'Supabase', 'Paystack or manual payment fallback'],
  },
  dashboard: {
    features: ['Authenticated views', 'Charts/status', 'Role-aware navigation'],
    architecture: ['Next.js', 'Supabase RLS', 'Server-authorized APIs'],
  },
  mobile_app: {
    features: ['Mobile-first UI', 'API backend', 'Auth'],
    architecture: ['API-first LeonardX backend', 'Mobile client as a later delivery'],
  },
  game: {
    features: ['Playable loop', 'Asset pipeline', 'Leaderboard optional'],
    architecture: ['Client game shell', 'Optional LeonardX API for scores'],
  },
  api: {
    features: ['Documented endpoints', 'API keys', 'Rate limits'],
    architecture: ['Existing LeonardX Developer API patterns', 'OpenAPI contract'],
  },
  internal_tool: {
    features: ['Auth', 'Operational workflows', 'Audit trail'],
    architecture: ['Next.js admin surfaces', 'Supabase + RLS'],
  },
  other: {
    features: ['Core user journey', 'Admin/ops path'],
    architecture: ['Inspect repository and extend existing LeonardX modules'],
  },
};

export function validateDiscoveryAnswers(value: unknown):
  | { ok: true; data: DiscoveryAnswers }
  | { ok: false; error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'Provide discovery answers as an object.' };
  }
  const input = value as Record<string, unknown>;
  const productSummary = typeof input.productSummary === 'string' ? input.productSummary.trim() : '';
  if (productSummary.length < 8 || productSummary.length > 2000) {
    return { ok: false, error: 'Describe what you are building (8–2000 characters).' };
  }
  const productKind = input.productKind as ProductKind;
  if (!KIND_DEFAULTS[productKind]) return { ok: false, error: 'Choose a valid product kind.' };
  const budgetTier = input.budgetTier as BudgetTier;
  if (!['free', 'low', 'moderate', 'professional', 'custom'].includes(budgetTier)) {
    return { ok: false, error: 'Select a development budget.' };
  }
  const mode = input.mode === 'autonomous' ? 'autonomous' : 'discovery';
  const owned = (input.ownedResources && typeof input.ownedResources === 'object'
    ? input.ownedResources
    : {}) as Record<string, unknown>;
  const asBool = (v: unknown) => v === true;
  const asStringList = (v: unknown) =>
    Array.isArray(v) ? v.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, 20) : [];

  return {
    ok: true,
    data: {
      productSummary,
      productKind,
      audience: typeof input.audience === 'string' ? input.audience.trim().slice(0, 500) : 'Not specified',
      problem: typeof input.problem === 'string' ? input.problem.trim().slice(0, 1000) : 'Not specified',
      essentialFeatures: asStringList(input.essentialFeatures),
      laterFeatures: asStringList(input.laterFeatures),
      hasExistingRepo: asBool(input.hasExistingRepo),
      isUpgrade: asBool(input.isUpgrade),
      visualDirection: (['minimal', 'premium', 'corporate', 'playful', 'futuristic', 'editorial', 'other'].includes(String(input.visualDirection))
        ? input.visualDirection
        : 'minimal') as VisualDirection,
      referenceUrl: typeof input.referenceUrl === 'string' ? input.referenceUrl.trim().slice(0, 500) : undefined,
      devices: Array.isArray(input.devices)
        ? input.devices.filter((d): d is 'desktop' | 'tablet' | 'mobile' => ['desktop', 'tablet', 'mobile'].includes(String(d)))
        : ['desktop', 'mobile'],
      mobileFirst: asBool(input.mobileFirst),
      wantUiConcepts: asBool(input.wantUiConcepts),
      wantLivePreview: input.wantLivePreview !== false,
      preferredFramework: typeof input.preferredFramework === 'string' ? input.preferredFramework.trim().slice(0, 80) : undefined,
      needsDatabase: input.needsDatabase !== false,
      needsAuth: asBool(input.needsAuth),
      needsPayments: asBool(input.needsPayments),
      needsEmail: asBool(input.needsEmail),
      hostingDestination: typeof input.hostingDestination === 'string' ? input.hostingDestination.trim().slice(0, 120) : 'Vercel',
      securityNotes: typeof input.securityNotes === 'string' ? input.securityNotes.trim().slice(0, 1000) : undefined,
      budgetTier,
      budgetAmount: typeof input.budgetAmount === 'number' && Number.isFinite(input.budgetAmount) ? input.budgetAmount : null,
      budgetCurrency: typeof input.budgetCurrency === 'string' ? input.budgetCurrency.trim().slice(0, 8).toUpperCase() : null,
      ownedResources: {
        domain: asBool(owned.domain),
        hosting: asBool(owned.hosting),
        database: asBool(owned.database),
        aiApi: asBool(owned.aiApi),
        emailProvider: asBool(owned.emailProvider),
        paymentProvider: asBool(owned.paymentProvider),
        gitRepo: asBool(owned.gitRepo),
        deploymentAccess: asBool(owned.deploymentAccess),
      },
      mode,
    },
  };
}

export function buildProjectStrategy(answers: DiscoveryAnswers, env: NodeJS.ProcessEnv = process.env): ProjectStrategy {
  const defaults = KIND_DEFAULTS[answers.productKind];
  const existing = detectExistingCapabilities(env);
  const catalog = capabilityCatalog(existing);
  const alternatives = catalog.map((requirement) => {
    const pick = recommendOption(requirement, answers.budgetTier);
    return {
      capability: requirement.label,
      recommendation: pick.option ? `${pick.option.title} — ${pick.reason}` : pick.reason,
      alternatives: requirement.options.map((option) => option.title),
    };
  });

  const assumptions: string[] = [];
  if (answers.mode === 'autonomous') {
    assumptions.push('Autonomous mode inferred defaults from the repository and budget selection.');
  }
  if (!answers.ownedResources.aiApi && answers.budgetTier === 'free') {
    assumptions.push('Hosted AI APIs will be avoided until an API key or higher budget is authorized.');
  }
  if (!answers.needsPayments) {
    assumptions.push('Payments are out of scope for the first release.');
  }

  return {
    productObjectives: [
      answers.productSummary,
      `Solve: ${answers.problem}`,
    ],
    targetUsers: answers.audience,
    proposedFeatures: {
      now: answers.essentialFeatures.length ? answers.essentialFeatures : defaults.features,
      later: answers.laterFeatures,
    },
    architecture: [
      ...(answers.preferredFramework ? [`Preferred framework: ${answers.preferredFramework}`] : []),
      ...defaults.architecture,
      answers.hasExistingRepo || answers.isUpgrade
        ? 'Extend the existing LeonardX codebase; do not rewrite from scratch.'
        : 'Bootstrap from LeonardX setup/templates where appropriate.',
    ],
    implementationPhases: [
      'Protect existing work and create a recoverable checkpoint',
      'Finalize discovery answers and approve strategy',
      'Implement core features incrementally',
      'Configure environment variables securely',
      'Validate integrations, database, and tests',
      answers.wantLivePreview ? 'Provide live preview during development' : 'Use staged verification without continuous preview',
      'Deploy only after explicit authorization',
    ],
    visualDirection: answers.visualDirection,
    preserveExisting: [
      'Existing routes, schemas, and authenticated sessions',
      'Supabase migrations and RLS policies',
      'MCP OAuth and build-deploy tooling',
      'Contact, billing, and developer API surfaces already in production',
    ],
    requiredIntegrations: [
      existing.hasSupabase ? 'Supabase (configured)' : 'Supabase (required)',
      answers.needsEmail
        ? (existing.hasResend || existing.hasSmtp || existing.hasWeb3Forms ? 'Email/contact path (partially configured)' : 'Email/contact path (missing)')
        : 'Email optional',
      answers.needsPayments
        ? (existing.hasPaystack ? 'Paystack (configured)' : 'Payments (manual fallback available)')
        : 'Payments not required',
      existing.hasVercel ? 'Vercel (token present)' : 'Vercel (token missing for automated deploy)',
    ],
    estimatedOperatingCosts: [
      answers.budgetTier === 'free'
        ? 'Target near-zero recurring cost; avoid paid APIs unless already owned.'
        : `Budget tier: ${answers.budgetTier}${answers.budgetAmount != null ? ` (${answers.budgetAmount} ${answers.budgetCurrency || ''})` : ''}.`,
      'Supabase and Vercel free tiers may still have usage limits.',
      'Hosted AI and Paystack incur usage/transaction fees when enabled.',
    ],
    freeAndPaidAlternatives: alternatives,
    securityRequirements: [
      'Authenticate and authorize every mutating API',
      'Keep secrets out of NEXT_PUBLIC_ variables, logs, and model prompts',
      'Enforce project isolation and rate limits',
      answers.securityNotes || 'Apply existing LeonardX CSRF/session and RLS patterns',
    ],
    testingStrategy: [
      'Unit tests for discovery, env catalog, workflow transitions, and alternatives',
      'Existing npm test suite must stay green',
      'Integration and deployment checks only against staging when credentials exist',
    ],
    deploymentStrategy: [
      answers.hostingDestination || 'Vercel',
      'Configure environment variables per development/preview/production',
      'Require explicit approval before production deployment',
      'Verify health after deploy; do not equate a URL with production readiness',
    ],
    outstandingRisks: [
      !existing.hasSupabase ? 'Supabase credentials missing' : null,
      answers.needsEmail && !(existing.hasResend || existing.hasSmtp || existing.hasWeb3Forms)
        ? 'Email delivery not configured'
        : null,
      answers.needsPayments && !existing.hasPaystack
        ? 'Paystack not configured; manual payment is the fallback'
        : null,
      !existing.hasVercel ? 'Automated Vercel deployment unavailable without VERCEL_TOKEN' : null,
      answers.wantUiConcepts ? 'UI concept images are not implemented software' : null,
    ].filter((item): item is string => Boolean(item)),
    assumptions,
  };
}
