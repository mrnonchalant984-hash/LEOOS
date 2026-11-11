create table if not exists public.research_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  query text not null check (char_length(query) between 1 and 4000),
  report text not null,
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  model text not null,
  provider text not null,
  created_at timestamptz not null default now()
);
create index if not exists research_reports_user_created_idx on public.research_reports(user_id, created_at desc);
alter table public.research_reports enable row level security;
drop policy if exists "Users read own research reports" on public.research_reports;
create policy "Users read own research reports" on public.research_reports for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users insert own research reports" on public.research_reports;
create policy "Users insert own research reports" on public.research_reports for insert to authenticated with check (auth.uid() = user_id);
grant select, insert on public.research_reports to authenticated;
grant select, insert on public.research_reports to service_role;
