-- Unified profile-based onboarding. Authorization role remains separate from the user's work role.
alter table public.profiles
  add column if not exists onboarding_completed boolean not null default false,
  add column if not exists onboarding_role text,
  add column if not exists company_size text,
  add column if not exists theme_preference text not null default 'light',
  add column if not exists email_opt_out boolean not null default false;

alter table public.profiles
  drop constraint if exists profiles_onboarding_theme_preference_check;
alter table public.profiles
  add constraint profiles_onboarding_theme_preference_check
  check (theme_preference in ('light', 'dark'));

alter table public.profiles
  drop constraint if exists profiles_onboarding_role_check;
alter table public.profiles
  add constraint profiles_onboarding_role_check
  check (onboarding_role is null or onboarding_role in ('developer', 'founder', 'designer', 'student', 'business', 'other'));

alter table public.profiles
  drop constraint if exists profiles_company_size_check;
alter table public.profiles
  add constraint profiles_company_size_check
  check (company_size is null or company_size in ('just_me', '2_10', '11_50', '51_200', '201_plus'));
