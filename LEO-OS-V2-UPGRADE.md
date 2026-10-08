# LEO OS V2 Upgrade

This archive upgrades the existing LEO OS project without replacing its core architecture.

## Included in this upgrade

- Premium LEO OS platform visual system
- Global application shell and responsive navigation
- Platform-oriented homepage
- Agent control center with real agent registry/run data
- Integration center with configuration-aware provider states
- Observability page using recorded events, AI usage and agent runs
- Analytics page using real dashboard data
- Deployment center using existing website deployment records
- Developer portal foundation
- API v1 documentation and authenticated API routes
- API key creation with hashed server-side storage
- Webhook architecture page
- Organization/team architecture page
- System status page without fabricated uptime
- Documentation and support surfaces
- Additive Supabase schema for API keys, system events, errors, background tasks, webhooks and organizations
- 3D/motion-friendly global design system
- Mobile navigation and reduced-motion support
- Public navigation repositioned from portfolio-first to LEO OS platform-first
- WhatsApp CTA removed from the primary public navigation

## Existing systems preserved

The upgrade keeps the existing Leo assistant, Supabase, OpenAI, Paystack, Vercel, project/website builder, credits, subscriptions, admin/training and multi-agent architecture.

## Provider reality

Google, Meta/WhatsApp and Stripe are not marked connected unless their actual server-side configuration exists. External provider approval still has to be completed outside the repository.

## Required Supabase step

Apply the additive SQL at the end of `supabase/schema.sql` to the target database. It creates the V2 platform control-plane tables and RLS policies.

## Environment safety

The distributable archive intentionally excludes `.env.local` and the `.git` directory. Use `.env.example` and your deployment secret manager for credentials.

## V2 production hardening
The V2 control plane now includes distributed API rate limiting, encrypted webhook secrets, real HMAC webhook test delivery, queued webhook retries, a Vercel cron worker, security-event storage, stronger request validation and production security headers. See `LEO-OS-V2-HARDENING.md` and run the one-time `supabase/LEO-OS-V2-ONE-TIME-MIGRATION.sql` migration after the original schema.
