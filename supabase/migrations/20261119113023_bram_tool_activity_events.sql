-- Persist truthful Bram tool lifecycle events for the authenticated chat session.
create table if not exists public.bram_tool_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  request_id uuid not null,
  tool_name text not null check (char_length(tool_name) between 1 and 120),
  event_type text not null check (event_type in ('started','completed','failed')),
  status text not null check (status in ('running','succeeded','failed')),
  is_error boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists bram_tool_events_session_idx
  on public.bram_tool_events(user_id, session_id, id desc);
alter table public.bram_tool_events enable row level security;
drop policy if exists "Users read own Bram tool events" on public.bram_tool_events;
create policy "Users read own Bram tool events" on public.bram_tool_events
  for select to authenticated using (auth.uid() = user_id);
grant select on public.bram_tool_events to authenticated;
grant select, insert on public.bram_tool_events to service_role;
