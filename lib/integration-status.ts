import 'server-only';

export type IntegrationState = 'connected' | 'configured' | 'not_configured' | 'connection_failed' | 'coming_soon' | 'checking';
export type IntegrationId = 'openai' | 'supabase' | 'paystack' | 'web3forms' | 'resend' | 'vercel' | 'github' | 'google' | 'stripe' | 'whatsapp';
export type IntegrationStatus = { id: IntegrationId; name: string; purpose: string; state: IntegrationState; message: string; required: string[]; checkedAt: string | null; canTest: boolean };
type Definition = Omit<IntegrationStatus, 'state' | 'message' | 'checkedAt'> & { env: string[]; check?: () => Promise<void> };
const timeout = (ms = 5000) => AbortSignal.timeout(ms);
async function expectOk(url: string, init?: RequestInit) { const response = await fetch(url, { ...init, signal: timeout(), cache: 'no-store' }); if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}.`); }
const definitions: Definition[] = [
  { id: 'openai', name: 'OpenAI', purpose: 'Powers Leo and enabled AI features.', env: ['OPENAI_API_KEY'], required: ['OPENAI_API_KEY'], canTest: true, check: async () => expectOk('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }) },
  { id: 'supabase', name: 'Supabase', purpose: 'Provides authentication, database, storage, and realtime services.', env: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'], required: ['Supabase URL', 'Supabase anon key', 'Supabase service role key'], canTest: true, check: async () => expectOk(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! } }) },
  { id: 'paystack', name: 'Paystack', purpose: 'Handles Nigerian payment initialization and server-side verification.', env: ['PAYSTACK_PUBLIC_KEY', 'PAYSTACK_SECRET_KEY'], required: ['PAYSTACK_PUBLIC_KEY', 'PAYSTACK_SECRET_KEY'], canTest: true, check: async () => expectOk('https://api.paystack.co/bank?perPage=1', { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }) },
  { id: 'web3forms', name: 'Web3Forms', purpose: 'Delivers contact-page submissions.', env: ['NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY'], required: ['NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY'], canTest: false },
  { id: 'resend', name: 'Resend', purpose: 'Sends transactional payment and hosting notifications.', env: ['RESEND_API_KEY', 'CONTACT_FROM_EMAIL'], required: ['RESEND_API_KEY', 'CONTACT_FROM_EMAIL'], canTest: true, check: async () => expectOk('https://api.resend.com/domains?limit=1', { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } }) },
  { id: 'vercel', name: 'Vercel', purpose: 'Provides deployment and hosting infrastructure.', env: ['VERCEL_TOKEN'], required: ['VERCEL_TOKEN'], canTest: true, check: async () => expectOk('https://api.vercel.com/v2/user', { headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` } }) },
  { id: 'github', name: 'GitHub', purpose: 'Creates repositories and connects source-control operations.', env: ['GITHUB_TOKEN'], required: ['GITHUB_TOKEN'], canTest: true, check: async () => expectOk('https://api.github.com/user', { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } }) },
  { id: 'google', name: 'Google', purpose: 'Supports configured Search Console and Analytics operations.', env: ['GOOGLE_SERVICE_ACCOUNT_JSON', 'GOOGLE_ANALYTICS_PROPERTY_ID'], required: ['GOOGLE_SERVICE_ACCOUNT_JSON', 'GOOGLE_ANALYTICS_PROPERTY_ID'], canTest: false },
  { id: 'stripe', name: 'Stripe', purpose: 'International payments are not implemented in this deployment.', env: [], required: [], canTest: false },
  { id: 'whatsapp', name: 'WhatsApp / Meta', purpose: 'Customer messaging is not implemented in this deployment.', env: [], required: [], canTest: false },
];
function present(name: string) { return Boolean(process.env[name]?.trim()); }
export async function getIntegrationStatuses(target?: IntegrationId): Promise<IntegrationStatus[]> {
  const selected = target ? definitions.filter((item) => item.id === target) : definitions;
  const now = new Date().toISOString();
  return Promise.all(selected.map(async (item): Promise<IntegrationStatus> => {
    if (item.id === 'stripe' || item.id === 'whatsapp') return { ...item, state: 'coming_soon', message: 'This provider has no supported implementation in the current deployment.', checkedAt: null };
    const missing = item.env.filter((name) => !present(name));
    if (missing.length) return { ...item, state: 'not_configured', message: `Missing ${missing.join(', ')}.`, checkedAt: now };
    if (!item.check) return { ...item, state: 'configured', message: 'Configuration is present; no safe live check is available.', checkedAt: now };
    try { await item.check(); return { ...item, state: 'connected', message: 'A safe server-side check succeeded.', checkedAt: now }; }
    catch (error) { const message = error instanceof Error && error.message.startsWith('Provider returned') ? 'The provider rejected the server-side check.' : 'The provider could not be reached safely.'; return { ...item, state: 'connection_failed', message, checkedAt: now }; }
  }));
}
