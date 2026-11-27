-- Add the first-party Gmail OAuth connection provider.
-- OAuth refresh tokens are encrypted in user_integrations. Gmail message access
-- remains scoped to the authenticated user and server-side integration routes.
alter table public.user_integrations
  drop constraint if exists user_integrations_provider_check;
alter table public.user_integrations
  add constraint user_integrations_provider_check check (provider in (
    'github','vercel','supabase','firebase','openai','anthropic','google_gemini',
    'whatsapp_business','meta','youtube','gmail','custom_mcp'
  ));

alter table public.integration_oauth_states
  drop constraint if exists integration_oauth_states_provider_check;
alter table public.integration_oauth_states
  add constraint integration_oauth_states_provider_check check (provider in (
    'github','vercel','firebase','youtube','gmail','meta','whatsapp_business'
  ));
