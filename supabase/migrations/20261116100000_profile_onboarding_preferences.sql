alter table public.profiles
  add column if not exists workspace_style text not null default 'light',
  add column if not exists product_news_opt_out boolean not null default false,
  add column if not exists onboarding_role text,
  add column if not exists onboarding_team_size text,
  add column if not exists onboarding_completed boolean not null default false,
  add column if not exists onboarding_completed_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_workspace_style_check,
  add constraint profiles_workspace_style_check
    check (workspace_style in ('light', 'dark'));

alter table public.profiles
  drop constraint if exists profiles_onboarding_role_check,
  add constraint profiles_onboarding_role_check
    check (onboarding_role is null or onboarding_role in (
      'Founder', 'Full-Stack Developer', 'Frontend / UI Designer', 'Product Builder',
      'Agency / Freelancer', 'Indie Hacker', 'Technical Lead', 'Exploring / Other'
    ));

alter table public.profiles
  drop constraint if exists profiles_onboarding_team_size_check,
  add constraint profiles_onboarding_team_size_check
    check (onboarding_team_size is null or onboarding_team_size in (
      'Solo Builder', '2–9 Team', '10–99 Company', '100–999 Company', '1,000+ Company'
    ));

create index if not exists profiles_onboarding_pending_idx
  on public.profiles (onboarding_completed, id);
