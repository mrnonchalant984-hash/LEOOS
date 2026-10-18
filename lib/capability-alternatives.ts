/**
 * Budget-aware capability selection for LeonardX integrations.
 * Never silently substitutes a weaker option as "complete".
 */

export type BudgetTier = 'free' | 'low' | 'moderate' | 'professional' | 'custom';

export type CapabilityId = 'contact_form' | 'email_delivery' | 'ai_inference' | 'payments' | 'hosting' | 'database';

export type CapabilityOption = {
  id: string;
  title: string;
  costLabel: string;
  advantages: string[];
  limitations: string[];
  requiresPaidService: boolean;
  alreadyImplemented: boolean;
  envVars: string[];
  minimumBudget: BudgetTier;
};

export type CapabilityRequirement = {
  capability: CapabilityId;
  label: string;
  description: string;
  options: CapabilityOption[];
};

const BUDGET_RANK: Record<BudgetTier, number> = {
  free: 0,
  low: 1,
  moderate: 2,
  professional: 3,
  custom: 3,
};

export const BUDGET_OPTIONS: { id: BudgetTier; label: string; description: string }[] = [
  { id: 'free', label: 'Free / minimal-cost', description: 'Prefer open-source and already-configured services.' },
  { id: 'low', label: 'Low-budget', description: 'Allow small usage-based fees when necessary.' },
  { id: 'moderate', label: 'Moderate-budget', description: 'Balance reliability and recurring cost.' },
  { id: 'professional', label: 'Professional production', description: 'Prioritize production reliability and support.' },
  { id: 'custom', label: 'Custom budget', description: 'Enter an exact amount and currency.' },
];

export function capabilityCatalog(existing: {
  hasResend: boolean;
  hasSmtp: boolean;
  hasWeb3Forms: boolean;
  hasSupabase: boolean;
  hasPaystack: boolean;
  hasOpenAI: boolean;
  hasVercel: boolean;
}): CapabilityRequirement[] {
  return [
    {
      capability: 'contact_form',
      label: 'Contact form with delivery',
      description: 'Collect inquiries and optionally notify the owner by email.',
      options: [
        {
          id: 'existing_email',
          title: 'Existing email provider (Resend or SMTP)',
          costLabel: 'Depends on the existing account and usage.',
          advantages: ['Integrates with the current LeonardX contact/lead paths.', 'Server-side delivery with authenticated credentials.'],
          limitations: ['Requires a configured Resend or SMTP account.', 'Delivery success should be verified separately from form save.'],
          requiresPaidService: !existing.hasResend && !existing.hasSmtp,
          alreadyImplemented: existing.hasResend || existing.hasSmtp,
          envVars: existing.hasSmtp
            ? ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'CONTACT_EMAIL']
            : ['RESEND_API_KEY', 'CONTACT_FROM_EMAIL', 'CONTACT_EMAIL'],
          minimumBudget: 'free',
        },
        {
          id: 'web3forms',
          title: 'Web3Forms',
          costLabel: 'Verify the current provider plan and rate limits.',
          advantages: ['Simple browser submission using a public access key.', 'Already wired as an optional LeonardX contact path.'],
          limitations: ['Public access key is not a private secret.', 'Email delivery verification is separate from form save.', 'Rate limits may return HTTP 429.'],
          requiresPaidService: false,
          alreadyImplemented: existing.hasWeb3Forms,
          envVars: ['NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY'],
          minimumBudget: 'free',
        },
        {
          id: 'database_only',
          title: 'Secure database-backed submission',
          costLabel: 'Depends on existing Supabase and hosting.',
          advantages: ['Uses the existing contacts table and RLS-backed persistence.', 'No additional email vendor required.'],
          limitations: ['Does not itself guarantee email delivery.', 'Owner must check saved submissions in the dashboard.'],
          requiresPaidService: false,
          alreadyImplemented: existing.hasSupabase,
          envVars: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
          minimumBudget: 'free',
        },
        {
          id: 'temporary_no_email',
          title: 'Temporary form without email delivery',
          costLabel: 'Database and hosting only.',
          advantages: ['Unblocks discovery and UX work while email is pending.'],
          limitations: ['Must not be described as complete email delivery.', 'Acceptable only when the user approves the limitation.'],
          requiresPaidService: false,
          alreadyImplemented: existing.hasSupabase,
          envVars: [],
          minimumBudget: 'free',
        },
      ],
    },
    {
      capability: 'ai_inference',
      label: 'AI inference',
      description: 'Model-backed planning, chat, and generation.',
      options: [
        {
          id: 'openai',
          title: 'OpenAI (existing LeonardX path)',
          costLabel: 'Usage-based; explain recurring cost before enabling.',
          advantages: ['Already integrated for Leo chat and generation.'],
          limitations: ['Requires an API key and usage budget.', 'Never purchase without explicit authorization.'],
          requiresPaidService: true,
          alreadyImplemented: existing.hasOpenAI,
          envVars: ['OPENAI_API_KEY'],
          minimumBudget: 'low',
        },
        {
          id: 'local_model',
          title: 'Local OpenAI-compatible endpoint',
          costLabel: 'Hardware and self-hosting costs only.',
          advantages: ['Works with LEO_LOCAL_MODEL_URL and offline mode.', 'Avoids hosted API spend.'],
          limitations: ['Vercel-hosted apps cannot reach localhost on a laptop.', 'Quality and latency depend on the local model.'],
          requiresPaidService: false,
          alreadyImplemented: false,
          envVars: ['LEO_LOCAL_MODEL_URL', 'LEO_LOCAL_MODEL_NAME'],
          minimumBudget: 'free',
        },
      ],
    },
    {
      capability: 'payments',
      label: 'Payments',
      description: 'Checkout and subscription verification.',
      options: [
        {
          id: 'paystack',
          title: 'Paystack (existing)',
          costLabel: 'Provider fees apply on successful charges.',
          advantages: ['Already implemented with webhook verification.'],
          limitations: ['Requires public and secret keys.', 'Stripe is not implemented in this deployment.'],
          requiresPaidService: true,
          alreadyImplemented: existing.hasPaystack,
          envVars: ['PAYSTACK_PUBLIC_KEY', 'PAYSTACK_SECRET_KEY'],
          minimumBudget: 'moderate',
        },
        {
          id: 'manual_email',
          title: 'Manual email payment request',
          costLabel: 'No payment-provider fees.',
          advantages: ['Uses the existing /payment/manual flow.', 'Suitable for low-budget launches.'],
          limitations: ['No automatic entitlement unlock.', 'Requires operator follow-up.'],
          requiresPaidService: false,
          alreadyImplemented: true,
          envVars: ['CONTACT_EMAIL', 'OWNER_EMAIL'],
          minimumBudget: 'free',
        },
      ],
    },
    {
      capability: 'hosting',
      label: 'Hosting and deployment',
      description: 'Publish preview and production builds.',
      options: [
        {
          id: 'vercel',
          title: 'Vercel (existing LeonardX path)',
          costLabel: 'Depends on the Vercel plan and usage.',
          advantages: ['Existing GitHub/Vercel build-deploy pipeline.', 'Environment variable APIs for secure configuration.'],
          limitations: ['Requires VERCEL_TOKEN and usually GITHUB_TOKEN.', 'Production deploy needs explicit approval.'],
          requiresPaidService: false,
          alreadyImplemented: existing.hasVercel,
          envVars: ['VERCEL_TOKEN', 'GITHUB_TOKEN'],
          minimumBudget: 'free',
        },
      ],
    },
    {
      capability: 'database',
      label: 'Database',
      description: 'Auth, persistence, and migrations.',
      options: [
        {
          id: 'supabase',
          title: 'Supabase Postgres (existing)',
          costLabel: 'Depends on the Supabase plan.',
          advantages: ['Existing schema, RLS, and migrations.', 'Auth already integrated.'],
          limitations: ['Migrations must be reviewed before production apply.'],
          requiresPaidService: false,
          alreadyImplemented: existing.hasSupabase,
          envVars: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
          minimumBudget: 'free',
        },
      ],
    },
  ];
}

export function optionsAffordableForBudget(
  options: CapabilityOption[],
  budget: BudgetTier,
): CapabilityOption[] {
  const rank = BUDGET_RANK[budget];
  return options.filter((option) => BUDGET_RANK[option.minimumBudget] <= rank);
}

export function recommendOption(
  requirement: CapabilityRequirement,
  budget: BudgetTier,
): { option: CapabilityOption | null; reason: string; unavailablePaid: CapabilityOption[] } {
  const affordable = optionsAffordableForBudget(requirement.options, budget);
  const implemented = affordable.find((option) => option.alreadyImplemented);
  if (implemented) {
    return {
      option: implemented,
      reason: `${implemented.title} is already available in this deployment.`,
      unavailablePaid: requirement.options.filter((option) => !affordable.includes(option)),
    };
  }
  const freeFirst = affordable.find((option) => !option.requiresPaidService) || affordable[0] || null;
  return {
    option: freeFirst,
    reason: freeFirst
      ? `${freeFirst.title} fits the selected budget.`
      : 'No option fits the selected budget without additional authorization.',
    unavailablePaid: requirement.options.filter((option) => !affordable.includes(option)),
  };
}

export function detectExistingCapabilities(env: NodeJS.ProcessEnv = process.env) {
  return {
    hasResend: Boolean(env.RESEND_API_KEY?.trim()),
    hasSmtp: Boolean(env.SMTP_HOST?.trim() && env.SMTP_USER?.trim() && env.SMTP_PASS?.trim()),
    hasWeb3Forms: Boolean(env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY?.trim()),
    hasSupabase: Boolean(
      env.NEXT_PUBLIC_SUPABASE_URL?.trim()
      && env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
      && env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
    ),
    hasPaystack: Boolean(env.PAYSTACK_SECRET_KEY?.trim() && env.PAYSTACK_PUBLIC_KEY?.trim()),
    hasOpenAI: Boolean(env.OPENAI_API_KEY?.trim() || env.LEO_API_KEY?.trim()),
    hasVercel: Boolean(env.VERCEL_TOKEN?.trim()),
  };
}
