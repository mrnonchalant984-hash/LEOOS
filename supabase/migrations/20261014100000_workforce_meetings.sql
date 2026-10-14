-- LeonardX workforce meeting persistence. Apply through the existing Supabase migration workflow.
-- No existing production rows are modified or dropped by this migration.
create table if not exists public.workforce_meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (length(title) between 2 and 160),
  objective text not null check (length(objective) between 5 and 5000),
  agenda jsonb not null default '[]'::jsonb,
  participants jsonb not null default '[]'::jsonb,
  room_layout text not null default 'conference' check (room_layout in ('conference','boardroom','discussion')),
  status text not null default 'scheduled' check (status in ('scheduled','in_progress','completed','paused','cancelled','failed')),
  summary text,
  decisions jsonb not null default '[]'::jsonb,
  action_items jsonb not null default '[]'::jsonb,
  model text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_workforce_meetings_user_created on public.workforce_meetings(user_id, created_at desc);
create index if not exists idx_workforce_meetings_user_status on public.workforce_meetings(user_id, status, updated_at desc);
alter table public.workforce_meetings enable row level security;
drop policy if exists workforce_meetings_self on public.workforce_meetings;
create policy workforce_meetings_self on public.workforce_meetings for all using (auth.uid() = user_id or public.is_owner(auth.uid())) with check (auth.uid() = user_id or public.is_owner(auth.uid()));

create table if not exists public.workforce_meeting_messages (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.workforce_meetings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  speaker_id text not null,
  speaker_name text not null,
  speaker_role text not null,
  message text not null check (length(message) between 1 and 12000),
  message_type text not null default 'contribution' check (message_type in ('contribution','moderator_summary','user_note','system')),
  turn_index integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_workforce_meeting_messages_meeting on public.workforce_meeting_messages(meeting_id, turn_index, created_at);
alter table public.workforce_meeting_messages enable row level security;
drop policy if exists workforce_meeting_messages_self on public.workforce_meeting_messages;
create policy workforce_meeting_messages_self on public.workforce_meeting_messages for all using (auth.uid() = user_id or public.is_owner(auth.uid())) with check (auth.uid() = user_id or public.is_owner(auth.uid()));

create table if not exists public.workforce_meeting_action_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.workforce_meetings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (length(title) between 2 and 200),
  description text not null default '',
  suggested_role_id text,
  priority text not null default 'medium' check (priority in ('low','medium','high','critical')),
  status text not null default 'proposed' check (status in ('proposed','approved','task_created','dismissed')),
  linked_run_id uuid references public.agent_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_workforce_meeting_actions_user on public.workforce_meeting_action_items(user_id, meeting_id, created_at);
alter table public.workforce_meeting_action_items enable row level security;
drop policy if exists workforce_meeting_action_items_self on public.workforce_meeting_action_items;
create policy workforce_meeting_action_items_self on public.workforce_meeting_action_items for all using (auth.uid() = user_id or public.is_owner(auth.uid())) with check (auth.uid() = user_id or public.is_owner(auth.uid()));

-- Persistent one-to-one conversations with role-defined AI specialists.
create table if not exists public.workforce_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id text not null,
  role_name text not null,
  title text not null default 'Engineer conversation' check (length(title) between 2 and 160),
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_workforce_conversations_user_updated on public.workforce_conversations(user_id, updated_at desc);
alter table public.workforce_conversations enable row level security;
drop policy if exists workforce_conversations_self on public.workforce_conversations;
create policy workforce_conversations_self on public.workforce_conversations for all using (auth.uid() = user_id or public.is_owner(auth.uid())) with check (auth.uid() = user_id or public.is_owner(auth.uid()));

create table if not exists public.workforce_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.workforce_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id text not null,
  speaker text not null check (speaker in ('user','assistant','system')),
  content text not null check (length(content) between 1 and 12000),
  created_at timestamptz not null default now()
);
create index if not exists idx_workforce_conversation_messages_history on public.workforce_conversation_messages(conversation_id, created_at);
alter table public.workforce_conversation_messages enable row level security;
drop policy if exists workforce_conversation_messages_self on public.workforce_conversation_messages;
create policy workforce_conversation_messages_self on public.workforce_conversation_messages for all using (auth.uid() = user_id or public.is_owner(auth.uid())) with check (auth.uid() = user_id or public.is_owner(auth.uid()));
